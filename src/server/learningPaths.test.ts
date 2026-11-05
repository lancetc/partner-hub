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
  certificateFor,
  myCertificates,
  startedLearningPaths,
  nextTopicAfter,
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
    expect(() => assignLearningPath(db, u("jordan"), id, ["sam"], null, now)).toThrow(/Add topics/);
    expect(() => assignLearningPath(db, u("jordan"), "lp-leadership", ["sam"], null, now)).toThrow(/Add topics/);
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
    expect(() => createLearningPath(db, j, { name: "Follow up", lessons: ["lf-recall"] }, now)).toThrow(/Unknown topic/);
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

  it("keeps a picture for Who it's for, from the image library only", () => {
    const pic = "/api/uploads/6c11c3ba-7079-4214-8405-1c9c09804ea8.webp";
    const { id } = createLearningPath(
      db,
      u("jordan"),
      { name: "Picture test", whoFor: "New coordinators", whoPhoto: pic, lessons: ["a-little-extra-time"] },
      now,
    );
    expect(learnerPath(db, u("sam"), id).whoPhoto).toBe(pic);
    expect(() => updateLearningPath(db, u("jordan"), id, { name: "Picture test", whoPhoto: "https://evil.example/x.jpg", lessons: [] }, now)).toThrow(
      /image library/,
    );
    updateLearningPath(db, u("jordan"), id, { name: "Picture test", whoPhoto: "", lessons: ["a-little-extra-time"] }, now);
    expect(learnerPath(db, u("sam"), id).whoPhoto).toBe("");
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

describe("the survey at the end of every path", () => {
  const surveyFor = (id: string) =>
    (db.prepare("SELECT survey_id FROM survey_links WHERE target_type = 'path' AND target_id = ?").get(id) as { survey_id: string } | undefined)?.survey_id;

  it("gives a new path the learning path feedback survey", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Survey test", lessons: ["a-little-extra-time"] }, now);
    expect(surveyFor(id)).toBe("sv-module-feedback");
  });

  it("gives a restored path one if it has none, and leaves an author's choice alone", () => {
    const id = "lp-care-coordination";
    archiveLearningPath(db, u("jordan"), id, now);
    db.prepare("DELETE FROM survey_links WHERE target_id = ?").run(id);
    restoreLearningPath(db, u("jordan"), id, now);
    expect(surveyFor(id)).toBe("sv-module-feedback");
    db.prepare("UPDATE survey_links SET survey_id = 'sv-lesson-check-in' WHERE target_id = ?").run(id);
    archiveLearningPath(db, u("jordan"), id, now);
    restoreLearningPath(db, u("jordan"), id, now);
    expect(surveyFor(id)).toBe("sv-lesson-check-in");
  });

  it("does nothing once the default survey is archived", () => {
    db.prepare("UPDATE surveys SET archived = 1 WHERE id = 'sv-module-feedback'").run();
    const { id } = createLearningPath(db, u("jordan"), { name: "No survey", lessons: ["a-little-extra-time"] }, now);
    expect(surveyFor(id)).toBeUndefined();
  });
});

describe("certificates", () => {
  const finish = (user: string, slugs: string[], at: Date) => slugs.forEach((slug) => recordLessonCompletion(db, u(user), { slug, version: "1.1" }, at));

  it("is earned by finishing every topic, and dated by the last one", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Two topics", lessons: ["a-little-extra-time", "our-mission-and-model"] }, now);
    finish("sam", ["a-little-extra-time"], now);
    expect(certificateFor(db, u("sam"), id)).toBeNull();
    const later = new Date("2026-10-23T04:00:00Z");
    finish("sam", ["our-mission-and-model"], later);
    expect(certificateFor(db, u("sam"), id)).toMatchObject({ name: "Two topics", topics: 2, completedAt: later.toISOString(), deleted: false });
    expect(myCertificates(db, u("sam")).map((c) => c.id)).toContain(id);
    expect(myCertificates(db, u("riley")).map((c) => c.id)).not.toContain(id);
  });

  it("still stands after the path is deleted", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Short path", lessons: ["a-little-extra-time"] }, now);
    finish("sam", ["a-little-extra-time"], now);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(certificateFor(db, u("sam"), id)).toMatchObject({ deleted: true });
    expect(myCertificates(db, u("sam")).some((c) => c.id === id)).toBe(true);
  });
});

describe("paths someone has started on their own", () => {
  it("lists live, unassigned paths with a topic they've done, and not their assigned ones", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Self-paced", lessons: ["noticing-a-change", "our-mission-and-model"] }, now);
    expect(startedLearningPaths(db, u("riley")).map((p) => p.id)).not.toContain(id);
    recordLessonCompletion(db, u("riley"), { slug: "noticing-a-change", version: "1.0" }, now);
    const started = startedLearningPaths(db, u("riley")).find((p) => p.id === id);
    expect(started).toMatchObject({ assigned: false, completed: 1, dueDate: null });
    assignLearningPath(db, u("jordan"), id, ["riley"], null, now);
    expect(startedLearningPaths(db, u("riley")).map((p) => p.id)).not.toContain(id);
    expect(myLearningPaths(db, u("riley")).map((p) => p.id)).toContain(id);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(startedLearningPaths(db, u("riley")).map((p) => p.id)).not.toContain(id);
  });
});

describe("the next topic after finishing one", () => {
  const topics = ["legislative-framework", "noticing-a-change", "our-mission-and-model"];
  // A learner with no paths or progress from the demo data.
  beforeEach(() => {
    for (const t of ["learning_path_assignments", "lesson_completions", "lesson_progress"]) db.prepare(`DELETE FROM ${t} WHERE user_id = 'ash'`).run();
  });

  it("goes on to the next unfinished topic in the learner's path, then back to one they skipped", () => {
    const id = createLearningPath(db, u("jordan"), { name: "Next topic", lessons: topics }, now).id;
    assignLearningPath(db, u("jordan"), id, ["ash"], null, now);
    expect(nextTopicAfter(db, u("ash"), topics[0])).toEqual({ href: `/learning/${topics[1]}`, title: expect.any(String) });
    // Skipping one already done.
    recordLessonCompletion(db, u("ash"), { slug: topics[1], version: "1.0" }, now);
    expect(nextTopicAfter(db, u("ash"), topics[0])?.href).toBe(`/learning/${topics[2]}`);
    // From the last topic, back to the first one they haven't done.
    expect(nextTopicAfter(db, u("ash"), topics[2])?.href).toBe(`/learning/${topics[0]}`);
    // Nothing left once the rest are done.
    recordLessonCompletion(db, u("ash"), { slug: topics[0], version: "1.0" }, now);
    expect(nextTopicAfter(db, u("ash"), topics[2])).toBeNull();
  });

  it("is null for a topic that isn't in any of their paths", () => {
    expect(nextTopicAfter(db, u("ash"), "legislative-framework")).toBeNull();
  });
});
