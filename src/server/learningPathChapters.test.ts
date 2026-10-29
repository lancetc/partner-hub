import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { syncPublishedLessons } from "./lessonRegistry";
import { createPlaceholders } from "./authoredLessons";
import { assignLearningPath, chaptersFor, createLearningPath, learnerPath, learningPathDetail, updateLearningPath } from "./learningPaths";

/* Learning paths in chapters, with optional stages, and placeholder draft lessons for planning. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T04:00:00Z");

describe("chapters", () => {
  it("saves chapters in order with their lessons, and the path's lessons follow them", () => {
    const { id } = createLearningPath(
      db,
      u("jordan"),
      {
        name: "Care Coordination",
        lessons: [],
        chapters: [
          { title: "About Trilogy Care", description: "The organisation and its model of care.", lessons: ["our-mission-and-model"] },
          { title: "The Aged Care Sector", stage: "Stage 2: Working as a Care Coordinator", lessons: ["legislative-framework", "a-little-extra-time"] },
        ],
      },
      now,
    );
    const d = learningPathDetail(db, u("jordan"), id);
    expect(d.lessons).toEqual(["our-mission-and-model", "legislative-framework", "a-little-extra-time"]);
    expect(d.chapters.map((c) => [c.title, c.stage, c.lessons])).toEqual([
      ["About Trilogy Care", "", ["our-mission-and-model"]],
      ["The Aged Care Sector", "Stage 2: Working as a Care Coordinator", ["legislative-framework", "a-little-extra-time"]],
    ]);
    expect(d.chapters[0].description).toBe("The organisation and its model of care.");
  });

  it("can move lessons between chapters, and go back to a plain list", () => {
    const { id } = createLearningPath(
      db,
      u("jordan"),
      {
        name: "P",
        lessons: [],
        chapters: [
          { id: "a", title: "A", lessons: ["our-mission-and-model", "legislative-framework"] },
          { id: "b", title: "B", lessons: [] },
        ],
      },
      now,
    );
    updateLearningPath(
      db,
      u("jordan"),
      id,
      {
        name: "P",
        lessons: [],
        chapters: [
          { id: "a", title: "A", lessons: ["our-mission-and-model"] },
          { id: "b", title: "B", lessons: ["legislative-framework"] },
        ],
      },
      now,
    );
    expect(chaptersFor(db, id).map((c) => c.lessons)).toEqual([["our-mission-and-model"], ["legislative-framework"]]);
    updateLearningPath(db, u("jordan"), id, { name: "P", lessons: ["legislative-framework", "our-mission-and-model"] }, now);
    expect(chaptersFor(db, id)).toEqual([]);
    expect(learningPathDetail(db, u("jordan"), id).lessons).toEqual(["legislative-framework", "our-mission-and-model"]);
  });

  it("needs chapter titles, and each lesson only once", () => {
    expect(() => createLearningPath(db, u("jordan"), { name: "P", lessons: [], chapters: [{ title: " ", lessons: [] }] }, now)).toThrow(/chapter 1 a title/);
    expect(() =>
      createLearningPath(
        db,
        u("jordan"),
        {
          name: "P",
          lessons: [],
          chapters: [
            { title: "A", lessons: ["legislative-framework"] },
            { title: "B", lessons: ["legislative-framework"] },
          ],
        },
        now,
      ),
    ).toThrow(/only appear once/);
  });

  it("gives learners the chapters with their lessons", () => {
    const { id } = createLearningPath(
      db,
      u("jordan"),
      { name: "P", lessons: [], chapters: [{ title: "Basics", stage: "Stage 1", lessons: ["our-mission-and-model"] }] },
      now,
    );
    assignLearningPath(db, u("jordan"), id, ["sam"], null, now);
    expect(learnerPath(db, u("sam"), id).chapters).toEqual([expect.objectContaining({ title: "Basics", stage: "Stage 1", slugs: ["our-mission-and-model"] })]);
  });
});

describe("placeholder lessons", () => {
  it("creates empty drafts by title that can go straight into a path", () => {
    const made = createPlaceholders(db, u("jordan"), ["Dignity of Risk", "Cultural Safety & Diversity"], "coordinator", now);
    expect(made.map((m) => [m.title, m.track, m.draft])).toEqual([
      ["Dignity of Risk", "coordinator", true],
      ["Cultural Safety & Diversity", "coordinator", true],
    ]);
    const { id } = createLearningPath(db, u("jordan"), { name: "P", lessons: [], chapters: [{ title: "Rights", lessons: made.map((m) => m.slug) }] }, now);
    expect(learnerPath(db, u("jordan"), id).steps.every((s) => s.draft)).toBe(true);
  });

  it("is for learning authors only", () => {
    expect(() => createPlaceholders(db, u("casey"), ["Anything"], "core", now)).toThrow();
    expect(() => createPlaceholders(db, u("jordan"), [], "core", now)).toThrow(/Which topics/);
  });
});
