import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/content/lessons";
import { assessmentOrder, assessmentRecord, assessmentScore, attemptQuestions, clearForRetake, recordAttempt, shuffled } from "./assessment";

/* Assessment mode: marked all at once, shuffled per attempt, every attempt recorded. */

const qs: QuizQuestion[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i + 1}`,
  prompt: `Question ${i + 1}`,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ],
  correct: "b",
  feedback: { correct: "Yes.", incorrect: "Not quite." },
}));
const answer = (right: number) => Object.fromEntries(qs.map((q, i) => [`exam.${q.id}`, i < right ? "b" : "a"]));

describe("assessment mode", () => {
  it("shuffles the same way for the same seed, and differently for another", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(shuffled(items, "x")).toEqual(shuffled(items, "x"));
    expect(shuffled(items, "x")).not.toEqual(shuffled(items, "y"));
    expect([...shuffled(items, "x")].sort((a, b) => a - b)).toEqual(items);
    const order = assessmentOrder(qs, "seed");
    expect(order.map((q) => q.id).sort()).toEqual(qs.map((q) => q.id));
    expect(order.every((q) => q.options.length === 3)).toBe(true);
  });

  it("marks against the pass mark", () => {
    expect(assessmentScore("exam", qs, answer(4), 80)).toEqual({ right: 4, total: 5, percent: 80, passed: true });
    expect(assessmentScore("exam", qs, answer(3), 80)).toMatchObject({ percent: 60, passed: false });
  });

  it("keeps the first score, the latest score, attempts and when they passed", () => {
    let a = recordAttempt("exam", qs, answer(3), 80, "2026-10-30T01:00:00Z");
    expect(assessmentRecord("exam", a)).toEqual({ attempts: 1, firstScore: 60, latestScore: 60, passedAt: null });
    // A retake clears the answers but keeps the record.
    a = clearForRetake("exam", qs, a);
    expect(a["exam.q1"]).toBeUndefined();
    a = recordAttempt("exam", qs, { ...a, ...answer(5) }, 80, "2026-10-30T02:00:00Z");
    expect(assessmentRecord("exam", a)).toEqual({ attempts: 2, firstScore: 60, latestScore: 100, passedAt: "2026-10-30T02:00:00Z" });
    // A later attempt doesn't move the pass date.
    a = recordAttempt("exam", qs, a, 80, "2026-10-31T00:00:00Z");
    expect(assessmentRecord("exam", a)?.passedAt).toBe("2026-10-30T02:00:00Z");
    expect(assessmentRecord("exam", {})).toBeNull();
  });
});

describe("an assessment drawing from a question pool", () => {
  const pool: QuizQuestion[] = Array.from({ length: 50 }, (_, i) => ({
    id: `p${i + 1}`,
    prompt: `Question ${i + 1}`,
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    correct: "a",
    feedback: { correct: "", incorrect: "" },
  }));
  const card = { id: "exam", questions: pool, assessment: { passMark: 80, draw: 25 } };

  it("asks 25 different questions, the same ones whenever that attempt is shown", () => {
    const first = attemptQuestions(card, "2026-11-04T00:00:00Z", {}, false);
    expect(first).toHaveLength(25);
    expect(new Set(first.map((q) => q.id)).size).toBe(25);
    expect(attemptQuestions(card, "2026-11-04T00:00:00Z", {}, false).map((q) => q.id)).toEqual(first.map((q) => q.id));
    expect(assessmentOrder(pool, "x", 0)).toHaveLength(50);
  });

  it("marks only the questions asked, and draws a fresh set for a retake", () => {
    const at = "2026-11-04T00:00:00Z";
    const asked = attemptQuestions(card, at, {}, false);
    let a: Record<string, string | number | string[]> = Object.fromEntries(asked.map((q) => [`exam.${q.id}`, "a"]));
    expect(assessmentScore("exam", asked, a, 80)).toMatchObject({ right: 25, total: 25, percent: 100 });
    a = recordAttempt("exam", asked, a, 80, at);
    // Straight after submitting, it's still the attempt just marked.
    expect(attemptQuestions(card, at, a, true).map((q) => q.id)).toEqual(asked.map((q) => q.id));
    const retake = attemptQuestions(card, at, clearForRetake("exam", pool, a), false).map((q) => q.id);
    expect(retake).toHaveLength(25);
    expect(retake).not.toEqual(asked.map((q) => q.id));
  });
});
