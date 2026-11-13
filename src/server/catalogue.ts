import "server-only";
import { lessons } from "@/content/lessons";
import { topicSummary } from "@/lib/topicSummary";
import type { Db } from "./db";
import { missionSlugs } from "./challenges";
import { topicDates, topicSubjects } from "./topicSubjects";

/**
  Every topic in the catalogue, summarised for the homepage, Learning and Learning paths. Follow ups
  arrive in a sequence and challenge missions open one a day, so neither is listed.
*/
export function catalogueTopics(db: Db) {
  const subjects = topicSubjects(db);
  const dates = topicDates(db);
  const missions = missionSlugs(db);
  return lessons
    .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
    .map((l) => topicSummary(l, subjects[l.slug] ?? null, dates[l.slug] ?? null));
}
