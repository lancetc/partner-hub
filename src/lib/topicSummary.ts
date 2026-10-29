import type { Lesson } from "@/content/lessons";
import type { SubjectId } from "./subjects";

/** What the Learning page needs about a topic: enough to show, search, filter and sort it, without its cards. */
export type TopicSummary = Pick<Lesson, "slug" | "title" | "summary" | "outcome" | "minutes" | "track" | "visual" | "assignment"> & {
  steps: number;
  /** Which step each card belongs to, to show "step 3 of 7" for a topic in progress. */
  stepOf: Record<string, number>;
  subject: SubjectId | null;
  /** When it was first published, for "Newest first". */
  publishedAt: string | null;
};

export function topicSummary(l: Lesson, subject: SubjectId | null, publishedAt: string | null): TopicSummary {
  return {
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    outcome: l.outcome,
    minutes: l.minutes,
    track: l.track,
    visual: l.visual,
    assignment: l.assignment,
    steps: l.beats.length,
    stepOf: Object.fromEntries(Object.values(l.nodes).map((n) => [n.id, n.beat])),
    subject,
    publishedAt,
  };
}
