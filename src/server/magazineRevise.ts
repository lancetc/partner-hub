import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { askForJson, keyCounts } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import {
  audienceText,
  BLOCK_SHAPES,
  draftPlan,
  pageIssues,
  requireGuide,
  rid,
  RULES,
  sourceDocuments,
  tidy,
  withIds,
  type DraftProgress,
} from "./magazineDraft";
import { GuideDocError, PAGE_TEMPLATES, readGuideDoc, type Block, type GuideDoc, type Page, type PageTemplate } from "@/lib/magazine";

/*
  Revise with AI: once a course is built, the author asks Claude to review and update it with a prompt
  of their own ("make it shorter", "add a decision on page 3", "check it against the new policy"),
  for the whole course or one page. Claude reads the course as it stands in the editor, the course's
  documents and brief, and proposes changes page by page: a page rewritten, a page added or a page
  removed, each with why.

  Nothing is saved here. The proposal goes back to the editor, which shows each change beside what's
  there now; the author applies the ones they want as changes they can undo. Blocks Claude leaves alone
  come back exactly as they were (same id, pictures, evidence and sign-offs), so a light edit doesn't
  disturb the rest of the page.
*/

export const MAX_REVISE_PROMPT = 2000;
const NEW_TEMPLATES: string[] = Object.keys(PAGE_TEMPLATES).filter((t) => t !== "blank");
/** Marks a stand-in for a block Claude kept, until the real block goes back in. */
const KEPT = "__keep";

export type RevisionChange =
  | { kind: "edit"; pageId: string; why: string; page: Page }
  | { kind: "add"; after: string | null; why: string; page: Page }
  | { kind: "remove"; pageId: string; why: string };
export type Revision = { summary: string; changes: RevisionChange[] };

type RawChange = {
  page?: unknown;
  after?: unknown;
  remove?: unknown;
  why?: unknown;
  title?: unknown;
  purpose?: unknown;
  template?: unknown;
  sections?: unknown;
};
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The pages Claude may change: every content page of the course, or the one page asked for. Assessments stay as they are. */
const editable = (doc: GuideDoc, scope: string) => doc.pages.filter((p) => p.kind === "content" && (scope === "course" || p.id === scope));
const blocksOf = (p: Page) => new Map<string, Block>(p.sections.flatMap((s) => s.blocks).map((b) => [b.id, b]));

/** Swaps each {"keep": id} for a stand-in the checks accept, noting a keep that names the wrong block. */
function standIns(sections: unknown, own: Map<string, Block>, issues?: string[], label = "") {
  if (!Array.isArray(sections)) return sections;
  const used = new Set<string>();
  return sections.map((s) => {
    const sec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const blocks = Array.isArray(sec.blocks) ? sec.blocks : [];
    return {
      ...sec,
      blocks: blocks.map((b) => {
        const keep = (b as { keep?: unknown } | null)?.keep;
        if (keep === undefined) return b;
        const id = String(keep);
        if (!own.has(id)) issues?.push(`${label}: "keep" names ${id}, which isn’t a block on this page. Keep only this page’s own blocks.`);
        else if (used.has(id)) issues?.push(`${label}: block ${id} is kept twice.`);
        used.add(id);
        return { type: "text", body: "(kept)", [KEPT]: id };
      }),
    };
  });
}

/** Problems with Claude's proposal, or none. */
export function revisionIssues(doc: GuideDoc, scope: string) {
  const pages = new Map(editable(doc, scope).map((p) => [p.id, p]));
  return (value: unknown): string[] => {
    const v = value as { summary?: unknown; changes?: unknown } | null;
    if (!v || typeof v !== "object") return ["Reply with a JSON object."];
    const issues: string[] = [];
    if (!text(v.summary)) issues.push('Add a "summary": what you changed and why, or that nothing needed changing.');
    if (!Array.isArray(v.changes)) return [...issues, 'The reply needs a "changes" list (an empty list if nothing needs changing).'];
    const seen = new Set<string>();
    v.changes.forEach((c, i) => {
      const ch = (c && typeof c === "object" ? c : {}) as RawChange;
      const label = `Change ${i + 1}`;
      if (!text(ch.why)) issues.push(`${label} needs a "why".`);
      const pid = String(ch.page ?? "");
      const check = (own: Map<string, Block>) =>
        issues.push(...pageIssues({ sections: standIns(ch.sections, own, issues, label) }).map((x) => `${label}: ${x}`));
      if (pid === "new") {
        if (scope !== "course") return void issues.push(`${label}: revise only the page you were given; don’t add pages.`);
        if (!text(ch.title)) issues.push(`${label}: a new page needs a "title".`);
        if (!NEW_TEMPLATES.includes(String(ch.template))) issues.push(`${label}: "template" must be one of ${NEW_TEMPLATES.join(", ")}.`);
        if (ch.after !== "start" && !doc.pages.some((p) => p.id === ch.after)) issues.push(`${label}: "after" must be a page’s id, or "start".`);
        return check(new Map());
      }
      const page = pages.get(pid);
      if (!page) return void issues.push(`${label}: "page" must be the id of a page you were asked to revise${scope === "course" ? ', or "new"' : ""}.`);
      if (seen.has(pid)) issues.push(`${label}: page ${pid} is changed twice. Put everything for one page in one change.`);
      seen.add(pid);
      if (ch.remove === true) {
        if (scope !== "course") issues.push(`${label}: don’t remove the page you’re revising; change it instead.`);
        return;
      }
      check(blocksOf(page));
    });
    return issues;
  };
}

/** The sections Claude wrote, with fresh ids for new blocks and each kept block back exactly as it was. */
function buildSections(raw: unknown, own: Map<string, Block>) {
  const sections = tidy(withIds({ sections: standIns(raw, own) }));
  for (const s of sections)
    s.blocks = s.blocks.map((b) => (typeof b[KEPT] === "string" ? (structuredClone(own.get(b[KEPT] as string)) as unknown as Record<string, unknown>) : b));
  return sections;
}

/** Turns Claude's reply into changes the editor can show and apply. Each page is read against the whole course, as it would be saved. */
export function toRevision(doc: GuideDoc, scope: string, value: { summary: string; changes: RawChange[] }): Revision {
  const pages = new Map(editable(doc, scope).map((p) => [p.id, p]));
  const read = (page: Omit<Page, "sections"> & { sections: unknown }) => {
    const others = doc.pages.filter((p) => p.id !== page.id);
    try {
      return readGuideDoc({ schema: 2, pages: [...others, page] }, { draft: true }).pages.at(-1)!;
    } catch (e) {
      if (e instanceof GuideDocError) throw new HttpError(502, `Claude’s changes didn’t fit the course: ${e.problems.slice(0, 3).join(" ")}`);
      throw e;
    }
  };
  const changes = value.changes.map((ch): RevisionChange => {
    const why = text(ch.why);
    const pid = String(ch.page);
    if (pid === "new") {
      const page = read({
        id: rid("page"),
        title: text(ch.title),
        purpose: text(ch.purpose),
        template: ch.template as PageTemplate,
        kind: "content",
        required: true,
        sections: buildSections(ch.sections, new Map()),
      });
      return { kind: "add", after: ch.after === "start" ? null : String(ch.after), why, page };
    }
    if (ch.remove === true) return { kind: "remove", pageId: pid, why };
    const before = pages.get(pid)!;
    // Everything about the page but its words stays: id, pattern, kind, required, header picture, activity setting.
    const page = read({
      ...before,
      title: text(ch.title) || before.title,
      purpose: text(ch.purpose) || before.purpose,
      sections: buildSections(ch.sections, blocksOf(before)),
    });
    return { kind: "edit", pageId: pid, why, page };
  });
  return { summary: text(value.summary), changes };
}

/** The prompt: the course at a glance, the page(s) in full, and the author's instructions. */
export function revisePrompt(input: {
  title: string;
  standfirst: string;
  audience: string;
  brief: string;
  doc: GuideDoc;
  scope: string;
  prompt: string;
  hasSources: boolean;
}) {
  const pages = editable(input.doc, input.scope);
  const one = input.scope !== "course" ? pages[0] : null;
  const list = input.doc.pages
    .map(
      (p, i) =>
        `${i + 1}. [id ${p.id}] ${p.title || "(untitled)"} (${p.kind === "assessment" ? "assessment" : `${p.template}${p.required ? "" : ", optional"}`}): ${p.purpose || "(no purpose)"}${one?.id === p.id ? "   <- revise this page" : ""}`,
    )
    .join("\n");
  const full = pages
    .map((p) => `<page id="${p.id}">\n${JSON.stringify({ title: p.title, purpose: p.purpose, template: p.template, sections: p.sections })}\n</page>`)
    .join("\n\n");
  return `You are reviewing and revising a Magazine course for Trilogy Care's Partner Hub, a training site for Australian aged care. The course is already built; the author wants it updated.

Course: ${input.title || "(untitled)"}
What learners should be able to do at the end: ${input.standfirst || "(not given)"}
Who it's for: ${input.audience}
${input.brief ? `The author's original brief:\n<brief>\n${input.brief}\n</brief>\n` : ""}
The course's pages, in order:
${list}

${
  one
    ? `Revise only page "${one.title}" (id ${one.id}). The other pages are listed so you don't repeat them; don't change them.`
    : "You may revise any content page, add a page, or remove a page. Assessment pages can't be changed. Keep the course in a sensible order, moving from context to application."
}
${input.hasSources ? "The course's source documents are attached. Check claims against them; authoritative documents win over background ones." : "No source documents are attached, so don't add new facts, rules or figures; flag anything that needs checking."}

The author's instructions:
<instructions>
${input.prompt}
</instructions>

${one ? "The page as it stands now" : "The content pages as they stand now"} (JSON):
${full}

How to revise:
- Do what the instructions ask, and fix anything that breaks the rules below. Leave everything else as it is: don't rewrite for the sake of it.
- For each page you change, give its complete sections, in order. For a block you keep exactly as it is, write {"keep":"<its id>"} instead of repeating it. To change a block, write it out in full without an id. Leave a block out to remove it.
- Blocks of kinds not listed below (video, quiz, carousel, hotspots, spot the mistake) can only be kept or removed.
- When you rewrite a block with a picture, keep its "src" and "alt" as they were.
- Keep the evidence and flags on claims you keep. Give new claims from the documents their evidence, and flag made-up cases as illustrative and doubtful claims as verify.
- Leave a page you don't change out of "changes". If nothing needs changing, say so in the summary and give an empty list.

${BLOCK_SHAPES}

${RULES}

Reply with only a JSON object, no other text:
{
  "summary": "Two or three sentences for the author: what you changed and why, or that nothing needed changing",
  "changes": [
    {"page":"<page id>","why":"What changed on this page and why","title":"a new title, only if it should change","purpose":"a new purpose, only if it should change","sections":[{"title":"Section title","blocks":[{"keep":"<block id>"}, { ...a new or rewritten block... }]}]}${
      one
        ? ""
        : `,
    {"page":"new","after":"<the id of the page it follows, or start>","why":"Why the course needs it","title":"Page title","purpose":"What the learner will do","template":"decide" | "do" | "notice" | "adapt" | "say","sections":[ ... ]},
    {"page":"<page id>","remove":true,"why":"Why it should go"}`
    }
  ]
}`;
}

/**
  Claude reviews the course (or one page) as it stands in the editor and proposes changes for the
  author's instructions. Nothing is saved: the editor shows the proposal and applies what's chosen.
*/
export async function proposeRevision(
  db: Db,
  actor: User,
  guideId: string,
  input: { prompt?: unknown; scope?: unknown; doc?: unknown },
  now: Date,
  send: (e: DraftProgress) => void,
): Promise<Revision> {
  const g = requireGuide(db, actor, guideId);
  const prompt = text(input.prompt).slice(0, MAX_REVISE_PROMPT);
  if (!prompt) throw new HttpError(400, "Say what you’d like changed.");
  let doc: GuideDoc;
  try {
    doc = readGuideDoc(input.doc, { draft: true });
  } catch (e) {
    if (e instanceof GuideDocError) throw new HttpError(400, `The course has problems to fix first: ${e.problems.slice(0, 3).join(" ")}`);
    throw e;
  }
  const scope = typeof input.scope === "string" && input.scope ? input.scope : "course";
  if (!editable(doc, scope).length)
    throw new HttpError(
      400,
      scope === "course" ? "The course has no content pages to revise." : "That page can’t be revised with AI (it isn’t a content page).",
    );
  const sources = sourceDocuments(db, guideId);
  if (sources.length) send({ type: "phase", phase: "reading" });
  const plan = draftPlan(db, actor, guideId);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...sources,
    {
      type: "text",
      text: revisePrompt({
        title: g.title,
        standfirst: g.standfirst,
        audience: audienceText(g.audience),
        brief: plan.brief,
        doc,
        scope,
        prompt,
        hasSources: sources.length > 0,
      }),
    },
  ];
  send({ type: "phase", phase: "writing" });
  const { value, usage } = await askForJson<{ summary: string; changes: RawChange[] }>(content, revisionIssues(doc, scope), {
    onText: (soFar) => send({ type: "count", what: "pages", n: keyCounts(soFar, ["why"]).why }),
    onPhase: (phase, issues) => send({ type: "phase", phase, issues }),
  });
  const revision = toRevision(doc, scope, value);
  audit(db, {
    actor: actor.id,
    event: "magazine.revision_proposed",
    entity: guideId,
    next: { model: GENERATION_MODEL, scope, prompt, changes: revision.changes.map((c) => c.kind), usage },
    at: now,
  });
  return revision;
}
