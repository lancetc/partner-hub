import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { enrolment, myTopicEnrolments } from "./enrolments";
import {
  assignLearningPath,
  browseLearningPaths,
  canSkipHolds,
  createLearningPath,
  learnerPath,
  learningPathDetail,
  myLearningPaths,
} from "./learningPaths";
import { lessonReport, pathReport, personReport } from "./completionReports";

/* Self-enrolment: learners add paths and topics to their own Learning page; administrators see who did. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-12T00:00:00Z");
const path = (id: string, action: "enrol" | "leave", who = "sam") => enrolment(db, u(who), { kind: "path", id, action }, now);
const topic = (id: string, action: "enrol" | "leave", who = "sam") => enrolment(db, u(who), { kind: "topic", id, action }, now);

describe("enrolling in a learning path", () => {
  it("puts the path on the learner's list, marked as self-enrolled for administrators", () => {
    expect(myLearningPaths(db, u("sam")).map((p) => p.id)).not.toContain("lp-care-coordination");
    expect(path("lp-care-coordination", "enrol")).toEqual({ enrolled: true, selfEnrolled: true });

    const mine = myLearningPaths(db, u("sam")).find((p) => p.id === "lp-care-coordination")!;
    expect(mine).toMatchObject({ assigned: false, selfEnrolled: true, dueDate: null });
    expect(learnerPath(db, u("sam"), "lp-care-coordination")).toMatchObject({ assigned: false, selfEnrolled: true });
    expect(browseLearningPaths(db, u("sam")).find((p) => p.id === "lp-care-coordination")).toMatchObject({ assigned: false, selfEnrolled: true });

    const row = learningPathDetail(db, u("jordan"), "lp-care-coordination").assignments.find((a) => a.userId === "sam")!;
    expect(row.selfEnrolled).toBe(true);
    expect(pathReport(db, u("jordan"), "lp-care-coordination", now).people.find((r) => r.person.id === "sam")!.selfEnrolled).toBe(true);
    expect(personReport(db, u("jordan"), "sam").paths.find((p) => p.id === "lp-care-coordination")!.selfEnrolled).toBe(true);
  });

  it("is harmless to repeat, and leaves an assigned path as an assignment", () => {
    path("lp-care-coordination", "enrol");
    expect(path("lp-care-coordination", "enrol")).toEqual({ enrolled: true, selfEnrolled: true });
    // Sam is already assigned Partner Onboarding.
    expect(path("lp-partner-onboarding", "enrol")).toEqual({ enrolled: true, selfEnrolled: false });
    expect(myLearningPaths(db, u("sam")).find((p) => p.id === "lp-partner-onboarding")!.assigned).toBe(true);
  });

  it("lets the learner leave a path they enrolled in, but not one they were assigned", () => {
    path("lp-care-coordination", "enrol");
    expect(path("lp-care-coordination", "leave")).toEqual({ enrolled: false, selfEnrolled: false });
    expect(myLearningPaths(db, u("sam")).map((p) => p.id)).not.toContain("lp-care-coordination");
    expect(() => path("lp-partner-onboarding", "leave")).toThrow(/assigned to you/);
    expect(myLearningPaths(db, u("sam")).map((p) => p.id)).toContain("lp-partner-onboarding");
  });

  it("becomes an assignment when an administrator assigns the person, with their due date", () => {
    path("lp-care-coordination", "enrol");
    assignLearningPath(db, u("jordan"), "lp-care-coordination", ["sam"], "2026-12-01", now);
    expect(myLearningPaths(db, u("sam")).find((p) => p.id === "lp-care-coordination")).toMatchObject({
      assigned: true,
      selfEnrolled: false,
      dueDate: "2026-12-01",
    });
    expect(() => path("lp-care-coordination", "leave")).toThrow(/assigned to you/);
  });

  it("doesn't let a self-enrolled learner skip holds on a testers' path", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Testers", allowSkip: true, lessons: ["a-little-extra-time"] }, now);
    path(id, "enrol", "ash");
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(false);
    assignLearningPath(db, u("jordan"), id, ["ash"], null, now);
    expect(canSkipHolds(db, "ash", "a-little-extra-time")).toBe(true);
  });

  it("refuses paths with nothing published yet, and unknown paths", () => {
    const { id } = createLearningPath(db, u("jordan"), { name: "Planned", lessons: [] }, now);
    expect(() => path(id, "enrol")).toThrow(/not found/);
    expect(() => path("lp-nope", "enrol")).toThrow(/not found/);
  });
});

describe("enrolling in a topic", () => {
  it("lists the topic as the learner's and shows them on its report, even outside their audience", () => {
    // Noticing a change is a coordinator topic; Sam is a partner.
    expect(lessonReport(db, u("jordan"), "noticing-a-change").people.some((r) => r.person.id === "sam")).toBe(false);
    expect(topic("noticing-a-change", "enrol")).toEqual({ enrolled: true });
    expect(myTopicEnrolments(db, u("sam")).map((t) => t.slug)).toEqual(["noticing-a-change"]);
    const row = lessonReport(db, u("jordan"), "noticing-a-change").people.find((r) => r.person.id === "sam")!;
    expect(row).toMatchObject({ enrolled: true, expected: false, state: "not_started" });
    expect(personReport(db, u("jordan"), "sam").lessons.find((l) => l.slug === "noticing-a-change")!.enrolled).toBe(true);
  });

  it("can be repeated and left", () => {
    topic("noticing-a-change", "enrol");
    topic("noticing-a-change", "enrol");
    expect(myTopicEnrolments(db, u("sam"))).toHaveLength(1);
    expect(topic("noticing-a-change", "leave")).toEqual({ enrolled: false });
    expect(myTopicEnrolments(db, u("sam"))).toEqual([]);
  });

  it("refuses follow ups and unknown topics", () => {
    expect(() => topic("lf-recall", "enrol")).toThrow(/not found/);
    expect(() => topic("no-such-topic", "enrol")).toThrow(/not found/);
    expect(() => enrolment(db, u("sam"), { kind: "topic", id: "noticing-a-change", action: "join" as "enrol" }, now)).toThrow(/Unknown action/);
  });
});
