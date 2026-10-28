import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { followUpAct, followUpView, learnerFollowUps, recordLessonCompletion } from "./learning";
import { pathReport, outboxFor } from "./reports";
import { pausePath, publish, saveDraft, newDraft } from "./paths";
import { runWorker } from "./worker";
import { zonedToUtc } from "@/lib/schedule";

/* Acceptance 12: identifiers from another organisation never resolve. */

const lesson = { slug: "a-little-extra-time", version: "1.0-demo" };
const t = (d: number, time = "09:30") => zonedToUtc({ y: 2026, m: 10, d }, time, "Australia/Brisbane");
const quiet = { email: { channel: "email" as const, name: "null", configured: true, send: async () => ({ status: "accepted" as const, providerRef: "x" }) } };

let db: Db;
beforeEach(async () => {
  db = openDb(":memory:");
  recordLessonCompletion(db, userById(db, "sam")!, lesson, t(22, "14:00"));
  recordLessonCompletion(db, userById(db, "ash")!, lesson, t(22, "14:00"));
  await runWorker(db, t(26), quiet);
});

const u = (id: string) => userById(db, id)!;

describe("learner isolation", () => {
  it("a learner cannot read or act on another learner's follow up", () => {
    const ashItem = learnerFollowUps(db, u("ash"))[0].id;
    expect(() => followUpView(db, u("sam"), ashItem)).toThrow("Follow up not found.");
    expect(() => followUpAct(db, u("sam"), ashItem, { action: "answer", optionId: "b", phase: "initial" }, t(26, "11:00"))).toThrow("Follow up not found.");
    expect(learnerFollowUps(db, u("sam")).every((i) => i.pathName)).toBe(true);
    expect(learnerFollowUps(db, u("sam")).map((i) => i.id)).not.toContain(ashItem);
  });

  it("a learner cannot see reports or outbox", () => {
    expect(() => pathReport(db, u("sam"), "path-extra-time")).toThrow(/access to reports/);
    expect(() => outboxFor(db, u("sam"))).toThrow(/access to reports/);
  });

  it("a learner cannot manage paths", () => {
    expect(() => pausePath(db, u("sam"), "path-extra-time", t(26))).toThrow(/learning authors/);
    expect(() => newDraft(db, u("casey"), "path-extra-time", t(26))).toThrow(/learning authors/);
  });
});

describe("report scope", () => {
  it("an organisation administrator sees only their organisation", () => {
    const report = pathReport(db, u("casey"), "path-extra-time");
    expect(report.timelines.map((x) => x.learner)).toEqual(["Sam Taylor"]);
    expect(outboxFor(db, u("casey")).every((r) => (r as { learner: string }).learner === "Sam Taylor")).toBe(true);
  });

  it("a Trilogy author sees every organisation", () => {
    expect(
      pathReport(db, u("jordan"), "path-extra-time")
        .timelines.map((x) => x.learner)
        .sort(),
    ).toEqual(["Ash Nguyen", "Sam Taylor"]);
  });
});

describe("versioning", () => {
  it("publishing a new version leaves existing enrolments on their version", () => {
    const draft = newDraft(db, u("jordan"), "path-extra-time", t(26));
    saveDraft(db, u("jordan"), "path-extra-time", { config: { ...draft.config, name: "Renamed" }, steps: draft.steps }, t(26));
    db.prepare("UPDATE path_versions SET status = 'in_review' WHERE version = 2").run();
    publish(db, u("jordan"), "path-extra-time", t(26));
    const versions = db.prepare("SELECT DISTINCT path_version AS v FROM enrolments").all() as { v: number }[];
    expect(versions).toEqual([{ v: 1 }]);
    expect((db.prepare("SELECT status FROM path_versions WHERE version = 1").get() as { status: string }).status).toBe("superseded");
  });
});
