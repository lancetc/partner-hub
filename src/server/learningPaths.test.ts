import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import {
  archiveLearningPath,
  deletedLearningPaths,
  restoreLearningPath,
  canSkipHolds,
  assignLearningPath,
  assignableUsers,
  createLearningPath,
  learnerPath,
  learningPathDetail,
  listLearningPaths,
  myLearningPaths,
  unassignLearningPath,
  updateLearningPath,
} from "./learningPaths";

/* Learning paths: named sets of lessons, in order, assigned to people. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-22T04:00:00Z");
const onboarding = () => myLearningPaths(db, u("sam")).find((p) => p.id === "lp-partner-onboarding")!;

describe("learning paths", () => {
  it("seeds the six proposed pathways and shows them to the people assigned", () => {
    const all = listLearningPaths(db, u("jordan"));
    expect(all.map((p) => p.name)).toEqual([
      "Care Coordination",
      "Customer Service & Enquiries",
      "Leadership & Professional Development",
      "Partner Onboarding & Compliance",
      "Quality, Safety & Compliance",
      "Welcome to Trilogy Care",
    ]);
    expect(all.find((p) => p.id === "lp-care-coordination")!.audience).toBe("Care Coordinators");
    expect(myLearningPaths(db, u("sam")).map((p) => p.name)).toEqual(["Welcome to Trilogy Care", "Partner Onboarding & Compliance"]);
    expect(myLearningPaths(db, u("riley")).map((p) => p.name)).toEqual(["Care Coordination", "Welcome to Trilogy Care"]);
  });

  it("saves a planned path with no lessons, but won't assign it until it has some", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Later", audience: "Managers", lessons: [] }, now);
    expect(() => assignLearningPath(db, u("jordan"), id, ["sam"], null, now)).toThrow(/Add lessons/);
    expect(() => assignLearningPath(db, u("jordan"), "lp-leadership", ["sam"], null, now)).toThrow(/Add lessons/);
  });

  it("opens lessons one at a time when the path is in order, and tracks progress", () => {
    expect(onboarding().steps.map((s) => s.locked)).toEqual([false, true, true, true]);
    recordLessonCompletion(db, u("sam"), { slug: "our-mission-and-model", version: "1.1" }, now);
    const p = onboarding();
    expect(p.completed).toBe(1);
    expect(p.nextSlug).toBe("legislative-framework");
    expect(p.steps.map((s) => s.locked)).toEqual([false, false, true, true]);
  });

  it("creates a path with a name and lessons in the chosen order", () => {
    const { id } = createLearningPath(
      db,
      u("jordan"),
      { name: "Gardening start", lessons: ["noticing-a-change", "our-mission-and-model"], inOrder: false },
      now,
    );
    expect(id).toBe("lp-gardening-start");
    const d = learningPathDetail(db, u("jordan"), id);
    expect(d.lessons).toEqual(["noticing-a-change", "our-mission-and-model"]);
    expect(d.inOrder).toBe(false);
  });

  it("rejects a path without a name, with repeats or with spaced follow ups", () => {
    const j = u("jordan");
    expect(() => createLearningPath(db, j, { name: " ", lessons: ["noticing-a-change"] }, now)).toThrow(/name/);
    expect(() => createLearningPath(db, j, { name: "Twice", lessons: ["noticing-a-change", "noticing-a-change"] }, now)).toThrow(/only appear once/);
    expect(() => createLearningPath(db, j, { name: "Follow up", lessons: ["lf-recall"] }, now)).toThrow(/Unknown lesson/);
  });

  it("lets an organisation admin assign only their own people", () => {
    const casey = u("casey");
    expect(assignableUsers(db, casey).map((p) => p.id)).toEqual(["sam"]);
    expect(() => assignLearningPath(db, casey, "lp-care-coordination", ["riley"], null, now)).toThrow(/your organisation/);
    assignLearningPath(db, casey, "lp-care-coordination", ["sam"], "2026-12-01", now);
    expect(myLearningPaths(db, u("sam")).map((p) => p.id)).toContain("lp-care-coordination");
    // Casey sees only Taylor Cleaning's assignments.
    expect(learningPathDetail(db, casey, "lp-partner-onboarding").assignments.map((a) => a.userId)).toEqual(["sam"]);
  });

  it("keeps a Trilogy path's lessons out of an organisation admin's hands", () => {
    expect(() => updateLearningPath(db, u("casey"), "lp-partner-onboarding", { name: "Mine now", lessons: ["noticing-a-change"] }, now)).toThrow(
      /learning author/,
    );
    expect(() => updateLearningPath(db, u("sam"), "lp-partner-onboarding", { name: "x", lessons: ["noticing-a-change"] }, now)).toThrow(/access/);
  });

  it("removes and archives without losing completions", () => {
    recordLessonCompletion(db, u("sam"), { slug: "our-mission-and-model", version: "1.1" }, now);
    unassignLearningPath(db, u("jordan"), "lp-partner-onboarding", "sam", now);
    expect(myLearningPaths(db, u("sam")).map((p) => p.id)).toEqual(["lp-welcome"]);
    archiveLearningPath(db, u("jordan"), "lp-care-coordination", now);
    expect(myLearningPaths(db, u("riley")).map((p) => p.id)).toEqual(["lp-welcome"]);
    expect((db.prepare("SELECT COUNT(*) n FROM lesson_completions WHERE user_id = 'sam'").get() as { n: number }).n).toBe(1);
  });
});

describe("skipping for testers", () => {
  it("lets people on a path that allows it skip holds in that path's lessons only", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Test run", allowSkip: true, lessons: ["a-little-extra-time"] }, now);
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(false);
    assignLearningPath(db, u("jordan"), id, ["ash"], null, now);
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(true);
    expect(canSkipHolds(db, "ash", "legislative-framework")).toBe(false);
    expect(learningPathDetail(db, u("jordan"), id).allowSkip).toBe(true);
  });

  it("stops once the setting is turned off or the path is archived", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Test run", allowSkip: true, lessons: ["a-little-extra-time"] }, now);
    assignLearningPath(db, u("jordan"), id, ["ash"], null, now);
    updateLearningPath(db, u("jordan"), id, { name: "Test run", lessons: ["a-little-extra-time"] }, now);
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(false);
    updateLearningPath(db, u("jordan"), id, { name: "Test run", allowSkip: true, lessons: ["a-little-extra-time"] }, now);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(false);
  });

  it("keeps the overview learners see: who it's for, outcomes and what they get", () => {
    const { id } = createLearningPath(
      db,
      u("jordan"),
      {
        name: "Overview test",
        whoFor: "  New coordinators  ",
        outcomes: ["Know who to call", "", "  Write a case note ", ...Array.from({ length: 10 }, (_, i) => `Extra ${i}`)],
        reward: "A certificate",
        lessons: ["a-little-extra-time"],
      },
      now,
    );
    const d = learningPathDetail(db, u("jordan"), id);
    expect(d.whoFor).toBe("New coordinators");
    expect(d.outcomes.slice(0, 2)).toEqual(["Know who to call", "Write a case note"]);
    expect(d.outcomes).toHaveLength(8);
    expect(learnerPath(db, u("sam"), id)).toMatchObject({ whoFor: "New coordinators", reward: "A certificate" });
    updateLearningPath(db, u("jordan"), id, { name: "Overview test", lessons: ["a-little-extra-time"] }, now);
    expect(learnerPath(db, u("sam"), id)).toMatchObject({ whoFor: "", outcomes: [], reward: "" });
  });
});

describe("deleting learning paths", () => {
  it("hides a deleted path from the list and learners, and restores it with its assignments", () => {
    const id = "lp-partner-onboarding";
    expect(myLearningPaths(db, u("sam")).some((p) => p.id === id)).toBe(true);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(myLearningPaths(db, u("sam")).some((p) => p.id === id)).toBe(false);
    expect(deletedLearningPaths(db, u("jordan"))).toEqual([expect.objectContaining({ id, assigned: 2, lessons: 4, canEdit: true })]);
    expect(() => restoreLearningPath(db, u("sam"), id, now)).toThrow();
    restoreLearningPath(db, u("jordan"), id, now);
    expect(myLearningPaths(db, u("sam")).some((p) => p.id === id)).toBe(true);
    expect(deletedLearningPaths(db, u("jordan"))).toEqual([]);
    expect(() => restoreLearningPath(db, u("jordan"), id, now)).toThrow(/deleted list/);
  });
});
