import { beforeEach, describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { expiryFor } from "@/lib/complianceRegister";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { recordLessonCompletion } from "./learning";
import { assignLearningPath, createLearningPath, learnerPath } from "./learningPaths";
import { startQuiz, submitQuiz } from "./pathQuiz";
import {
  addToRegister,
  decideTestOut,
  listRegister,
  myRequiredTraining,
  queueComplianceReminders,
  refreshDue,
  registerCsv,
  registerTopic,
  remindersStillDue,
  saveRegisterEntry,
} from "./complianceRegister";
import { dispatch } from "./worker";

/* The compliance register: who is trained in each mandatory topic, what they showed, and when it runs out. */

let db: Db;
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-04T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86400000);
// Topics for partners like Sam, with a quick check, so a path quiz can be built from them.
const topics = lessons.filter((l) => (l.track === "core" || l.track === "partner") && Object.values(l.nodes).some((c) => c.type === "quiz")).slice(0, 2);
const [a, b] = topics;
const row = (slug: string, user: string, at = now) => registerTopic(db, u("jordan"), slug, at).people.find((p) => p.userId === user)!;
const settings = (slug: string) => registerTopic(db, u("jordan"), slug, now).settings;

beforeEach(() => {
  db = openDb(":memory:");
  addToRegister(db, u("jordan"), a.slug, now);
});

describe("compliance register", () => {
  it("needs two partner topics with quick checks to test with", () => {
    expect(topics).toHaveLength(2);
  });

  it("puts a topic on with the usual rules and the assessment methods its cards use", () => {
    const s = settings(a.slug);
    expect(s).toMatchObject({ classification: "mandatory", recurrenceMonths: 12, testOut: "approval", owner: "Compliance team", evidence: "assessment" });
    expect(s.assessment).toContain("quiz");
    expect(() => addToRegister(db, u("jordan"), a.slug, now)).toThrow(/already/);
    expect(() => addToRegister(db, u("sam"), b.slug, now)).toThrow();
    expect(listRegister(db, u("jordan"), now).topics.map((t) => t.slug)).toEqual([a.slug]);
  });

  it("shows when someone is trained, and when that becomes due and then expires", () => {
    saveRegisterEntry(db, u("jordan"), a.slug, { ...settings(a.slug), evidence: "completion" }, now);
    expect(row(a.slug, "sam").status).toBe("not_trained");
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, now);
    const r = row(a.slug, "sam");
    expect(r).toMatchObject({ status: "current", expiresAt: "2027-11-04", completedAt: now.toISOString() });
    expect(r.demonstrated).toContain("Worked through the topic");
    expect(row(a.slug, "sam", later(340)).status).toBe("due_soon");
    expect(row(a.slug, "sam", later(365)).status).toBe("expired");
    // Once only: it never runs out.
    saveRegisterEntry(db, u("jordan"), a.slug, { ...settings(a.slug), recurrenceMonths: 0 }, now);
    expect(row(a.slug, "sam", later(2000))).toMatchObject({ status: "current", expiresAt: null });
  });

  it("asks for the evidence the register requires", () => {
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, now);
    // No quiz answers saved, so no assessment record.
    expect(row(a.slug, "sam")).toMatchObject({ status: "evidence", missing: ["an assessment record"] });
    saveRegisterEntry(db, u("jordan"), a.slug, { ...settings(a.slug), evidence: "signoff" }, now);
    expect(row(a.slug, "sam").missing).toEqual(["a manager sign-off"]);
    expect(() => saveRegisterEntry(db, u("jordan"), a.slug, { ...settings(a.slug), owner: " " }, now)).toThrow(/owns the competency/);
  });

  it("holds an upfront quiz pass for approval, then counts it once the owner approves", () => {
    const pathId = createLearningPath(
      db,
      u("jordan"),
      { name: "Register path", lessons: [a.slug, b.slug], quiz: { questions: null, passMark: 50, attempts: 1 } },
      now,
    ).id;
    assignLearningPath(db, u("jordan"), pathId, ["sam"], null, now);
    const s = startQuiz(db, u("sam"), pathId, now);
    const answers = Object.fromEntries(
      s.questions.map((q) => {
        const [slug, card, id] = q.key.split("|");
        const node = lessons.find((l) => l.slug === slug)!.nodes[card];
        return [q.key, node.type === "quiz" ? node.questions.find((x) => x.id === id)!.correct : ""];
      }),
    );
    const r = submitQuiz(db, u("sam"), pathId, s.attempt, answers, now);
    expect(r.passed).toBe(true);
    expect(r.held.approval.map((t) => t.slug)).toEqual([a.slug]);
    // The other topic is complete; the register topic waits.
    expect(learnerPath(db, u("sam"), pathId)).toMatchObject({ completed: 1, done: false });
    expect(row(a.slug, "sam").status).toBe("approval");
    const [pending] = listRegister(db, u("jordan"), now).approvals;
    expect(pending).toMatchObject({ userId: "sam", slug: a.slug, score: 2, total: 2 });

    expect(() => decideTestOut(db, u("sam"), pending.id, true, "", now)).toThrow();
    decideTestOut(db, u("jordan"), pending.id, true, "Strong result.", later(1));
    expect(listRegister(db, u("jordan"), now).approvals).toEqual([]);
    expect(learnerPath(db, u("sam"), pathId).done).toBe(true);
    const after = row(a.slug, "sam", later(1));
    expect(after.status).toBe("current");
    expect(after.completedAt).toBe(now.toISOString());
    expect(after.demonstrated[0]).toMatch(/^Tested out: 2\/2 \(100%\) on the “Register path” upfront quiz, approved by Jordan Lee/);
    expect(() => decideTestOut(db, u("jordan"), pending.id, false, "", now)).toThrow(/already approved/);
  });

  it("doesn't let a quiz pass complete a topic that has to be worked through", () => {
    saveRegisterEntry(db, u("jordan"), a.slug, { ...settings(a.slug), testOut: "not_allowed" }, now);
    const pathId = createLearningPath(
      db,
      u("jordan"),
      { name: "Strict path", lessons: [a.slug, b.slug], quiz: { questions: null, passMark: 0, attempts: 1 } },
      now,
    ).id;
    const s = startQuiz(db, u("sam"), pathId, now);
    const r = submitQuiz(db, u("sam"), pathId, s.attempt, Object.fromEntries(s.questions.map((q) => [q.key, q.options[0].id])), now);
    expect(r.held.notAllowed.map((t) => t.slug)).toEqual([a.slug]);
    expect(row(a.slug, "sam").status).toBe("not_trained");
    expect(listRegister(db, u("jordan"), now).approvals).toEqual([]);
  });

  it("exports the register for audits", () => {
    const csv = registerCsv(db, u("jordan"), now);
    expect(csv.split("\r\n")[0]).toContain('"What they demonstrated"');
    expect(csv).toContain(`"${a.title}"`);
  });

  it("reminds people once when training is due soon and again when it expires, and stops once they refresh", async () => {
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, now);
    const outbox = () =>
      db.prepare("SELECT user_id, kind, subject, body, status FROM outbox WHERE kind = 'compliance_reminder' ORDER BY id").all() as {
        user_id: string;
        subject: string;
        body: string;
        status: string;
      }[];
    expect(queueComplianceReminders(db, later(300), "https://hub.test")).toBe(0);
    // 30 days before it runs out: one "due soon" email, then nothing more for that stage.
    expect(queueComplianceReminders(db, later(340), "https://hub.test")).toBe(1);
    expect(queueComplianceReminders(db, later(341), "https://hub.test")).toBe(0);
    expect(outbox()[0]).toMatchObject({ user_id: "sam", subject: `Your ${a.title} training is due soon`, status: "queued" });
    expect(outbox()[0].body).toContain(`https://hub.test/topics/${a.slug}`);
    expect(queueComplianceReminders(db, later(365), "https://hub.test")).toBe(1);
    expect(outbox()[1].subject).toBe(`Your ${a.title} training has expired`);

    // The learner sees it, and can refresh it.
    expect(myRequiredTraining(db, u("sam"), later(365))[0]).toMatchObject({ slug: a.slug, status: "expired", expiresAt: "2027-11-04" });
    expect(refreshDue(db, u("sam"), a.slug, later(365))).toMatchObject({ status: "expired" });
    const quiz = Object.values(a.nodes).find((c) => c.type === "quiz")!;
    const results = Object.fromEntries((quiz.type === "quiz" ? quiz.questions : []).map((q) => [`first:${quiz.id}.${q.id}`, 1]));
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, later(366), results);
    expect(refreshDue(db, u("sam"), a.slug, later(366))).toBeNull();
    expect(row(a.slug, "sam", later(366))).toMatchObject({ expiresAt: "2028-11-05" });
    // A reminder still waiting to go is dropped once they've refreshed.
    expect(remindersStillDue(db, "sam", [{ slug: a.slug, title: a.title, stage: "expired", expiresAt: "2027-11-04" }], later(366))).toEqual([]);
    const sentTo: string[] = [];
    await dispatch(db, later(366), {
      email: {
        channel: "email" as const,
        name: "test",
        configured: true,
        send: async (m) => (sentTo.push(m.to.email), { status: "accepted" as const, providerRef: "x" }),
      },
    });
    expect(sentTo).toEqual([]);
    expect(outbox().map((o) => o.status)).toEqual(["cancelled", "cancelled"]);
  });

  it("only lets people refresh early once training is due, so an extra review doesn't reset the date", () => {
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, now);
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, later(100));
    expect(row(a.slug, "sam", later(100)).completedAt).toBe(now.toISOString());
  });

  it("keeps what someone demonstrated with their completion, so starting the topic again can't erase it", () => {
    const quiz = Object.values(a.nodes).find((c) => c.type === "quiz")!;
    const qs = quiz.type === "quiz" ? quiz.questions : [];
    const evidence = Object.fromEntries(qs.map((q, i) => [`first:${quiz.id}.${q.id}`, i === 0 ? 0 : 1]));
    recordLessonCompletion(db, u("sam"), { slug: a.slug, version: a.version }, now, evidence);
    // Their saved progress is now a fresh attempt with no answers.
    db.prepare("INSERT OR REPLACE INTO lesson_progress (user_id, slug, attempt, saved_at) VALUES ('sam', ?, ?, ?)").run(
      a.slug,
      JSON.stringify({ version: a.version, status: "in_progress", nodeId: a.start, route: [a.start], answers: {} }),
      now.toISOString(),
    );
    const r = row(a.slug, "sam");
    expect(r.status).toBe("current");
    expect(r.demonstrated).toContain(`Quick check: ${qs.length - 1} of ${qs.length} right first time`);
  });

  it("works out expiry dates at month ends", () => {
    expect(expiryFor("2026-01-31T10:00:00Z", 1)).toBe("2026-02-28");
    expect(expiryFor("2026-11-04T00:00:00Z", 12)).toBe("2027-11-04");
    expect(expiryFor("2026-11-04T00:00:00Z", null)).toBeNull();
  });
});
