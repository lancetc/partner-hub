import "server-only";
import { lessons } from "@/content/lessons";
import { topicSummary } from "@/lib/topicSummary";
import type { Db } from "./db";
import { missionSlugs } from "./challenges";
import { topicDates, topicSubjects } from "./topicSubjects";
import { myTopicAssignments } from "./people";

/**
  Every topic in the catalogue, summarised for the homepage, Learning and Learning paths. Follow ups
  arrive in a sequence and challenge missions open one a day, so neither is listed.
  Given the person, topics a superadmin assigned them (server/people) come through as required, with
  their due date, so "Assigned to you" and "Your learning" pick them up.
*/
export function catalogueTopics(db: Db, userId?: string) {
  const subjects = topicSubjects(db);
  const dates = topicDates(db);
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
