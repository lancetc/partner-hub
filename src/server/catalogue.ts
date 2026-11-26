import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import { topicSummary } from "@/lib/topicSummary";
import type { Db } from "./db";
import { challengeForMission, missionSlugs } from "./challenges";
import { canAuthor, userById, type User } from "./auth";
import { isFor } from "./completionReports";
import { pathFor } from "./learningPaths";
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
  Whether a topic is for this person, by its track: Care Partner topics for partners, coordinator topics for
  coordinators, and everything else (core topics, briefings) for everyone. The same line the completion reports
  draw (completionReports.isFor). Trilogy staff see both, as they do webinars and news (a topic can't be written
  for staff alone), and authors see everything.
*/
export const topicIsFor = (user: User, l: Pick<Lesson, "track">) => canAuthor(user) || user.audience === "staff" || isFor(l, user.audience);

/**
  Whether this person may open a topic, by its link as well as from a list: one that's for them (topicIsFor),
  or one they've been given another way: assigned to them, a mission in a challenge they're in, or in a
  Discovery Path that's for them or assigned to them. Anything else is "not found", so a pasted link or a
  search result doesn't put another audience's topic in front of them.
*/
export function canOpenTopic(db: Db, user: User, slug: string) {
  const l = lessons.find((x) => x.slug === slug);
  if (!l) return false;
  if (topicIsFor(user, l) || myTopicAssignments(db, user.id).has(slug) || challengeForMission(db, user, slug)) return true;
  const paths = db
    .prepare("SELECT p.id, p.audience FROM learning_paths p JOIN learning_path_lessons pl ON pl.path_id = p.id WHERE pl.lesson_slug = ? AND p.archived = 0")
    .all(slug) as { id: string; audience: string }[];
  return paths.some((p) => pathFor(db, user, p));
}

/**
  Every topic in the catalogue, summarised for the homepage, Learning and Learning paths. Follow ups
  arrive in a sequence and challenge missions open one a day, so neither is listed.
  Given the person, topics a superadmin assigned them (server/people) come through as required, with
  their due date, so "Assigned to you" and "Your learning" pick them up. Given the person, it's only the topics
  for them (topicIsFor) and any assigned to them: a coordinator isn't shown the Care Partners' topics.
*/
export function catalogueTopics(db: Db, userId?: string) {
  const subjects = topicSubjects(db);
  const dates = { ...demoAddedAt, ...topicDates(db) };
  const missions = missionSlugs(db);
  const assigned = userId ? myTopicAssignments(db, userId) : new Map<string, string | null>();
  const user = userId ? userById(db, userId) : undefined;
  return lessons
    .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
    .filter((l) => !user || topicIsFor(user, l) || assigned.has(l.slug))
    .map((l) => {
      const t = topicSummary(l, subjects[l.slug] ?? null, dates[l.slug] ?? null);
      if (!assigned.has(l.slug)) return t;
      return { ...t, assignment: { required: true, due: assigned.get(l.slug) ?? t.assignment?.due } };
    });
}
