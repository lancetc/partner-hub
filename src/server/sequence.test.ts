import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { followUpAct, learnerFollowUps, recordLessonCompletion } from "./learning";
import { runWorker } from "./worker";
import { useClassicExtraTime } from "./testFixtures";
import { localParts, zonedToUtc } from "@/lib/schedule";

/* Legislative Framework as one topic, four experiences: Learn → Recall → Apply → Refresh. */

const lesson = { slug: "legislative-framework", version: "1.0" };
const bne = (y: number, m: number, d: number, t: string) => zonedToUtc({ y, m, d }, t, "Australia/Brisbane");
const local = (iso: string) => {
  const p = localParts(new Date(iso), "Australia/Brisbane");
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
};
const quiet = { email: { channel: "email" as const, name: "null", configured: true, send: async () => ({ status: "accepted" as const, providerRef: "x" }) } };

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const sam = () => userById(db, "sam")!;
const sequence = () => learnerFollowUps(db, sam()).filter((i) => i.pathId === "path-legislative-framework");

describe("learning sequence", () => {
  it("schedules Recall at week 2, Apply at month 2 and Refresh at week 14", () => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00")); // Thu
    const steps = sequence();
    expect(steps.map((s) => s.stage)).toEqual(["Recall", "Apply", "Refresh"]);
    expect(steps.map((s) => local(s.plannedRelease!))).toEqual(["2026-11-05 09:30", "2026-12-21 09:30", "2027-01-28 09:30"]);
    expect(steps[0].href).toBe(`/learning/s/lf-recall?instance=${steps[0].id}`);
    expect(steps[0].base).toEqual({ slug: "legislative-framework", title: "Legislative Framework" });
  });

  it("records a lesson step's completion and first-attempt result", async () => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    await runWorker(db, bne(2026, 11, 5, "09:30"), quiet);
    const recall = sequence()[0];
    expect(recall.status).toBe("available");
    followUpAct(
      db,
      sam(),
      recall.id,
      {
        action: "complete_lesson",
        results: [
          { id: "q1.q", correct: true },
          { id: "q2.q", correct: true },
        ],
      },
      bne(2026, 11, 5, "10:00"),
    );
    expect(sequence()[0].status).toBe("completed");
    const attempt = db.prepare("SELECT initial_correct, initial_response FROM attempts").get() as { initial_correct: number; initial_response: string };
    expect(attempt.initial_correct).toBe(1);
    expect(JSON.parse(attempt.initial_response)).toHaveLength(2);
  });

  const runTo = async (results: { recall: boolean; apply: boolean }) => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    await runWorker(db, bne(2026, 11, 5, "09:30"), quiet);
    followUpAct(db, sam(), sequence()[0].id, { action: "complete_lesson", results: [{ id: "q1.q", correct: results.recall }] }, bne(2026, 11, 5, "10:00"));
    await runWorker(db, bne(2026, 12, 21, "09:30"), quiet);
    followUpAct(db, sam(), sequence()[1].id, { action: "complete_lesson", results: [{ id: "choice", correct: results.apply }] }, bne(2026, 12, 21, "10:00"));
    await runWorker(db, bne(2027, 1, 28, "09:30"), quiet);
    return sequence()[2];
  };

  it("gives a confident learner the short refresher", async () => {
    const refresh = await runTo({ recall: true, apply: true });
    expect(refresh.status).toBe("available");
    expect(refresh.title).toBe("Legislative Framework: refresher");
  });

  it("gives a learner who missed a first attempt the support refresher, on the same date", async () => {
    const refresh = await runTo({ recall: true, apply: false });
    expect(refresh.title).toBe("Legislative Framework: refresher with practice");
    expect(refresh.href).toContain("/learning/s/lf-refresh-support?instance=");
    expect(local(refresh.plannedRelease!)).toBe("2027-01-28 09:30");
  });

  it("rejects lesson completion on a short follow up step", async () => {
    useClassicExtraTime(db);
    recordLessonCompletion(db, sam(), { slug: "a-little-extra-time", version: "1.0-demo" }, bne(2026, 10, 22, "14:00"));
    await runWorker(db, bne(2026, 10, 26, "09:30"), quiet);
    const fu = learnerFollowUps(db, sam()).find((i) => i.pathId === "path-extra-time")!;
    expect(() => followUpAct(db, sam(), fu.id, { action: "complete_lesson", results: [] }, bne(2026, 10, 26, "10:00"))).toThrow(/isn’t a lesson/);
  });

  it("runs A little extra time as Recall, Apply and Refresh, with a gardening Apply", () => {
    recordLessonCompletion(db, sam(), { slug: "a-little-extra-time", version: "1.0-demo" }, bne(2026, 10, 22, "14:00"));
    recordLessonCompletion(db, userById(db, "ash")!, { slug: "a-little-extra-time", version: "1.0-demo" }, bne(2026, 10, 22, "14:00"));
    const steps = (u: string) => learnerFollowUps(db, userById(db, u)!).filter((i) => i.pathId === "path-extra-time");
    expect(steps("sam").map((s) => s.stage)).toEqual(["Recall", "Apply", "Refresh"]);
    expect(steps("sam").map((s) => s.title)).toEqual([
      "A little extra time: quick recall",
      "A little extra time: a different request",
      "A little extra time: refresher",
    ]);
    expect(steps("ash")[1].title).toBe("A little extra time: a different job");
  });
});
