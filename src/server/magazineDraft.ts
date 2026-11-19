import "server-only";
import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readSource, unzipEntry, MAX_FILE_BYTES } from "./lessonDraft";
import { askForJson, keyCounts } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { GuideDocError, PAGE_TEMPLATES, blanksOf, isSiteMedia, readGuideDoc, type Page, type PageTemplate } from "@/lib/magazine";
import { safeHref } from "@/lib/richText";

/*
  Drafting a Magazine with Claude, as the PRD sets out: the author uploads source documents (PDF, Word,
  PowerPoint or text) and says what learners should be able to do and how long the whole course should
  take. Claude proposes a course outline first (pages, their purpose, teaching pattern, time, interaction
  and the sources each uses, with what's missing); the author edits and approves it; then each page is
  generated on its own. The time target shapes the outline (how many pages, and how long each is) and
  each page (how much it holds).

  Nothing here changes the draft: a generated page goes back to the editor, which adds it as one change
  the author can undo, so a retry or a failed page never touches what they've written. Claims carry
  their source; made-up cases are flagged "illustrative"; anything without enough support is flagged
  "verify", which holds publishing until someone checks it.
*/

export const MAX_SOURCES = 6;
export const MAX_COURSE_MINUTES = 240;
const MAX_PAGES = 10;
const MAX_TEXT = 150_000;

export type SourceRow = {
  id: string;
  guide_id: string;
  name: string;
  kind: "pdf" | "text";
  content: string;
  pages: number | null;
  slides: number | null;
  words: number | null;
  bytes: number;
  authority: "authoritative" | "background";
  status: "ready" | "error";
  error: string | null;
  uploaded_at: string;
};

/** A page Claude proposes in the outline, as the author reviews and edits it. */
export type OutlinePage = {
  title: string;
  purpose: string;
  template: PageTemplate;
  minutes: number;
  required: boolean;
  /** The practice on the page, or "" when it doesn't need one. */
  interaction: string;
  /** The source documents the page draws on, by name. */
  sources: string[];
  /** What the sources don't give and the author should supply (an effective date, a real example...). */
  missing: string[];
};

export type DraftProgress =
  | { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number }
  | { type: "count"; what: "pages" | "sections" | "blocks"; n: number };

export const rid = (prefix: string) => `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function requireGuide(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  const g = db.prepare("SELECT id, title, standfirst, audience FROM magazine_guides WHERE id = ? AND status != 'archived'").get(guideId) as
    { id: string; title: string; standfirst: string; audience: string } | undefined;
  if (!g) throw new HttpError(404, "Guide not found.");
  return g;
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

const sourceView = (s: SourceRow) => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  pages: s.pages,
  slides: s.slides,
  words: s.words,
  authority: s.authority,
  status: s.status,
  error: s.error,
  uploadedAt: s.uploaded_at,
});
export type SourceView = ReturnType<typeof sourceView>;

const sourcesOf = (db: Db, guideId: string) =>
  db.prepare("SELECT * FROM magazine_sources WHERE guide_id = ? ORDER BY uploaded_at, rowid").all(guideId) as SourceRow[];

/** The course's uploaded documents as Claude reads them, authoritative ones first. */
export const sourceDocuments = (db: Db, guideId: string) => documents(sourcesOf(db, guideId));

/** The slides' text from a PowerPoint file, each marked "[Slide n]" so a claim can point at its slide. */
function pptxText(buf: Buffer) {
  const slides: string[] = [];
  for (let n = 1; n <= 500; n++) {
    const xml = unzipEntry(buf, `ppt/slides/slide${n}.xml`);
    if (xml === null) break;
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
      .map((m) => m[1])
      .join(" ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
    slides.push(`[Slide ${n}]\n${text}`);
  }
  return slides;
}

/**
  Reads an uploaded source and keeps what could be read. A file that can't be read is kept too, marked
  with why, so the author sees which one and nothing claims its content supports the draft.
*/
export async function addSource(db: Db, actor: User, guideId: string, file: File, now: Date) {
  requireGuide(db, actor, guideId);
  if (sourcesOf(db, guideId).filter((s) => s.status === "ready").length >= MAX_SOURCES)
    throw new HttpError(400, `Use up to ${MAX_SOURCES} documents. Remove one to add another.`);
  const name = (file.name || "document").slice(0, 120);
  const row = {
    id: rid("src"),
    name,
    kind: "text" as "pdf" | "text",
    content: "",
    pages: null as number | null,
    slides: null as number | null,
    words: null as number | null,
  };
  let error: string | null = null;
  try {
    if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "It’s over 15 MB. Try a shorter document, or the part you need.");
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.pptx$/i.test(name) || (buf[0] === 0x50 && buf[1] === 0x4b && unzipEntry(buf, "ppt/presentation.xml") !== null)) {
      const slides = pptxText(buf);
      if (!slides.length) throw new HttpError(415, "No slides could be read from it.");
      row.content = slides.join("\n\n").slice(0, MAX_TEXT);
      row.slides = slides.length;
      row.words = words(row.content);
    } else {
      const s = await readSource(new File([buf], name, { type: file.type }));
      if (s.kind === "pdf") {
        row.kind = "pdf";
        row.content = s.data;
        row.pages = (buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length || null;
      } else {
        row.content = s.text;
        row.words = words(s.text);
      }
    }
    // A scanned document with no text layer can't be read as text: say so rather than pretend.
    if (row.kind === "text" && (row.words ?? 0) < 20)
      throw new HttpError(415, "Almost no text could be read from it. If it’s a scan, export it as a PDF with text, or paste the key part into the brief.");
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    error = e.message;
  }
  db.prepare(
    `INSERT INTO magazine_sources (id, guide_id, name, kind, content, pages, slides, words, bytes, status, error, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    guideId,
    name,
    row.kind,
    error ? "" : row.content,
    row.pages,
    row.slides,
    row.words,
    file.size,
    error ? "error" : "ready",
    error,
    actor.id,
    now.toISOString(),
  );
  return sourceView(db.prepare("SELECT * FROM magazine_sources WHERE id = ?").get(row.id) as SourceRow);
}

export function updateSource(db: Db, actor: User, guideId: string, sourceId: string, input: { authority?: unknown }) {
  requireGuide(db, actor, guideId);
  if (input.authority !== "authoritative" && input.authority !== "background") throw new HttpError(400, "Choose authoritative or background.");
  const r = db.prepare("UPDATE magazine_sources SET authority = ? WHERE id = ? AND guide_id = ?").run(input.authority, sourceId, guideId);
  if (!r.changes) throw new HttpError(404, "Document not found.");
  return sourceView(db.prepare("SELECT * FROM magazine_sources WHERE id = ?").get(sourceId) as SourceRow);
}

export function removeSource(db: Db, actor: User, guideId: string, sourceId: string) {
  requireGuide(db, actor, guideId);
  const r = db.prepare("DELETE FROM magazine_sources WHERE id = ? AND guide_id = ?").run(sourceId, guideId);
  if (!r.changes) throw new HttpError(404, "Document not found.");
}

// ---------------------------------------------------------------------------------------------
// The plan: brief, time and outline
// ---------------------------------------------------------------------------------------------

type PlanRow = { guide_id: string; brief: string; minutes: number | null; outline: string | null; questions: string; updated_at: string };

/** The AI draft so far: documents, brief, time target and outline. */
export function draftPlan(db: Db, actor: User, guideId: string) {
  requireGuide(db, actor, guideId);
  const p = db.prepare("SELECT * FROM magazine_plans WHERE guide_id = ?").get(guideId) as PlanRow | undefined;
  return {
    sources: sourcesOf(db, guideId).map(sourceView),
    brief: p?.brief ?? "",
    minutes: p?.minutes ?? null,
    outline: p?.outline ? (JSON.parse(p.outline) as OutlinePage[]) : null,
    questions: JSON.parse(p?.questions ?? "[]") as string[],
  };
}

const cleanMinutes = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 2 || n > MAX_COURSE_MINUTES) throw new HttpError(400, `Set a time between 2 and ${MAX_COURSE_MINUTES} minutes.`);
  return n;
};
const cleanBrief = (v: unknown) => {
  const b = String(v ?? "").trim();
  if (b.length > 4000) throw new HttpError(400, "Keep the brief to 4,000 characters.");
  return b;
};

/** Problems with an outline (Claude's or the author's edit), or none. Its times should add up to about the target. */
export function outlineIssues(value: unknown, target: number | null, sourceNames: string[]): string[] {
  const o = value as { pages?: unknown };
  const pages = Array.isArray(o?.pages) ? (o.pages as Record<string, unknown>[]) : null;
  if (!pages) return ['The reply needs a "pages" list.'];
  const issues: string[] = [];
  if (!pages.length) issues.push("The outline needs at least one page.");
  if (pages.length > MAX_PAGES) issues.push(`Keep it to ${MAX_PAGES} pages or fewer.`);
  pages.forEach((p, i) => {
    const at = `Page ${i + 1}`;
    if (typeof p.title !== "string" || !p.title.trim()) issues.push(`${at} needs a title.`);
    if (typeof p.purpose !== "string" || !p.purpose.trim()) issues.push(`${at} needs a purpose.`);
    if (typeof p.template !== "string" || !(p.template in PAGE_TEMPLATES) || p.template === "blank")
      issues.push(`${at}: template must be decide, do, notice, adapt or say.`);
    if (typeof p.minutes !== "number" || p.minutes < 1 || p.minutes > 60) issues.push(`${at}: minutes must be a number from 1 to 60.`);
    for (const s of Array.isArray(p.sources) ? p.sources : [])
      if (!sourceNames.includes(String(s))) issues.push(`${at}: “${String(s)}” isn’t one of the documents.`);
  });
  if (target && pages.length) {
    const total = pages.reduce((n, p) => n + (typeof p.minutes === "number" ? p.minutes : 0), 0);
    if (total < target * 0.75 || total > target * 1.25)
      issues.push(`The pages add up to ${total} minutes; the course should take about ${target}. Change the number of pages or their times.`);
  }
  return issues;
}

function cleanOutline(value: unknown): OutlinePage[] {
  const pages = ((value as { pages?: unknown[] })?.pages ?? []) as Record<string, unknown>[];
  return pages.slice(0, MAX_PAGES).map((p) => ({
    title: String(p.title ?? "")
      .trim()
      .slice(0, 120),
    purpose: String(p.purpose ?? "")
      .trim()
      .slice(0, 400),
    template: (typeof p.template === "string" && p.template in PAGE_TEMPLATES ? p.template : "blank") as PageTemplate,
    minutes: Math.min(60, Math.max(1, Math.round(Number(p.minutes) || 5))),
    required: p.required !== false,
    interaction: String(p.interaction ?? "")
      .trim()
      .slice(0, 300),
    sources: (Array.isArray(p.sources) ? p.sources : []).map(String).slice(0, MAX_SOURCES),
    missing: (Array.isArray(p.missing) ? p.missing : []).map(String).filter(Boolean).slice(0, 8),
  }));
}

function savePlan(
  db: Db,
  actor: User,
  guideId: string,
  plan: { brief: string; minutes: number | null; outline: OutlinePage[] | null; questions: string[] },
  now: Date,
) {
  db.prepare(
    `INSERT INTO magazine_plans (guide_id, brief, minutes, outline, questions, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guide_id) DO UPDATE SET brief = excluded.brief, minutes = excluded.minutes, outline = excluded.outline, questions = excluded.questions,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(guideId, plan.brief, plan.minutes, plan.outline ? JSON.stringify(plan.outline) : null, JSON.stringify(plan.questions), actor.id, now.toISOString());
}

/** Keeps the author's edits to the brief, time and outline. */
export function updatePlan(db: Db, actor: User, guideId: string, input: { brief?: unknown; minutes?: unknown; outline?: unknown }, now: Date) {
  const current = draftPlan(db, actor, guideId);
  const outline = input.outline === undefined ? current.outline : input.outline === null ? null : cleanOutline({ pages: input.outline });
  const plan = {
    brief: input.brief === undefined ? current.brief : cleanBrief(input.brief),
    minutes: input.minutes === undefined ? current.minutes : cleanMinutes(input.minutes),
    outline,
    questions: current.questions,
  };
  savePlan(db, actor, guideId, plan, now);
  return draftPlan(db, actor, guideId);
}

// ---------------------------------------------------------------------------------------------
// Asking Claude
// ---------------------------------------------------------------------------------------------

/**
  The documents for Claude, authoritative ones first, each titled with its standing. The last one is
  cached, since the outline and every page are asked against the same documents.
*/
function documents(sources: SourceRow[]): Anthropic.Beta.BetaContentBlockParam[] {
  const ready = sources.filter((s) => s.status === "ready").sort((a, b) => (a.authority === b.authority ? 0 : a.authority === "authoritative" ? -1 : 1));
  return ready.map((s, i) => {
    const title = `${s.name} (${s.authority === "authoritative" ? "authoritative source" : "background only"})`;
    const cache = i === ready.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {};
    return s.kind === "pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: s.content }, title, ...cache }
      : { type: "document" as const, source: { type: "text" as const, media_type: "text/plain" as const, data: s.content }, title, ...cache };
  });
}

const AUDIENCE: Record<string, string> = {
  coordinator: "care coordinators who plan and manage older clients' Support at Home services",
  partner: "Care Partners: cleaners, gardeners and other providers who visit older clients at home",
  staff: "Trilogy Care staff",
};
export const audienceText = (json: string) => {
  const a = (JSON.parse(json) as string[]).map((x) => AUDIENCE[x]).filter(Boolean);
  return a.length ? a.join("; and ") : "everyone at Trilogy Care's Partner Hub: care coordinators and Care Partners";
};

export const RULES = `Rules for everything you write:
- Australian English, plain language, short sentences. Address the reader as "you".
- Never invent rates, dollar amounts, dates, timeframes, policy requirements, approval rules, clinical instructions, pass marks or links. If the documents don't give a detail the page needs, leave it out and list it as missing, or flag it for verification.
- Where documents disagree, don't pick one silently: say so and flag it for verification.
- Use fictional, de-identified people in examples. Never reuse a real client's details from the documents.
- Prefer a meaningful decision or practice to decoration. Don't add a quiz to every page.
- Background-only documents give context; don't rest a factual or policy claim on them alone.`;

const TEMPLATE_GUIDE = Object.entries(PAGE_TEMPLATES)
  .filter(([k]) => k !== "blank")
  .map(([k, t]) => `- ${k}: ${t.title}. The learner should be able to: ${t.action} Pattern: ${t.pattern}.`)
  .join("\n");

/** The prompt for the course outline. */
export function outlinePrompt(input: { title: string; standfirst: string; audience: string; brief: string; minutes: number | null; sourceNames: string[] }) {
  return `You are planning a Magazine course for Trilogy Care's Partner Hub, a training site for Australian aged care. A Magazine course is a short series of pages read at a desk. Each page is a substantial article with one clear purpose and its own teaching pattern; it is not a slide.

Working title: ${input.title || "(none yet)"}
What learners should be able to do at the end: ${input.standfirst || "(see the brief)"}
Who it's for: ${input.audience}
${input.minutes ? `Time: the whole course should take about ${input.minutes} minutes. Plan the number of pages and each page's time so they add up to about ${input.minutes} minutes (within a quarter either way). A page is usually 3 to 12 minutes; a short course may be a single page.` : "Time: not set. Keep it as short as the purpose allows."}

The author's brief:
<brief>
${input.brief || "(no brief: work from the documents and the title)"}
</brief>

${input.sourceNames.length ? `Documents attached: ${input.sourceNames.map((n) => `"${n}"`).join(", ")}. Map what they cover to pages, and say which documents each page uses.` : "No documents are attached. Plan from the brief, and list what the author needs to supply."}

Teaching patterns (choose one per page, for what the learner should be able to do on it):
${TEMPLATE_GUIDE}

Move from context to application. Don't repeat the same hook, case or question on every page. Don't invent a page just to fill time: if the material isn't there, say what's missing.

${RULES}

Reply with only a JSON object, no other text:
{
  "pages": [
    {
      "title": "Short page title",
      "purpose": "One sentence: what the learner will do on this page",
      "template": "decide" | "do" | "notice" | "adapt" | "say",
      "minutes": 6,
      "required": true,
      "interaction": "The practice on the page (e.g. a decision about a mismatched invoice), or an empty string",
      "sources": ["exact document name"],
      "missing": ["what the documents don't give that this page needs"]
    }
  ],
  "questions": ["anything you need the author to answer"]
}`;
}

export const BLOCK_SHAPES = `Blocks you may use (JSON shapes):
- {"type":"text","heading":"optional","body":"Rich text: **bold**, *italic*, [words](/resources), lines starting '- ' or '1. ' for lists, blank line between paragraphs"}
- {"type":"accordion","heading":"optional","items":[{"title":"What the reader opens","body":"Rich text"}]}  (for detail some readers need and others can skip, like definitions or edge cases)
- {"type":"callout","style":"important"|"example"|"tip","label":"Short label","body":"Rich text"}
- {"type":"decision","prompt":"What would you do?","context":"optional","choices":[{"text":"...","verdict":"best"|"acceptable"|"risky","feedback":"Why it works or doesn't"}],"source":{"label":"Where this comes from"}}  (2 to 4 choices, at least one best, specific feedback for each)
- {"type":"checklist","title":"...","items":["plain-language step", "..."]}
- {"type":"image","media":{"src":"","alt":"What the picture should show","caption":"Why it matters"},"width":"column"|"wide","enlarge":true}  (only when a picture or document excerpt is essential; leave src empty: the author adds the picture)
- {"type":"textMedia","heading":"optional","body":"Rich text","media":{"src":"","alt":"What the picture should show"},"layout":"media-right"}  (the text flows around the picture)
- {"type":"tabs","tabs":[{"label":"Short name","body":"Rich text"}]}  (2 to 6 tabs, to compare options side by side, like Self Managed and Fully Coordinated)
- {"type":"timeline","events":[{"when":"Day 1","title":"What happens","body":"Rich text, optional"}]}  (3 to 10 events in order, like a client's path from referral to services)
- {"type":"process","steps":[{"title":"The step","body":"Rich text: what to do and why"}]}  (3 to 10 steps of a workflow, like reporting an incident)
- {"type":"flashcards","cards":[{"front":"Term, question or situation","back":"Rich text answer"}]}  (4 to 12 cards, to recognise categories or terms)
- {"type":"branching","title":"optional","scenes":[{"id":"s1","text":"Rich text: what happens","choices":[{"text":"What you do","next":"s2"}]},{"id":"s2","text":"...","ending":{"outcome":"good"|"mixed"|"poor","summary":"Rich text: what this ending teaches"}}]}  (scene s1 is the start; 2 or 3 choices per scene; every choice's "next" names another scene's id; an ending has no choices; at least one good and one poor ending; 4 to 10 scenes)
- {"type":"conversation","person":"Their first name","role":"Who they are","setting":"The situation","turns":[{"line":"What they say","responses":[{"text":"What the learner could say","verdict":"best"|"acceptable"|"risky","feedback":"Coaching: why it lands or doesn't","reply":"How they react"}]}]}  (2 to 5 turns; 2 or 3 responses a turn, one best)
- {"type":"sorting","prompt":"What to sort","groups":[{"id":"g1","label":"Group name"}],"items":[{"text":"An item","group":"g1","feedback":"Why it belongs there"}]}  (2 to 4 groups, 4 to 12 items; each item's "group" names a group's id)
- {"type":"sequencing","prompt":"What to put in order","steps":[{"text":"A step"}],"feedback":"Why this order matters"}  (3 to 8 steps, written in the right order; learners get them shuffled)
- {"type":"matching","prompt":"What to match","pairs":[{"left":"Term","right":"What it means"}],"feedback":"What ties them together"}  (3 to 6 pairs)
- {"type":"fillblank","prompt":"optional","text":"A sentence with [[the answer|another accepted answer]] in double brackets","feedback":"Why"}  (1 to 4 gaps; only for terms and figures in the documents)
- {"type":"poll","question":"A quick question colleagues answer, like 'How often do you review a client's budget?'","options":[{"text":"Monthly"},{"text":"Quarterly"}]}  (2 to 5 options; for opinions and practice, never a test with a right answer)
- {"type":"wall","prompt":"A question everyone answers and shares, like 'What's one thing that helps a worried family member feel heard?'"}  (colleagues' answers open once they post; use at most one per course, for shared practice wisdom, never for anything personal or about clients)
- {"type":"reflection","prompt":"An open question","guidance":"What a good answer covers, for the AI feedback; learners don't see it","minWords":30}
- {"type":"confidence","statement":"How confident are you…?","low":"Not confident","high":"Very confident"}  (one near the start and one at the end of a course; the later one may add "compareWith":"the earlier one's id" only if you gave it an "id")
- {"type":"budget","title":"Whose budget","budget":6000,"weeks":13,"services":[{"name":"Personal care","unit":"hour","cost":75,"perWeek":3,"max":10}]}  (a made-up quarterly budget to plan services against; always flag it illustrative)
Reflect and apply blocks (unscored and private to the learner; for courses about judgement, conversations or changing practice, not for a plain procedure). Use at most one or two of these on a page, only where they serve the page's purpose, and give each a "note" saying why it belongs here:
- {"type":"journal","prompt":"A short, specific prompt about the case just read","scaffold":"optional: a way in, like 'What would you ask first?'"}  (a private note; never ask for a real client's name or details; a later page may add "revisits":"the earlier journal's id" to look back at it, only if you gave that journal an "id")
- {"type":"perspectives","prompt":"What's being compared","views":[{"title":"A viewpoint in plain words","reasoning":"Why someone would see it this way","misses":"What it might miss"}],"guidance":{"body":"What the approved source says","source":{"label":"exact document name and section"}}}  (2 or 3 defensible viewpoints, none of them 'the answer'; include "guidance" only when the documents state a rule or safety step, and then flag the block "verify"; may add "after":"the id of the journal or decision just before it")
- {"type":"pulse","kind":"confidence","question":"How confident are you that you could…?","options":[{"label":"Not confident"},{"label":"Unsure"},{"label":"Somewhat confident"},{"label":"Confident"}]}  (one tap, never a test; a matched pair uses the very same question and labels, the later one adding "compareWith":"the earlier one's id")
- {"type":"action","prompt":"Choose one thing to try…","timing":"optional: when it's worth trying","suggestions":[{"text":"On my next…, I will…"}]}  (2 to 4 concrete actions drawn from the documents; near the end of a course)
Never write a learner's private response, a made-up first-person client account presented as real, or a policy the documents don't state.

On every block you may add:
- "evidence": [{"source":"exact document name","ref":"page, slide or section","quote":"the short passage it relies on"}]  — required on any block that states a fact, rule or process from the documents
- "flag": {"kind":"illustrative","note":"what's made up"}  — on any made-up case, person, invoice or message
- "flag": {"kind":"verify","note":"what needs checking"}  — on any claim with weak, missing, conflicting or outdated support
- "note": "a note for the author or reviewer"`;

/** The prompt for one page of an approved outline. */
export function pagePrompt(input: { title: string; standfirst: string; audience: string; brief: string; outline: OutlinePage[]; index: number }) {
  const p = input.outline[input.index];
  const t = PAGE_TEMPLATES[p.template];
  const others = input.outline.map((x, i) => `${i + 1}. ${x.title} (${x.template}): ${x.purpose}${i === input.index ? "   <- this page" : ""}`).join("\n");
  return `You are writing one page of a Magazine course for Trilogy Care's Partner Hub, a training site for Australian aged care.

Course: ${input.title || "(untitled)"}
What learners should be able to do at the end: ${input.standfirst || "(see the brief)"}
Who it's for: ${input.audience}
The author's brief:
<brief>
${input.brief || "(none)"}
</brief>

The approved course outline:
${others}

Write page ${input.index + 1}: "${p.title}"
Purpose: ${p.purpose}
Teaching pattern: ${p.template}, ${t.title}. ${t.action} Follow this pattern as the page's sections: ${t.pattern}.
Interaction: ${p.interaction || "only if it genuinely helps the learner practise the purpose"}
Time: about ${p.minutes} minutes to read and do. That's roughly ${p.minutes * 130} to ${p.minutes * 170} words of text in all, plus any questions. Don't pad it out or cut it short.
${p.sources.length ? `Use these documents: ${p.sources.map((s) => `"${s}"`).join(", ")}.` : ""}
${p.missing.length ? `The outline noted these are missing from the documents; don't invent them, flag where they'd go: ${p.missing.join("; ")}.` : ""}
Don't repeat what other pages cover.

${BLOCK_SHAPES}

${RULES}

Reply with only a JSON object, no other text:
{"sections":[{"title":"Section title","blocks":[ ...blocks... ]}]}`;
}

/** Gives every section, block and choice a fresh id, so a page never clashes with the rest of the course. */
export function withIds(raw: unknown) {
  const sections = ((raw as { sections?: unknown[] })?.sections ?? []) as Record<string, unknown>[];
  // A confidence check may name the earlier one it compares with by the id Claude gave it.
  const blockIds = new Map<string, string>();
  const done = sections.map((s) => ({
    ...s,
    id: rid("s"),
    blocks: ((s.blocks as Record<string, unknown>[] | undefined) ?? []).map((b) => {
      const type = typeof b.type === "string" ? b.type : "text";
      const out: Record<string, unknown> = { ...b, id: rid(type.toLowerCase()) };
      if (typeof b.id === "string") blockIds.set(b.id, out.id as string);
      if (Array.isArray(b.choices)) out.choices = (b.choices as Record<string, unknown>[]).map((c) => ({ ...c, id: rid("c") }));
      if (Array.isArray(b.items) && type === "accordion") out.items = (b.items as Record<string, unknown>[]).map((it) => ({ ...it, id: rid("item") }));
      if (Array.isArray(b.slides)) out.slides = (b.slides as Record<string, unknown>[]).map((sl) => ({ ...sl, id: rid("slide") }));
      const fresh = (key: string, prefix: string) => {
        if (Array.isArray(b[key])) out[key] = (b[key] as Record<string, unknown>[]).map((x) => ({ ...x, id: rid(prefix) }));
      };
      fresh("tabs", "tab");
      fresh("events", "event");
      fresh("steps", "step");
      fresh("cards", "card");
      fresh("services", "svc");
      fresh("options", "opt");
      fresh("pairs", "pair");
      if (Array.isArray(b.turns))
        out.turns = (b.turns as Record<string, unknown>[]).map((t) => ({
          ...t,
          id: rid("turn"),
          responses: Array.isArray(t.responses) ? (t.responses as Record<string, unknown>[]).map((r) => ({ ...r, id: rid("resp") })) : t.responses,
        }));
      if (Array.isArray(b.groups) && Array.isArray(b.items) && type === "sorting") {
        const groups = b.groups as Record<string, unknown>[];
        const ids = new Map(groups.map((g) => [String(g.id), rid("group")]));
        out.groups = groups.map((g) => ({ ...g, id: ids.get(String(g.id)) }));
        out.items = (b.items as Record<string, unknown>[]).map((it) => ({ ...it, id: rid("item"), group: ids.get(String(it.group)) ?? "" }));
      }
      if (Array.isArray(b.steps) && type === "sequencing") out.steps = (b.steps as Record<string, unknown>[]).map((st) => ({ ...st, id: rid("step") }));
      if (Array.isArray(b.scenes)) {
        // Claude names its scenes (s1, s2…); they get real ids, with each choice pointed at the same scene as before.
        const scenes = b.scenes as Record<string, unknown>[];
        const ids = new Map(scenes.map((sc) => [String(sc.id), rid("scene")]));
        out.scenes = scenes.map((sc) => ({
          ...sc,
          id: ids.get(String(sc.id)),
          choices: Array.isArray(sc.choices)
            ? (sc.choices as Record<string, unknown>[]).map((c) => ({ ...c, id: rid("choice"), next: ids.get(String(c.next)) ?? "" }))
            : [],
        }));
      }
      return out;
    }),
  }));
  for (const s of done)
    for (const b of s.blocks) {
      if (b.compareWith === undefined) continue;
      const to = blockIds.get(String(b.compareWith));
      if (to) b.compareWith = to;
      else delete b.compareWith;
    }
  return done;
}

/** A picture Claude can't supply becomes an empty slot with a note; a link that isn't safe is dropped. */
export function tidy(sections: ReturnType<typeof withIds>) {
  for (const s of sections)
    for (const b of s.blocks as Record<string, unknown>[]) {
      const media = b.media as { src?: unknown; alt?: unknown } | undefined;
      if (media && (typeof media.src !== "string" || !isSiteMedia(media.src))) {
        media.src = "";
        if (!b.flag) b.flag = { kind: "verify", note: `Add the picture: ${String(media.alt ?? "see the description")}` };
      }
      for (const key of ["link", "resource"]) {
        const l = b[key] as { href?: unknown } | undefined;
        if (l && !safeHref(String(l.href ?? ""))) delete b[key];
      }
      const src = b.source as { href?: unknown } | undefined;
      if (src?.href && !safeHref(String(src.href))) delete src.href;
    }
  return sections;
}

/** Problems with a generated page, or none: it must fit the schema, and its questions must be complete. */
export function pageIssues(value: unknown): string[] {
  const sections = (value as { sections?: unknown })?.sections;
  if (!Array.isArray(sections) || !sections.length) return ['The reply needs a "sections" list with at least one section.'];
  const issues: string[] = [];
  try {
    const doc = readGuideDoc(
      { schema: 2, pages: [{ id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: tidy(withIds(value)) }] },
      { draft: true },
    );
    doc.pages[0].sections.forEach((s, i) => {
      if (!s.title) issues.push(`Section ${i + 1} needs a title.`);
      if (!s.blocks.length) issues.push(`Section ${i + 1} needs at least one block.`);
      s.blocks.forEach((b, j) => {
        const at = `Section ${i + 1}, block ${j + 1}`;
        if ((b.type === "text" || b.type === "callout" || b.type === "textMedia") && !b.body) issues.push(`${at} needs its text.`);
        if (b.type === "decision") {
          if (!b.prompt) issues.push(`${at} needs its question.`);
          if (b.choices.length < 2) issues.push(`${at} needs at least 2 choices.`);
          if (!b.choices.some((c) => c.verdict === "best")) issues.push(`${at} needs a best choice.`);
          if (b.choices.some((c) => !c.text || !c.feedback)) issues.push(`${at}: every choice needs its text and feedback.`);
        }
        if (b.type === "checklist" && !b.items.some(Boolean)) issues.push(`${at} needs its items.`);
        if (b.type === "accordion" && (!b.items.length || b.items.some((it) => !it.title || !it.body)))
          issues.push(`${at}: every accordion item needs a title and text.`);
        if (b.type === "carousel") issues.push(`${at}: don’t use carousel blocks.`);
        if (b.type === "quiz" || b.type === "video" || b.type === "spot") issues.push(`${at}: don’t use ${b.type} blocks.`);
        if (b.type === "tabs" && (b.tabs.length < 2 || b.tabs.some((t) => !t.label || !t.body)))
          issues.push(`${at}: give at least 2 tabs, each with a label and text.`);
        if (b.type === "timeline" && (b.events.length < 2 || b.events.some((e) => !e.when || !e.title)))
          issues.push(`${at}: give at least 2 events, each with when and a title.`);
        if (b.type === "process" && (b.steps.length < 2 || b.steps.some((st) => !st.title))) issues.push(`${at}: give at least 2 steps, each with a title.`);
        if (b.type === "flashcards" && (!b.cards.length || b.cards.some((c) => !c.front || !c.back)))
          issues.push(`${at}: every card needs a front and a back.`);
        if (b.type === "branching") {
          if (b.scenes.some((sc) => !sc.text)) issues.push(`${at}: every scene needs its text.`);
          if (!b.scenes.some((sc) => sc.ending)) issues.push(`${at} needs at least one ending.`);
          if (b.scenes.some((sc) => !sc.ending && !sc.choices.length)) issues.push(`${at}: a scene without choices must be an ending.`);
          if (b.scenes.some((sc) => sc.choices.some((c) => !c.text || !c.next)))
            issues.push(`${at}: every choice needs text and a "next" that names another scene's id.`);
        }
        if (b.type === "conversation") {
          if (!b.person || !b.turns.length) issues.push(`${at} needs a person and at least one turn.`);
          if (
            b.turns.some(
              (t) => !t.line || t.responses.length < 2 || !t.responses.some((r) => r.verdict === "best") || t.responses.some((r) => !r.text || !r.feedback),
            )
          )
            issues.push(`${at}: every turn needs a line and 2 or 3 responses with feedback, one of them best.`);
        }
        if (b.type === "reflection" && (!b.prompt || !b.guidance)) issues.push(`${at} needs its question and guidance.`);
        if (b.type === "sorting" && (b.groups.length < 2 || b.items.length < 2 || b.items.some((it) => !it.text || !it.group)))
          issues.push(`${at}: give at least 2 groups and 2 items, each item with a "group" that names a group's id.`);
        if (b.type === "sequencing" && (b.steps.length < 3 || b.steps.some((st) => !st.text))) issues.push(`${at}: give at least 3 steps, each with text.`);
        if (b.type === "matching" && (b.pairs.length < 2 || b.pairs.some((p) => !p.left || !p.right)))
          issues.push(`${at}: give at least 2 pairs, each with both sides.`);
        if (b.type === "fillblank" && !blanksOf(b.text).some((p) => "answers" in p)) issues.push(`${at}: put at least one answer in [[double brackets]].`);
        if (b.type === "hotspots") issues.push(`${at}: don’t use hotspots blocks (they need a picture).`);
        if (b.type === "poll" && (!b.question || b.options.length < 2 || b.options.some((op) => !op.text)))
          issues.push(`${at} needs its question and at least 2 options.`);
        if (b.type === "wall" && !b.prompt) issues.push(`${at} needs its question.`);
        if (b.type === "confidence" && !b.statement) issues.push(`${at} needs its statement.`);
        if (b.type === "journal" && !b.prompt) issues.push(`${at} needs its prompt.`);
        if (b.type === "pulse" && (!b.question || b.options.length < 2 || b.options.some((op) => !op.label)))
          issues.push(`${at} needs its question and at least 2 labelled responses.`);
        if (b.type === "action" && (!b.prompt || (!b.revisits && b.suggestions.length < 2)))
          issues.push(`${at} needs its prompt and 2 to 4 suggested actions.`);
        if (b.type === "perspectives" && (b.views.length < 2 || b.views.some((v) => !v.title || !v.reasoning || !v.misses)))
          issues.push(`${at} needs 2 or 3 perspectives, each with its reasoning and what it might miss.`);
        if (b.type === "perspectives" && b.guidance && !b.flag) issues.push(`${at}: flag it "verify" so the guidance is checked by its policy owner.`);
        if (b.type === "budget" && (!b.services.length || b.services.some((sv) => !sv.name || !sv.cost)))
          issues.push(`${at}: every service needs a name and a cost.`);
      });
    });
  } catch (e) {
    if (e instanceof GuideDocError) issues.push(...e.problems);
    else throw e;
  }
  return issues;
}

/**
  Claude proposes the course outline from the brief, the time target and the documents. Saved with the
  draft; the author edits it before any page is written.
*/
export async function proposeOutline(
  db: Db,
  actor: User,
  guideId: string,
  input: { brief?: unknown; minutes?: unknown },
  now: Date,
  send: (e: DraftProgress) => void,
) {
  const g = requireGuide(db, actor, guideId);
  const brief = cleanBrief(input.brief);
  const minutes = cleanMinutes(input.minutes);
  const sources = sourcesOf(db, guideId).filter((s) => s.status === "ready");
  if (!brief && !sources.length) throw new HttpError(400, "Add a brief or upload a document first.");
  // Kept before Claude starts, so a failure never loses the brief or the documents.
  savePlan(db, actor, guideId, { ...draftPlan(db, actor, guideId), brief, minutes }, now);
  if (sources.length) send({ type: "phase", phase: "reading" });
  const names = sources.map((s) => s.name);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...documents(sources),
    { type: "text", text: outlinePrompt({ title: g.title, standfirst: g.standfirst, audience: audienceText(g.audience), brief, minutes, sourceNames: names }) },
  ];
  send({ type: "phase", phase: "writing" });
  const { value, usage } = await askForJson<{ pages: unknown[]; questions?: unknown[] }>(content, (v) => outlineIssues(v, minutes, names), {
    onText: (soFar) => send({ type: "count", what: "pages", n: keyCounts(soFar, ["purpose"]).purpose }),
    onPhase: (phase, issues) => send({ type: "phase", phase, issues }),
  });
  const outline = cleanOutline(value);
  const questions = (Array.isArray(value.questions) ? value.questions : []).map(String).filter(Boolean).slice(0, 10);
  savePlan(db, actor, guideId, { brief, minutes, outline, questions }, now);
  audit(db, {
    actor: actor.id,
    event: "magazine.outline_drafted",
    entity: guideId,
    next: { model: GENERATION_MODEL, pages: outline.length, minutes, sources: names, usage },
    at: now,
  });
  return { outline, questions };
}

/**
  Claude writes one page of the approved outline. The page comes back to the editor (it isn't saved
  here), so retrying a page or one failing never changes anything the author has written.
*/
export async function generatePage(db: Db, actor: User, guideId: string, input: { index?: unknown }, now: Date, send: (e: DraftProgress) => void) {
  const g = requireGuide(db, actor, guideId);
  const plan = draftPlan(db, actor, guideId);
  if (!plan.outline?.length) throw new HttpError(400, "Approve an outline first.");
  const index = Number(input.index);
  const p = plan.outline[index];
  if (!Number.isInteger(index) || !p) throw new HttpError(400, "That page isn’t in the outline.");
  if (p.template === "blank") throw new HttpError(400, "Choose a teaching pattern for this page first.");
  const sources = sourcesOf(db, guideId).filter((s) => s.status === "ready");
  const used = sources.filter((s) => !p.sources.length || p.sources.includes(s.name));
  if (used.length) send({ type: "phase", phase: "reading" });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...documents(sources),
    {
      type: "text",
      text: pagePrompt({ title: g.title, standfirst: g.standfirst, audience: audienceText(g.audience), brief: plan.brief, outline: plan.outline, index }),
    },
  ];
  send({ type: "phase", phase: "writing" });
  const { value, usage } = await askForJson<{ sections: unknown[] }>(content, pageIssues, {
    onText: (soFar) => send({ type: "count", what: "sections", n: keyCounts(soFar, ["blocks"]).blocks }),
    onPhase: (phase, issues) => send({ type: "phase", phase, issues }),
  });
  const page: Page = {
    id: rid("page"),
    title: p.title,
    purpose: p.purpose,
    template: p.template,
    kind: "content",
    required: p.required,
    sections: readGuideDoc(
      { schema: 2, pages: [{ id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: tidy(withIds(value)) }] },
      { draft: true },
    ).pages[0].sections,
  };
  audit(db, {
    actor: actor.id,
    event: "magazine.page_drafted",
    entity: guideId,
    next: { model: GENERATION_MODEL, page: p.title, minutes: p.minutes, usage },
    at: now,
  });
  return { page, index };
}
