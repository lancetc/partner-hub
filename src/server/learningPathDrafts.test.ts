import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import { createLesson, publishLesson } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { recordLessonCompletion } from "./learning";
import { assignLearningPath, catalogueInfo, createLearningPath, learnerPath, myLearningPaths } from "./learningPaths";

/* Draft lessons in learning paths: they can be planned in, and learners see them as coming soon. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T04:00:00Z");

function draftPath() {
  const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "Talking about money", track: "core" }, now);
  const { id } = createLearningPath(db, u("jordan"), { name: "Money matters", lessons: ["a-little-extra-time", slug] }, now);
  assignLearningPath(db, u("jordan"), id, ["sam"], null, now);
  return { id, slug };
}

describe("draft lessons in learning paths", () => {
  it("offers drafts in the path builder, marked as drafts", () => {
    const { slug } = draftPath();
    expect(catalogueInfo(db).find((l) => l.slug === slug)).toMatchObject({ draft: true, title: "Talking about money" });
    expect(catalogueInfo(db).find((l) => l.slug === "a-little-extra-time")).toMatchObject({ draft: false });
  });

  it("shows drafts to learners as coming soon, without counting them", () => {
    const { id, slug } = draftPath();
    const p = learnerPath(db, u("sam"), id);
    expect(p.steps.map((s) => [s.slug, s.draft])).toEqual([
      ["a-little-extra-time", false],
      [slug, true],
    ]);
    expect(p.total).toBe(1);
    recordLessonCompletion(db, u("sam"), { slug: "a-little-extra-time", version: "1.0-demo" }, now);
    const after = myLearningPaths(db, u("sam")).find((x) => x.id === id)!;
    expect(after).toMatchObject({ completed: 1, total: 1, done: true, nextSlug: null });
  });

  it("counts the lesson once it's published", () => {
    const { id, slug } = draftPath();
    publishLesson(db, u("jordan"), slug, now);
    const p = learnerPath(db, u("sam"), id);
    expect(p.steps.find((s) => s.slug === slug)?.draft).toBe(false);
    expect(p.total).toBe(2);
  });
});
