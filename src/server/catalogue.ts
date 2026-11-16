import "server-only";
import { lessons } from "@/content/lessons";
import { topicSummary } from "@/lib/topicSummary";
import type { Db } from "./db";
import { missionSlugs } from "./challenges";
import { topicDates, topicSubjects } from "./topicSubjects";
import { myTopicAssignments } from "./people";
import { demoAddedAt, demoCompletions } from "@/content/catalogueDemo";

/** How far back "Popular with your colleagues" looks. */
export const POPULAR_DAYS = 30;
/** Fewer real completions than this in that time is too little to rank by, so the demo figures stand in. */
export const POPULAR_REAL_MIN = 20;

/** How many people finished each topic in the last POPULAR_DAYS days (or the demo figures, before there's enough). */
export function topicPopularity(db: Db, now: Date): Record<string, number> {
  const since = new Date(now.getTime() - POPULAR_DAYS * 86_400_000).toISOString();
  const rows = db
    .prepare("SELECT lesson_slug AS slug, COUNT(DISTINCT user_id) AS n FROM lesson_completions WHERE completed_at >= ? GROUP BY lesson_slug")
    .all(since) as { slug: string; n: number }[];
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return total >= POPULAR_REAL_MIN ? Object.fromEntries(rows.map((r) => [r.slug, r.n])) : demoCompletions;
}

/**
  Every topic in the catalogue, summarised for the homepage, Learning and Learning paths. Follow ups
  arrive in a sequence and challenge missions open one a day, so neither is listed.
  Given the person, topics a superadmin assigned them (server/people) come through as required, with
  their due date, so "Assigned to you" and "Your learning" pick them up.
*/
export function catalogueTopics(db: Db, userId?: string) {
  const subjects = topicSubjects(db);
  const dates = { ...demoAddedAt, ...topicDates(db) };
  const missions = missionSlugs(db);
  const assigned = userId ? myTopicAssignments(db, userId) : new Map<string, string | null>();
  return lessons
    .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
    .map((l) => {
      const t = topicSummary(l, subjects[l.slug] ?? null, dates[l.slug] ?? null);
      if (!assigned.has(l.slug)) return t;
      return { ...t, assignment: { required: true, due: assigned.get(l.slug) ?? t.assignment?.due } };
    });
}
