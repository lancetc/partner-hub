import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Card, Lesson } from "@/content/lessons";
import type { PathConfig, PathStep } from "@/content/followups";
import { audit, tx, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { getLesson } from "./lessonStore";

/*
  Writes spaced learning variations for a master lesson with Claude. The master lesson's own
  cards are the only source material: Claude is asked to recall and apply what the lesson
  already says, never to add policy. Every result is validated against the card format and
  saved as a draft that an author must review and approve before learners see it.
*/

export const GENERATION_MODEL = "claude-opus-5-5";

export const STAGES = [
  {
    key: "recall",
    stage: "Recall",
    gap: 14,
    when: "Week 2",
    cards: "3 to 4",
    purpose: "Test what they remember. Ask from memory before explaining: one short intro card, one or two quiz cards, then a summary.",
  },
  {
    key: "apply",
    stage: "Apply",
    gap: 46,
    when: "Month 2",
    cards: "4 to 6",
    purpose:
      "Apply the knowledge to a new, realistic workplace situation: an intro card setting the scene, a decision with two or three clearly different options, a consequence card for each option (poorer choices offer a way to recover or try again), then a summary.",
  },
  {
    key: "refresh",
    stage: "Refresh",
    gap: 38,
    when: "Week 14",
    cards: "2",
    purpose: "Reinforce the most critical decision with one short decision card (with feedback on each option) and a summary.",
  },
  {
    key: "refreshSupport",
    stage: "Refresh support",
    gap: 0,
    when: "Week 14 (for learners who struggled)",
    cards: "3 to 4",
    purpose:
      "For learners who missed an earlier first attempt: a short reminder card with key points, one practice quiz, the same critical decision, then a summary.",
  },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const ICONS = ["clock", "shield", "heart", "leaf", "chat", "home", "spark", "doc", "people", "sun", "route", "book"];
const VARIANTS = ["petals", "rings", "grid", "wave", "dots", "arc"];
const TONES = ["teal", "navy", "warm", "gold", "sky"];

export const FORMAT = `Each lesson is a JSON object:
{
  "title": string,                // e.g. "<Master title>: quick recall"
  "summary": string,              // one sentence
  "outcome": string,              // what the learner can do afterwards
  "minutes": number,              // 1 to 4
  "beats": string[],              // short progress labels, one per main step
  "start": string,                // id of the first card
  "nodes": { [id: string]: Card } // every card, keyed by its id
}

Card fields shared by all types:
  "id" (same as its key), "type", "beat" (index into beats, 0-based), "label" (2-4 words),
  "heading" (3-8 words), "body" (on-screen text, 15-40 words, may be ""),
  "visual": one of
     {"kind":"none"}
     {"kind":"words","words":[2-4 short phrases],"tone":${JSON.stringify(TONES)},"alt":string}
     {"kind":"illustration","variant":${JSON.stringify(VARIANTS)},"tone":...,"icon":${JSON.stringify(ICONS)},"alt":string}
  optional "narration": a separate spoken script (30-60 words) that adds context and never reads out answers before the learner chooses
  optional "keyPoints": {"title"?: string, "style":"chips"|"tiles", "items":[{"text":string,"icon"?:<icon>}], "tip"?: string}
  optional "emphasis": "consequence" | "recovery" (for consequence cards)

Card types:
  "image":    + "next": card id, optional "cta" (button label, e.g. "Start", "Continue", "Try another response")
  "quiz":     + "questions": [{"id":string,"prompt":string,"options":[{"id":"a","label":string},...3 options],
                 "correct": option id,
                 "feedback":{"correct":"Yes. ...","incorrect":"Not quite. ... (explain without just giving the letter)"}}],
               + "next": card id (omit only if this quiz is the last card)
  "decision": + "prompt": string, "options": [{"id":string,"label":string,"correct":true|false,
                 and EITHER "next": card id (optionally with "feedback" shown before continuing)
                 OR "stay": true with "feedback" explaining why and asking them to try again}]
  "summary":  + "action": one practical takeaway sentence, optional "points": string[], "cta": "Finish"
                (the summary card ends the lesson; every route must reach it)`;

export function prompt(master: Lesson, instructions?: string) {
  const source = Object.values(master.nodes).map((n) => {
    const c = n as Card & Record<string, unknown>;
    return {
      id: c.id,
      type: c.type,
      label: c.label,
      heading: c.heading,
      body: c.body,
      narration: c.narration ?? c.script ?? c.transcript,
      keyPoints: c.keyPoints,
      questions: c.questions,
      options: c.options,
      points: c.points,
      action: c.action,
    };
  });
  return `You are writing spaced learning follow ups for Trilogy Care's Partner Hub, a training site for Australian aged care service partners and care coordinators.

The author has written one master lesson. Write four short follow up lessons that bring the same learning back over time. Spaced learning is repeated retrieval and application, not repetition: ask the learner to recall, decide or apply something before explaining it, use fresh situations, and give feedback that explains why.

Master lesson: "${master.title}"
Objective: ${master.outcome}
Master cards (your only source material):
${JSON.stringify(source, null, 1)}

Rules:
- Use only facts, terms and processes that appear in the master lesson. Do not invent policy, legislation, dates, numbers, rates or organisational processes. If a scenario needs a process, describe it generally ("check the approved process", "contact the coordinator").
- Warm, clear Australian English. Speak to the learner as "you". No exclamation marks or celebratory language.
- Scenarios use fictional first names and no identifiable client or health details.
- Keep on-screen text short; put explanation in narration.
- Quiz questions must test understanding of the master content, with plausible wrong options.

The four lessons:
${STAGES.map((s) => `- "${s.key}" (${s.stage}, ${s.when}, ${s.cards} cards): ${s.purpose}`).join("\n")}
${
  instructions
    ? `
Extra instructions from the author for this draft. Follow them where they fit the rules above. They can change focus, tone, examples or emphasis, but never add facts, policy or processes that aren't in the master lesson:
<author_instructions>
${instructions}
</author_instructions>
`
    : ""
}

${FORMAT}

Reply with only a JSON object, no prose and no code fences:
{"recall": <lesson>, "apply": <lesson>, "refresh": <lesson>, "refreshSupport": <lesson>}`;
}

/** Checks a generated lesson against the card format and its own links. */
export function validateLesson(l: Lesson): string[] {
  const issues: string[] = [];
  if (!l || typeof l !== "object") return ["not an object"];
  if (!l.title || !l.start || !l.nodes || !Array.isArray(l.beats) || !l.beats.length) return ["missing title, start, beats or nodes"];
  const ids = Object.keys(l.nodes);
  if (!l.nodes[l.start]) issues.push(`start card "${l.start}" doesn’t exist`);
  const ref = (from: string, to?: string) => to && !l.nodes[to] && issues.push(`${from} links to missing card "${to}"`);
  let summaries = 0;
  for (const id of ids) {
    const c = l.nodes[id] as Card & Record<string, unknown>;
    if (c.id !== id) issues.push(`card "${id}" has a different id`);
    if (typeof c.beat !== "number" || c.beat < 0 || c.beat >= l.beats.length) issues.push(`${id}: beat out of range`);
    if (!c.heading || typeof c.body !== "string") issues.push(`${id}: needs heading and body`);
    const v = c.visual as { kind?: string; icon?: string; variant?: string; tone?: string; alt?: string; words?: unknown };
    if (!v || !["none", "words", "illustration"].includes(v.kind ?? "")) issues.push(`${id}: invalid visual`);
    else if (v.kind !== "none" && !v.alt) issues.push(`${id}: visual needs alt text`);
    else if (v.kind === "illustration" && (!ICONS.includes(v.icon ?? "") || !VARIANTS.includes(v.variant ?? "") || !TONES.includes(v.tone ?? "")))
      issues.push(`${id}: invalid illustration`);
    else if (v.kind === "words" && (!Array.isArray(v.words) || !TONES.includes(v.tone ?? ""))) issues.push(`${id}: invalid words visual`);
    switch (c.type) {
      case "image":
        if (!c.next) issues.push(`${id}: image card needs next`);
        ref(id, c.next as string);
        break;
      case "quiz":
        if (!Array.isArray(c.questions) || !c.questions.length) issues.push(`${id}: quiz needs questions`);
        else
          for (const q of c.questions) {
            if (!q.options?.some((o) => o.id === q.correct)) issues.push(`${id}: correct answer isn’t an option`);
            if (!q.feedback?.correct || !q.feedback?.incorrect) issues.push(`${id}: quiz needs feedback`);
          }
        ref(id, c.next as string | undefined);
        break;
      case "decision":
        if (!Array.isArray(c.options) || c.options.length < 2) issues.push(`${id}: decision needs at least two options`);
        else
          for (const o of c.options) {
            if (!o.next && !o.stay) issues.push(`${id}: option "${o.id}" needs next or stay`);
            if (o.stay && !o.feedback) issues.push(`${id}: option "${o.id}" stays but has no feedback`);
            ref(id, o.next);
          }
        break;
      case "presenter":
        if (typeof c.transcript !== "string" || !c.transcript.trim()) issues.push(`${id}: presenter card needs a transcript (the spoken script)`);
        if (!c.next) issues.push(`${id}: presenter card needs next`);
        ref(id, c.next as string);
        break;
      case "response":
        if (!c.prompt || !c.modelResponse) issues.push(`${id}: response card needs a prompt and a modelResponse`);
        if (!c.next) issues.push(`${id}: response card needs next`);
        ref(id, c.next as string);
        break;
      case "summary":
        summaries++;
        if (!c.action) issues.push(`${id}: summary needs an action`);
        break;
      default:
        issues.push(`${id}: unsupported card type "${String(c.type)}"`);
    }
  }
  if (!summaries) issues.push("needs a summary card to finish");
  return issues;
}

function normalise(raw: Lesson, master: Lesson, key: StageKey): Lesson {
  const slug = `${master.slug}-${key === "refreshSupport" ? "refresh-support" : key}`;
  const firstSummary = Object.values(raw.nodes).find((n) => n.type === "summary")!;
  return {
    ...raw,
    slug,
    version: "1.0",
    track: "reinforcement",
    minutes: Math.max(1, Math.min(5, Math.round(Number(raw.minutes) || 2))),
    completion: { type: "acknowledge", cardId: firstSummary.id, label: "Work through the activity and finish" },
    owner: `${master.owner} (AI draft for review)`,
    reviewDate: master.reviewDate,
    visual: master.visual,
  };
}

export function client() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new HttpError(503, "Claude isn’t connected. Add ANTHROPIC_API_KEY to .env.local and restart the server.");
  }
  return new Anthropic();
}

async function ask(master: Lesson, instructions?: string, repair?: { previous: string; correction: string }) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt(master, instructions) }];
  // Show Claude its own reply alongside what failed, so it can fix rather than start over.
  if (repair) messages.push({ role: "assistant", content: repair.previous }, { role: "user", content: repair.correction });
  const stream = client().beta.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 64000,
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new HttpError(502, "Claude declined to write these follow ups. Try again or write them by hand.");
  if (message.stop_reason === "max_tokens") throw new HttpError(502, "Claude’s reply was cut off. Try again.");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { text, usage: message.usage };
}

function parse(master: Lesson, text: string) {
  let data: Record<StageKey, Lesson>;
  try {
    data = JSON.parse(text);
  } catch {
    return { issues: ["The reply wasn’t valid JSON."], lessons: null };
  }
  const issues: string[] = [];
  const out = {} as Record<StageKey, Lesson>;
  for (const s of STAGES) {
    const raw = data?.[s.key];
    const found = raw ? validateLesson(raw) : [`missing "${s.key}"`];
    found.forEach((i) => issues.push(`${s.key}: ${i}`));
    if (!found.length) out[s.key] = normalise(raw, master, s.key);
  }
  return { issues, lessons: issues.length ? null : out };
}

/**
  Generates and stores draft variations, and a draft learning path that delivers them:
  Recall at week 2, Apply at month 2, Refresh at week 14 (support version if they struggled).
*/
/** Longest custom instruction an author can add to one generation. */
export const MAX_INSTRUCTIONS = 1500;

export async function generateVariations(db: Db, actor: User, masterSlug: string, now: Date, instructions?: string) {
  const master = getLesson(db, masterSlug);
  if (!master || master.track === "reinforcement" || "generated" in master) throw new HttpError(404, "Master topic not found.");

  instructions = instructions?.trim().slice(0, MAX_INSTRUCTIONS) || undefined;
  let { text, usage } = await ask(master, instructions);
  let result = parse(master, text);
  if (!result.lessons) {
    // One repair attempt, telling Claude exactly what failed validation.
    ({ text, usage } = await ask(master, instructions, {
      previous: text,
      correction: `Your previous reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
    }));
    result = parse(master, text);
  }
  if (!result.lessons) throw new HttpError(502, `Claude’s draft didn’t pass the format checks:\n${result.issues.slice(0, 8).join("\n")}`);
  const drafts = result.lessons;

  const pathId = `path-spaced-${master.slug}`;
  tx(db, () => {
    for (const s of STAGES) {
      const l = drafts[s.key];
      db.prepare(
        `INSERT INTO generated_lessons (slug, master_slug, stage, status, content, model, created_at, created_by)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET content = excluded.content, status = 'draft', model = excluded.model, created_at = excluded.created_at, created_by = excluded.created_by, approved_at = NULL, approved_by = NULL`,
      ).run(l.slug, master.slug, s.stage, JSON.stringify(l), GENERATION_MODEL, now.toISOString(), actor.id);
    }
    const config: PathConfig = {
      name: `${master.title}: spaced learning`,
      description: "One topic, four experiences: learn, recall, apply and refresh.",
      owner: master.owner,
      audience: master.track === "coordinator" ? ["coordinator"] : master.track === "partner" ? ["partner"] : ["partner", "coordinator"],
      objective: master.outcome,
      trigger: { type: "lesson_completion", lessonSlug: master.slug, lessonVersion: master.version },
      schedule: { mode: "scheduled", unit: "calendar", deliveryDays: "weekdays", sendTime: "09:30", window: { start: "09:00", end: "17:00" } },
      timezoneFallback: "Australia/Brisbane",
      channel: "email",
      reminders: { enabled: true, afterWeekdays: 2 },
    };
    const steps: PathStep[] = [
      {
        key: "recall",
        stage: "Recall",
        followUpId: `lesson:${drafts.recall.slug}`,
        variants: {},
        gap: 14,
        message: drafts.recall.summary,
        required: false,
        completionRule: "response_and_feedback",
      },
      {
        key: "apply",
        stage: "Apply",
        followUpId: `lesson:${drafts.apply.slug}`,
        variants: {},
        gap: 46,
        message: drafts.apply.summary,
        required: false,
        completionRule: "response_and_feedback",
      },
      {
        key: "refresh",
        stage: "Refresh",
        followUpId: `lesson:${drafts.refresh.slug}`,
        adaptive: {
          ifStruggled: `lesson:${drafts.refreshSupport.slug}`,
          note: "Anyone who missed a first attempt earlier gets a reminder and extra practice.",
        },
        variants: {},
        gap: 38,
        message: drafts.refresh.summary,
        required: false,
        completionRule: "response_and_feedback",
      },
    ];
    const at = now.toISOString();
    db.prepare("INSERT OR IGNORE INTO paths VALUES (?, ?, ?)").run(pathId, at, actor.id);
    const latest = db.prepare("SELECT MAX(version) AS v FROM path_versions WHERE path_id = ?").get(pathId) as { v: number | null };
    const editable = db.prepare("SELECT version FROM path_versions WHERE path_id = ? AND status IN ('draft','in_review')").get(pathId) as
      { version: number } | undefined;
    if (editable) {
      db.prepare("UPDATE path_versions SET config = ?, steps = ?, status = 'draft', updated_at = ? WHERE path_id = ? AND version = ?").run(
        JSON.stringify(config),
        JSON.stringify(steps),
        at,
        pathId,
        editable.version,
      );
    } else {
      db.prepare("INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at) VALUES (?, ?, 'draft', ?, ?, ?, ?)").run(
        pathId,
        (latest.v ?? 0) + 1,
        JSON.stringify(config),
        JSON.stringify(steps),
        at,
        at,
      );
    }
    db.prepare(
      "INSERT INTO lesson_settings (slug, spaced, path_id, updated_at, updated_by) VALUES (?, 0, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET path_id = excluded.path_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    ).run(master.slug, pathId, at, actor.id);
    audit(db, {
      actor: actor.id,
      event: "spaced.generated",
      entity: `lesson:${master.slug}`,
      next: { model: GENERATION_MODEL, usage, instructions: instructions ?? null },
      at: now,
    });
  });
  return { pathId, slugs: STAGES.map((s) => drafts[s.key].slug), usage };
}
