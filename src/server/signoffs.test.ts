import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { followUpAct, learnerFollowUps, recordLessonCompletion } from "./learning";
import { runWorker } from "./worker";
import { decideSignoff, mySignoffs, signoffQueue } from "./signoffs";
import { spacedAction } from "./spaced";
import { zonedToUtc } from "@/lib/schedule";

/* Manager sign-off after the last spaced follow up of Legislative Framework. */

const bne = (y: number, m: number, d: number, t: string) => zonedToUtc({ y, m, d }, t, "Australia/Brisbane");
const quiet = { email: { channel: "email" as const, name: "null", configured: true, send: async () => ({ status: "accepted" as const, providerRef: "x" }) } };
let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const steps = () => learnerFollowUps(db, u("sam")).filter((i) => i.pathId === "path-legislative-framework");
const now = bne(2027, 2, 1, "10:00");

/** Sam works through Recall, Apply and Refresh. */
async function finishSequence(recallCorrect = true) {
  recordLessonCompletion(db, u("sam"), { slug: "legislative-framework", version: "1.0" }, bne(2026, 10, 22, "14:00"));
  const at = [bne(2026, 11, 5, "09:30"), bne(2026, 12, 21, "09:30"), bne(2027, 1, 28, "09:30")];
  for (let i = 0; i < 3; i++) {
    await runWorker(db, at[i], quiet);
    followUpAct(
      db,
      u("sam"),
      steps()[i].id,
      { action: "complete_lesson", results: [{ id: "q", correct: i === 0 ? recallCorrect : true }] },
      new Date(at[i].getTime() + 3600000),
    );
  }
  return (db.prepare("SELECT id FROM enrolments WHERE user_id = 'sam' AND path_id = 'path-legislative-framework'").get() as { id: number }).id;
}

describe("manager sign-off", () => {
  it("waits until every follow up is done, then appears in the manager's queue", async () => {
    recordLessonCompletion(db, u("sam"), { slug: "legislative-framework", version: "1.0" }, bne(2026, 10, 22, "14:00"));
    expect(signoffQueue(db, u("casey")).waiting).toEqual([]);
    expect(mySignoffs(db, u("sam"))["legislative-framework"].status).toBe("after_follow_ups");
  });

  it("shows the manager each follow up's first-try result and the extra practice", async () => {
    await finishSequence(false);
    const [item] = signoffQueue(db, u("casey")).waiting;
    expect(item.learner.name).toBe("Sam Taylor");
    expect(item.manager).toBe("Casey Taylor");
    expect(item.results.map((r) => [r.stage, r.firstTry, r.extraPractice])).toEqual([
      ["Recall", false, false],
      ["Apply", true, false],
      ["Refresh", true, true],
    ]);
    expect(item.lesson.action).toMatch(/^In your next service conversation/);
    expect(mySignoffs(db, u("sam"))["legislative-framework"].status).toBe("waiting");
  });

  it("records the manager's confirmation, once, and shows it to the learner", async () => {
    const id = await finishSequence();
    decideSignoff(db, u("casey"), id, "confirmed", "Saw Sam check the procedure.", now);
    expect(signoffQueue(db, u("casey"))).toMatchObject({ waiting: [], history: [{ outcome: "confirmed", decidedBy: "Casey Taylor" }] });
    expect(mySignoffs(db, u("sam"))["legislative-framework"]).toMatchObject({ status: "confirmed", by: "Casey Taylor", note: "Saw Sam check the procedure." });
    expect(() => decideSignoff(db, u("jordan"), id, "support", "x", now)).toThrow(/already been signed off/);
  });

  it("needs a note when asking for support", async () => {
    const id = await finishSequence();
    expect(() => decideSignoff(db, u("casey"), id, "support", " ", now)).toThrow(/what support/);
    decideSignoff(db, u("casey"), id, "support", "Go through it together next visit.", now);
    expect(mySignoffs(db, u("sam"))["legislative-framework"].status).toBe("support");
  });

  it("only lets the learner's manager, their organisation admin or a Trilogy author sign off", async () => {
    const id = await finishSequence();
    expect(() => decideSignoff(db, u("sam"), id, "confirmed", "", now)).toThrow(/access/);
    db.prepare("UPDATE users SET role = 'org_admin' WHERE id = 'riley'").run();
    expect(() => decideSignoff(db, u("riley"), id, "confirmed", "", now)).toThrow(/people you manage/);
    expect(signoffQueue(db, u("jordan")).waiting).toHaveLength(1);
  });

  it("leaves the queue empty when sign-off is switched off for the lesson", async () => {
    await spacedAction(db, u("jordan"), "legislative-framework", "signoff_off", now);
    await finishSequence();
    expect(signoffQueue(db, u("casey")).waiting).toEqual([]);
    expect(mySignoffs(db, u("sam"))["legislative-framework"]).toBeUndefined();
  });
});
