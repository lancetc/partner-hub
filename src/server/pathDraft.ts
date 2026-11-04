import "server-only";

import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { GENERATION_MODEL } from "./generate";
import { MAX_BRIEF, readSource } from "./lessonDraft";
import { askForJson, contentFor, keyCounts } from "./claudeJson";
import { catalogueInfo } from "./learningPaths";

/*
  Drafts a learning path with Claude from an author's brief and, optionally, a source document:
  its overview, outcomes, and chapters of topics. Claude is given the topic catalogue and uses
  existing topics where they fit; anything else comes back as a new topic for the author to create.
  Nothing is saved here: the author reviews the outline, then applies it in the path editor.
*/

export type PathDraftProgress =
  | { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number }
  | { type: "stages"; counts: Record<string, number>; details: Record<string, string> };

export type PathDraft = {
  name: string;
  description: string;
  audience: string;
  whoFor: string;
  outcomes: string[];
  chapters: { title: string; description: string; stage: string; topics: ({ slug: string } | { newTopic: string })[] }[];
};

type Raw = {
  whoFor?: unknown;
  name?: unknown;
  description?: unknown;
  audience?: unknown;
  outcomes?: { outcome?: unknown }[];
  chapters?: { chapter?: unknown; description?: unknown; stage?: unknown; topics?: { slug?: unknown; newTopic?: unknown }[] }[];
};

const AUDIENCE: Record<string, string> = {
  core: "everyone: service partners and care coordinators",
  partner: "service partners: cleaners, gardeners and other providers who visit older clients at home",
  coordinator: "care coordinators who plan and manage clients' Support at Home services",
};

export function pathPrompt(
  brief: string,
  audience: string,
  catalogue: { slug: string; title: string; summary: string; minutes: number; track: string | null; draft: boolean }[],
  source?: { name: string },
) {
  return `You are planning a learning path for Trilogy Care's Partner Hub, a training site for Australian aged care service partners and care coordinators. A learning path is an ordered set of short topics, grouped into chapters, that an administrator assigns to people.

The author's brief:
<brief>
${brief.trim()}
</brief>

Who it's for: ${AUDIENCE[audience] ?? AUDIENCE.core}.
${source ? `Source material: the attached document "${source.name}". Base the path's scope on it.` : ""}

The topics that already exist (use these wherever they fit, by slug; a draft is still being written):
${JSON.stringify(catalogue.map((t) => ({ slug: t.slug, title: t.title, summary: t.summary, minutes: t.minutes, for: t.track, draft: t.draft || undefined })))}

How to plan it:
- Prefer existing topics. Only name a new topic where the brief needs something no existing topic covers; give it a clear 3 to 7 word title.
- Two to eight chapters, in the order someone should learn them, each with one to six topics. Each topic appears once in the whole path.
- Optionally group chapters into stages (for example "Stage 1: Getting started"); leave "stage" empty if not needed.
- Warm, clear Australian English. No exclamation marks.

Reply with only this JSON object, keys in this order, no prose and no code fences:
{
  "whoFor": "one sentence for the learner on who the path is for",
  "name": "the path's name, 2 to 6 words",
  "description": "two or three sentences on what it covers and why it matters",
  "audience": "a short audience label, e.g. Care Coordinators",
  "outcomes": [{"outcome": "a verb-led outcome"}, ...3 to 6],
  "chapters": [{"chapter": "chapter title", "description": "one sentence", "stage": "", "topics": [{"slug": "an-existing-slug"} or {"newTopic": "Title of a topic to write"}, ...]}]
}`;
}

/** Checks Claude's path: the shape, existing slugs, and no topic twice. */
export function pathIssues(value: unknown, known: Set<string>): string[] {
  const v = value as Raw;
  if (!v || typeof v !== "object") return ["not an object"];
  const issues: string[] = [];
  if (typeof v.name !== "string" || !v.name.trim()) issues.push("needs a name");
  if (!Array.isArray(v.outcomes) || !v.outcomes.length) issues.push("needs outcomes");
  if (!Array.isArray(v.chapters) || !v.chapters.length) return [...issues, "needs chapters"];
  const seen = new Set<string>();
  v.chapters.forEach((c, i) => {
    if (typeof c?.chapter !== "string" || !c.chapter.trim()) issues.push(`chapter ${i + 1} needs a title`);
    if (!Array.isArray(c?.topics) || !c.topics.length) return void issues.push(`chapter ${i + 1} needs topics`);
    for (const t of c.topics) {
      if (typeof t?.slug === "string") {
        if (!known.has(t.slug)) issues.push(`"${t.slug}" isn't an existing topic: use a slug from the list, or "newTopic"`);
        else if (seen.has(t.slug)) issues.push(`"${t.slug}" appears more than once`);
        seen.add(t.slug);
      } else if (typeof t?.newTopic !== "string" || !t.newTopic.trim()) issues.push(`chapter ${i + 1} has a topic with neither "slug" nor "newTopic"`);
    }
  });
  return issues;
}

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

export async function generatePathDraft(
  db: Db,
  actor: User,
  req: { brief: string; audience: string },
  file: File | null,
  now: Date,
  onProgress: (p: PathDraftProgress) => void = () => {},
): Promise<{ draft: PathDraft; source: string | null }> {
  requireAuthor(actor);
  const brief = (req.brief ?? "").trim();
  if (brief.length < 10 && !file) throw new HttpError(400, "Write a short brief, or attach a document to work from.");
  if (brief.length > MAX_BRIEF) throw new HttpError(400, `Keep the brief under ${MAX_BRIEF} characters. Attach a document for anything longer.`);
  if (file) onProgress({ type: "phase", phase: "reading" });
  const source = file ? await readSource(file) : undefined;
  const catalogue = catalogueInfo(db).filter((t) => t.track !== "reinforcement");
  const known = new Set(catalogue.map((t) => t.slug));

  let last = "";
  const onText = (soFar: string) => {
    const k = keyCounts(soFar, ["whoFor", "outcome", "chapter", "slug", "newTopic"]);
    const counts = { who: k.whoFor, outcomes: k.outcome, chapters: k.chapter };
    const details = {
      who: k.whoFor ? "Written" : "",
      outcomes: k.outcome ? `${k.outcome} ${k.outcome === 1 ? "outcome" : "outcomes"}` : "",
      chapters: k.chapter
        ? `${k.chapter} ${k.chapter === 1 ? "chapter" : "chapters"} · ${k.slug} existing ${k.slug === 1 ? "topic" : "topics"} · ${k.newTopic} new`
        : "",
    };
    const key = JSON.stringify([counts, details]);
    if (key !== last) onProgress({ type: "stages", counts, details });
    last = key;
  };
  onProgress({ type: "phase", phase: "writing" });
  const { value, usage } = await askForJson<Raw>(
    contentFor(pathPrompt(brief || "Plan a path from the attached document.", req.audience, catalogue, source), source),
    (v) => pathIssues(v, known),
    { onText, onPhase: (phase, issues) => onProgress({ type: "phase", phase, issues }) },
  );
  // Drop any repeat, in case one slipped through as a new topic with an existing title.
  const draft: PathDraft = {
    name: text(value.name, 120),
    description: text(value.description, 500),
    audience: text(value.audience, 120),
    whoFor: text(value.whoFor, 300),
    outcomes: (value.outcomes ?? [])
      .map((o) => text(o?.outcome, 160))
      .filter(Boolean)
      .slice(0, 8),
    chapters: (value.chapters ?? []).map((c) => ({
      title: text(c.chapter, 120),
      description: text(c.description, 300),
      stage: text(c.stage, 120),
      topics: (c.topics ?? []).map((t) => (typeof t.slug === "string" ? { slug: t.slug } : { newTopic: text(t.newTopic, 120) })),
    })),
  };
  audit(db, {
    actor: actor.id,
    event: "learning_path.drafted",
    entity: "learning_path:new",
    next: { model: GENERATION_MODEL, usage, source: source?.name ?? null, chapters: draft.chapters.length },
    at: now,
  });
  return { draft, source: source?.name ?? null };
}
