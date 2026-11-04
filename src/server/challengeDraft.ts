import "server-only";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { GENERATION_MODEL } from "./generate";
import { MAX_BRIEF, readSource } from "./lessonDraft";
import { askForJson, contentFor, keyCounts } from "./claudeJson";
import { catalogueInfo } from "./learningPaths";
import { MAX_DAYS } from "./challenges";

/*
  Drafts a challenge with Claude from an author's brief and, optionally, a source document: a name,
  tagline and story, and one mission a day, each with a line of story leading into it. Missions use
  existing topics where they fit; anything else comes back as a new topic for the author to create.
  Nothing is saved here: the author reviews it, then applies it in the challenge editor.
*/

export type ChallengeDraftProgress =
  | { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number }
  | { type: "stages"; counts: Record<string, number>; details: Record<string, string> };

export type ChallengeDraft = {
  name: string;
  tagline: string;
  story: string;
  missions: ({ day: number; beat: string } & ({ slug: string } | { newTopic: string }))[];
};

type Raw = {
  name?: unknown;
  tagline?: unknown;
  story?: unknown;
  missions?: { day?: unknown; beat?: unknown; slug?: unknown; newTopic?: unknown }[];
};

export function challengePrompt(
  brief: string,
  days: number,
  catalogue: { slug: string; title: string; summary: string; minutes: number; track: string | null }[],
  source?: { name: string },
) {
  return `You are designing a Trilogy Challenge for Trilogy Care's Partner Hub, a training site for Australian aged care service partners and care coordinators. A challenge runs for ${days} days: each day one short topic (a "mission") opens for everyone at once, and teams earn points for finishing it. A story runs through the week, and each day has a "beat": one or two sentences of that story leading into the day's mission.

The author's brief:
<brief>
${brief.trim()}
</brief>
${source ? `\nSource material: the attached document "${source.name}". Base the challenge's focus on it.\n` : ""}
The topics that already exist (use these wherever they fit, by slug):
${JSON.stringify(catalogue.map((t) => ({ slug: t.slug, title: t.title, summary: t.summary, minutes: t.minutes, for: t.track })))}

How to design it:
- Exactly ${days} missions, day 1 to ${days}, each a different topic, in an order that builds through the week.
- Prefer existing topics. Only name a new topic where the brief needs something no existing topic covers; give it a clear 3 to 7 word title.
- The story follows fictional people (first names only, no identifiable client or health details) through a believable week of Support at Home work.
- Warm, clear Australian English. Encouraging, but no exclamation marks.

Reply with only this JSON object, keys in this order, no prose and no code fences:
{
  "name": "the challenge's name, e.g. Trilogy Challenge: Margaret’s Week",
  "tagline": "one line, under 90 characters",
  "story": "two to four sentences setting up the week's story",
  "missions": [{"day": 1, "beat": "one or two sentences of story", "slug": "an-existing-slug"} or {"day": 1, "beat": "...", "newTopic": "Title of a topic to write"}, ...]
}`;
}

/** Checks Claude's challenge: the shape, one mission a day, existing slugs, and no topic twice. */
export function challengeIssues(value: unknown, known: Set<string>, days: number): string[] {
  const v = value as Raw;
  if (!v || typeof v !== "object") return ["not an object"];
  const issues: string[] = [];
  if (typeof v.name !== "string" || !v.name.trim()) issues.push("needs a name");
  if (typeof v.story !== "string" || !v.story.trim()) issues.push("needs a story");
  if (!Array.isArray(v.missions)) return [...issues, "needs missions"];
  if (v.missions.length !== days) issues.push(`needs exactly ${days} missions, one a day`);
  const seen = new Set<string>();
  v.missions.forEach((m, i) => {
    if (m?.day !== i + 1) issues.push(`mission ${i + 1} should be day ${i + 1}`);
    if (typeof m?.beat !== "string" || !m.beat.trim()) issues.push(`day ${i + 1} needs a beat`);
    if (typeof m?.slug === "string") {
      if (!known.has(m.slug)) issues.push(`"${m.slug}" isn't an existing topic: use a slug from the list, or "newTopic"`);
      else if (seen.has(m.slug)) issues.push(`"${m.slug}" is used on more than one day`);
      seen.add(m.slug);
    } else if (typeof m?.newTopic !== "string" || !m.newTopic.trim()) issues.push(`day ${i + 1} needs "slug" or "newTopic"`);
  });
  return issues;
}

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

export async function generateChallengeDraft(
  db: Db,
  actor: User,
  req: { brief: string; days: number },
  file: File | null,
  now: Date,
  onProgress: (p: ChallengeDraftProgress) => void = () => {},
): Promise<{ draft: ChallengeDraft; source: string | null }> {
  requireAuthor(actor);
  const brief = (req.brief ?? "").trim();
  if (brief.length < 10 && !file) throw new HttpError(400, "Write a short brief, or attach a document to work from.");
  if (brief.length > MAX_BRIEF) throw new HttpError(400, `Keep the brief under ${MAX_BRIEF} characters. Attach a document for anything longer.`);
  const days = Math.min(MAX_DAYS, Math.max(2, Math.round(req.days) || 5));
  if (file) onProgress({ type: "phase", phase: "reading" });
  const source = file ? await readSource(file) : undefined;
  const catalogue = catalogueInfo(db).filter((t) => t.track !== "reinforcement" && !t.draft);
  const known = new Set(catalogue.map((t) => t.slug));

  let last = "";
  const onText = (soFar: string) => {
    const k = keyCounts(soFar, ["name", "story", "day", "slug", "newTopic"]);
    const counts = { theme: k.name, story: k.story, missions: k.day };
    const details = {
      theme: k.name ? "Written" : "",
      story: k.story ? "Written" : "",
      missions: k.day ? `${k.day} of ${days} days · ${k.slug} existing ${k.slug === 1 ? "topic" : "topics"} · ${k.newTopic} new` : "",
    };
    const key = JSON.stringify([counts, details]);
    if (key !== last) onProgress({ type: "stages", counts, details });
    last = key;
  };
  onProgress({ type: "phase", phase: "writing" });
  const { value, usage } = await askForJson<Raw>(
    contentFor(challengePrompt(brief || "Design a challenge from the attached document.", days, catalogue, source), source),
    (v) => challengeIssues(v, known, days),
    { onText, onPhase: (phase, issues) => onProgress({ type: "phase", phase, issues }) },
  );
  const draft: ChallengeDraft = {
    name: text(value.name, 120),
    tagline: text(value.tagline, 160),
    story: text(value.story, 1000),
    missions: (value.missions ?? []).map((m, i) =>
      typeof m.slug === "string"
        ? { day: i + 1, beat: text(m.beat, 300), slug: m.slug }
        : { day: i + 1, beat: text(m.beat, 300), newTopic: text(m.newTopic, 120) },
    ),
  };
  audit(db, {
    actor: actor.id,
    event: "challenge.drafted",
    entity: "challenge:new",
    next: { model: GENERATION_MODEL, usage, source: source?.name ?? null, days },
    at: now,
  });
  return { draft, source: source?.name ?? null };
}
