import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate, openDb, type Db } from "./db";
import { userById } from "./auth";
import { followUpAct, learnerFollowUps, recordLessonCompletion } from "./learning";
import { pausePath, resumePath, resumePreview, withdraw } from "./paths";
import { useClassicExtraTime } from "./testFixtures";
import { runWorker } from "./worker";
import type { NotificationAdapter, OutboundMessage, SendResult } from "./notify";
import { zonedToUtc } from "@/lib/schedule";

/** Records messages instead of sending them; outcome is configurable per test. */
class FakeEmail implements NotificationAdapter {
  channel = "email" as const;
  name = "fake";
  configured = true;
  sent: OutboundMessage[] = [];
  /** Content-review reminders to authors, kept apart from learners' messages (tested in contentReview.test.ts). */
  reminders: OutboundMessage[] = [];
  constructor(private result: SendResult = { status: "accepted", providerRef: "fake-1" }) {}
  async send(msg: OutboundMessage) {
    if (msg.idempotencyKey.startsWith("content-reminder:")) this.reminders.push(msg);
    else this.sent.push(msg);
    return this.result;
  }
}

const lesson = { slug: "a-little-extra-time", version: "1.0-demo" };
const bne = (y: number, m: number, d: number, t: string) => zonedToUtc({ y, m, d }, t, "Australia/Brisbane");

let dir: string;
let db: Db;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-test-"));
  db = openDb(path.join(dir, "hub.sqlite"));
  useClassicExtraTime(db);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sam = () => userById(db, "sam")!;
const jordan = () => userById(db, "jordan")!;
const count = (sql: string, ...args: (string | number)[]) => (db.prepare(sql).get(...args) as { n: number }).n;

describe("enrolment from lesson completion (acceptance 1 and 2)", () => {
  it("creates exactly one enrolment with four follow ups at the configured gaps", () => {
    const thu = bne(2026, 10, 22, "14:00");
    const first = recordLessonCompletion(db, sam(), lesson, thu);
    const replay = recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:05"));
    expect(count("SELECT COUNT(*) AS n FROM enrolments")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM step_instances")).toBe(4);
    expect(replay.completedAt).toBe(first.completedAt); // the original server-confirmed time is kept
    const planned = (db.prepare("SELECT planned_release FROM step_instances ORDER BY step_index").all() as { planned_release: string }[]).map(
      (r) => r.planned_release,
    );
    expect(planned).toEqual([
      bne(2026, 10, 26, "09:30").toISOString(), // Sat 24 → Mon 26
      bne(2026, 11, 2, "09:30").toISOString(), // Sat 31 → Mon 2
      bne(2026, 11, 9, "09:30").toISOString(),
      bne(2026, 11, 25, "09:30").toISOString(),
    ]);
  });

  it("does not enrol staff or audiences outside the path", () => {
    recordLessonCompletion(db, userById(db, "riley")!, lesson, bne(2026, 10, 22, "14:00"));
    recordLessonCompletion(db, jordan(), lesson, bne(2026, 10, 22, "14:00"));
    expect(count("SELECT COUNT(*) AS n FROM enrolments")).toBe(0);
  });

  it("uses the approved role variant for a gardening partner", () => {
    recordLessonCompletion(db, userById(db, "ash")!, lesson, bne(2026, 10, 22, "14:00"));
    const row = db.prepare("SELECT follow_up_id FROM step_instances WHERE step_index = 1").get() as { follow_up_id: string };
    expect(row.follow_up_id).toBe("fu-extra-time-scenario-gardening");
  });
});

describe("worker", () => {
  beforeEach(() => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
  });

  it("releases on time and sends one digest; a second run does nothing new", async () => {
    const email = new FakeEmail();
    expect((await runWorker(db, bne(2026, 10, 26, "09:15"), { email })).released).toBe(0);
    const r1 = await runWorker(db, bne(2026, 10, 26, "09:30"), { email });
    expect(r1).toMatchObject({ released: 1, digests: 1, dispatched: 1 });
    const r2 = await runWorker(db, bne(2026, 10, 26, "09:45"), { email });
    expect(r2).toMatchObject({ released: 0, digests: 0, dispatched: 0 });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].idempotencyKey).toBe("digest:sam:email:2026-10-26");
    expect((db.prepare("SELECT status FROM outbox").get() as { status: string }).status).toBe("accepted");
  });

  it("two workers on separate connections do not duplicate releases or messages", async () => {
    const other = new DatabaseSync(path.join(dir, "hub.sqlite"));
    migrate(other);
    const a = new FakeEmail();
    const b = new FakeEmail();
    const at = bne(2026, 10, 26, "09:30");
    const [ra, rb] = await Promise.all([runWorker(db, at, { email: a }), runWorker(other, at, { email: b })]);
    other.close();
    expect(ra.released + rb.released).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM outbox")).toBe(1);
    expect(a.sent.length + b.sent.length).toBe(1);
  });

  it("without a configured provider keeps the message as a preview and never marks it delivered", async () => {
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email: new FakeEmail({ status: "not_configured", error: "not set" }) });
    expect((db.prepare("SELECT status FROM outbox").get() as { status: string }).status).toBe("not_configured");
    expect(learnerFollowUps(db, sam())[0].status).toBe("available"); // availability does not depend on delivery
  });

  it("an ambiguous timeout is left unknown, not resent blindly", async () => {
    const email = new FakeEmail({ status: "unknown", error: "timeout" });
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email });
    await runWorker(db, bne(2026, 10, 26, "10:00"), { email });
    expect(email.sent).toHaveLength(1);
    expect((db.prepare("SELECT status FROM outbox").get() as { status: string }).status).toBe("unknown");
  });

  it("reminds once, two weekdays after release, and completion stops reminders (acceptance 6)", async () => {
    const email = new FakeEmail();
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email }); // Mon release + digest
    const id = learnerFollowUps(db, sam())[0].id;
    followUpAct(db, sam(), id, { action: "start" }, bne(2026, 10, 26, "12:00")); // opened, left unfinished
    await runWorker(db, bne(2026, 10, 27, "09:30"), { email }); // Tue: too early
    expect(email.sent).toHaveLength(1);
    await runWorker(db, bne(2026, 10, 28, "09:30"), { email }); // Wed: reminder
    expect(email.sent).toHaveLength(2);
    expect(email.sent[1].body).toMatch(/Continue A quick recall/);
    await runWorker(db, bne(2026, 10, 29, "09:30"), { email });
    expect(email.sent).toHaveLength(2); // at most one reminder
  });

  it("two paths releasing on the same day produce one digest (acceptance 7)", async () => {
    // Publish a copy of the path to simulate a second path with the same trigger.
    const pv = db.prepare("SELECT * FROM path_versions").get() as Record<string, string>;
    db.prepare("INSERT INTO paths VALUES ('path-two', ?, 'test')").run(pv.created_at);
    db.prepare(
      "INSERT INTO path_versions (path_id, version, status, config, steps, created_at, updated_at) VALUES ('path-two', 1, 'published', ?, ?, ?, ?)",
    ).run(pv.config, pv.steps, pv.created_at, pv.created_at);
    db.prepare("DELETE FROM lesson_completions").run();
    db.prepare("DELETE FROM step_instances").run();
    db.prepare("DELETE FROM enrolments").run();
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    const email = new FakeEmail();
    const r = await runWorker(db, bne(2026, 10, 26, "09:30"), { email });
    expect(r.released).toBe(2);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toMatch(/2 short follow ups/);
    expect(learnerFollowUps(db, sam()).filter((f) => f.status === "available")).toHaveLength(2);
  });

  it("a backlog after an outage becomes one digest", async () => {
    const email = new FakeEmail();
    await runWorker(db, bne(2026, 11, 4, "10:00"), { email }); // first run in over a week
    expect(count("SELECT COUNT(*) AS n FROM step_instances WHERE released_at IS NOT NULL")).toBe(2);
    expect(email.sent).toHaveLength(1);
  });
});

describe("attempts (acceptance 8)", () => {
  it("keeps the wrong first answer after a correct retry", async () => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email: new FakeEmail() });
    const id = learnerFollowUps(db, sam())[0].id;
    const t = bne(2026, 10, 26, "11:00");
    followUpAct(db, sam(), id, { action: "answer", optionId: "a", phase: "initial" }, t);
    followUpAct(db, sam(), id, { action: "answer", optionId: "b", phase: "initial" }, t); // ignored: initial is fixed
    followUpAct(db, sam(), id, { action: "answer", optionId: "b", phase: "corrected" }, t);
    followUpAct(db, sam(), id, { action: "feedback_viewed" }, t);
    const view = followUpAct(db, sam(), id, { action: "complete" }, t);
    expect(view.attempt).toMatchObject({ initial: "a", initialCorrect: false, corrected: "b", correctedCorrect: true });
    expect(view.completedAt).toBeTruthy();
  });

  it("cannot finish without answering and viewing feedback", async () => {
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email: new FakeEmail() });
    const id = learnerFollowUps(db, sam())[0].id;
    expect(() => followUpAct(db, sam(), id, { action: "complete" }, bne(2026, 10, 26, "11:00"))).toThrow(/view the feedback/);
  });
});

describe("after completion mode (acceptance 4)", () => {
  it("waits for the previous activity, then starts the gap from the actual completion", async () => {
    const pv = db.prepare("SELECT config FROM path_versions WHERE path_id = 'path-extra-time'").get() as { config: string };
    const config = JSON.parse(pv.config);
    config.schedule.mode = "after_completion";
    db.prepare("UPDATE path_versions SET config = ? WHERE path_id = 'path-extra-time'").run(JSON.stringify(config));
    recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00"));
    expect(learnerFollowUps(db, sam()).map((f) => f.status)).toEqual(["upcoming", "waiting", "waiting", "waiting"]);

    await runWorker(db, bne(2026, 10, 26, "09:30"), { email: new FakeEmail() });
    await runWorker(db, bne(2026, 11, 20, "09:30"), { email: new FakeEmail() }); // weeks later: still waiting
    expect(learnerFollowUps(db, sam())[1].status).toBe("waiting");

    const id = learnerFollowUps(db, sam())[0].id;
    const late = bne(2026, 11, 20, "15:00"); // Fri
    followUpAct(db, sam(), id, { action: "answer", optionId: "b", phase: "initial" }, late);
    followUpAct(db, sam(), id, { action: "feedback_viewed" }, late);
    followUpAct(db, sam(), id, { action: "complete" }, late);
    expect(learnerFollowUps(db, sam())[1].plannedRelease).toBe(bne(2026, 11, 25, "09:30").toISOString()); // Fri + 5 = Wed
  });
});

describe("pause, resume and withdrawal (acceptance 10 and 11)", () => {
  beforeEach(() => recordLessonCompletion(db, sam(), lesson, bne(2026, 10, 22, "14:00")));

  it("pause stops releases and messages; resume avoids a burst", async () => {
    pausePath(db, jordan(), "path-extra-time", bne(2026, 10, 23, "10:00"));
    const email = new FakeEmail();
    await runWorker(db, bne(2026, 11, 4, "10:00"), { email });
    expect(count("SELECT COUNT(*) AS n FROM step_instances WHERE released_at IS NOT NULL")).toBe(0);
    expect(email.sent).toHaveLength(0);
    const preview = resumePreview(db, "path-extra-time", bne(2026, 11, 4, "10:00"));
    expect(preview).toMatchObject({ enrolments: 1, overdue: 2, future: 2 });
    resumePath(db, jordan(), "path-extra-time", bne(2026, 11, 4, "10:00"));
    await runWorker(db, bne(2026, 11, 4, "10:15"), { email });
    expect(email.sent).toHaveLength(1); // one digest for both overdue items
    const planned = db.prepare("SELECT planned_release FROM step_instances WHERE step_index = 2").get() as { planned_release: string };
    expect(planned.planned_release).toBe(bne(2026, 11, 9, "09:30").toISOString()); // future release unchanged
  });

  it("withdrawal cancels unsent work and keeps completed evidence", async () => {
    await runWorker(db, bne(2026, 10, 26, "09:30"), { email: new FakeEmail() });
    const id = learnerFollowUps(db, sam())[0].id;
    const t = bne(2026, 10, 26, "11:00");
    followUpAct(db, sam(), id, { action: "answer", optionId: "b", phase: "initial" }, t);
    followUpAct(db, sam(), id, { action: "feedback_viewed" }, t);
    followUpAct(db, sam(), id, { action: "complete" }, t);
    withdraw(db, jordan(), "path-extra-time", 1, "The process changed (demo).", bne(2026, 10, 27, "10:00"));
    const email = new FakeEmail();
    await runWorker(db, bne(2026, 11, 2, "09:30"), { email });
    expect(email.sent).toHaveLength(0);
    const items = learnerFollowUps(db, sam());
    expect(items[0].status).toBe("completed");
    expect(items.slice(1).every((i) => i.status === "withdrawn" && i.withdrawnReason === "The process changed (demo).")).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM attempts")).toBe(1);
  });
});
