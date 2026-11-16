import "server-only";
import { randomBytes } from "node:crypto";
import type { Lesson } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { askForJson, keyCounts } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import {
  cleanInterest,
  sampleDraftIssues,
  sampleLesson,
  samplePrompt,
  sampleSlug,
  templateDraft,
  type SampleDraft,
  type SampleProgress,
  type SampleTopicItem,
} from "@/lib/sampleTopic";

/*
  Sample topics from onboarding: the person says what they'd like to learn, and a short topic is made
  for them and added to their learning. Claude writes it when it's connected; otherwise (or if Claude
  fails) a simple starter template is used, so onboarding always finishes with something to play.
  Each topic is personal: only the person it was made for can open it.
*/

/** Enough for anyone trying a few interests; stops a loop filling the database. */
const MAX_PER_PERSON = 20;

type Row = { slug: string; user_id: string; interest: string; content: string; made_by: "claude" | "template"; model: string | null; created_at: string };



const claudeConnected = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Asks Claude for the draft; throws if it can't be had. */
async function claudeDraft(interest: string, user: User, onProgress: (p: SampleProgress) => void) {
  onProgress({ type: "phase", phase: "writing" });
  let last = 0;
  const { value, usage } = await askForJson<SampleDraft>(
    [{ type: "text", text: samplePrompt(interest, { role: user.audience === "coordinator" ? "a care coordinator" : user.audience === "staff" ? "Trilogy Care staff" : "a Care Partner" }) }],
    sampleDraftIssues,
    {
      onText: (soFar) => {
        const count = keyCounts(soFar, ["heading"]).heading;
        if (count !== last) onProgress({ type: "cards", count });
        last = count;
      },
      onPhase: (phase) => onProgress({ type: "phase", phase }),
    },
    // A short topic someone is waiting for: Claude Opus 5.5's default effort is plenty.
    "medium",
  );
  return { draft: value, usage };
}

/**
  Makes a sample topic on what they'd like to learn, saves it and returns it. Uses Claude when it's
  connected, and the starter template when it isn't or when Claude can't produce one.
*/
export async function createSampleTopic(db: Db, user: User, interestInput: unknown, now: Date, onProgress: (p: SampleProgress) => void = () => {}) {
  const interest = cleanInterest(interestInput);
  if (!interest) throw new HttpError(400, "Tell us a little about what you’d like to learn (a few words is fine).");
  const count = (db.prepare("SELECT COUNT(*) AS n FROM sample_topics WHERE user_id = ?").get(user.id) as { n: number }).n;
  if (count >= MAX_PER_PERSON) throw new HttpError(429, "You’ve made lots of sample topics already. Have a look through Discovery Paths for more.");

  let draft: SampleDraft | null = null;
  let usage: unknown = null;
  let fallbackReason: string | null = claudeConnected() ? null : "not connected";
  if (!fallbackReason) {
    try {
      ({ draft, usage } = await claudeDraft(interest, user, onProgress));
    } catch (e) {
      fallbackReason = e instanceof HttpError ? e.message : "Claude request failed";
      if (!(e instanceof HttpError)) console.error(e);
    }
  }
  const madeBy = draft ? "claude" : "template";
  if (!draft) {
    onProgress({ type: "phase", phase: "template" });
    draft = templateDraft(interest);
  }

  const slug = sampleSlug(draft.title, randomBytes(4).toString("hex"));
  const lesson = sampleLesson(draft, { slug, interest, now, madeBy });
  db.prepare("INSERT INTO sample_topics (slug, user_id, interest, content, made_by, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    slug,
    user.id,
    interest,
    JSON.stringify(lesson),
    madeBy,
    madeBy === "claude" ? GENERATION_MODEL : null,
    now.toISOString(),
  );
  audit(db, {
    actor: user.id,
    event: "sample_topic.created",
    entity: `sample:${slug}`,
    next: { madeBy, model: madeBy === "claude" ? GENERATION_MODEL : null, usage, cards: Object.keys(lesson.nodes).length },
    reason: fallbackReason ? `Starter template used: ${fallbackReason}` : undefined,
    at: now,
  });
  return { topic: item(db, slug)! };
}

const toItem = (r: Row): SampleTopicItem => {
  const l = JSON.parse(r.content) as Lesson;
  return { slug: r.slug, title: l.title, summary: l.summary, minutes: l.minutes, interest: r.interest, madeBy: r.made_by, createdAt: r.created_at };
};

function item(db: Db, slug: string) {
  const r = db.prepare("SELECT * FROM sample_topics WHERE slug = ?").get(slug) as Row | undefined;
  return r ? toItem(r) : undefined;
}

/** Their sample topics, newest first. */
export function mySampleTopics(db: Db, user: User): SampleTopicItem[] {
  return (db.prepare("SELECT * FROM sample_topics WHERE user_id = ? ORDER BY created_at DESC").all(user.id) as Row[]).map(toItem);
}

/** One of their sample topics to play, or undefined if it isn't theirs (or doesn't exist). */
export function mySampleLesson(db: Db, user: User, slug: string): Lesson | undefined {
  const r = db.prepare("SELECT * FROM sample_topics WHERE slug = ? AND user_id = ?").get(slug, user.id) as Row | undefined;
  return r ? (JSON.parse(r.content) as Lesson) : undefined;
}
