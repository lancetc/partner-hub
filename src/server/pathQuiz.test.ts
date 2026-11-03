import { beforeEach, describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { assignLearningPath, certificateFor, createLearningPath, learnerPath, updateLearningPath } from "./learningPaths";
import { clearQuizAttempts, drawQuestions, quizOffer, quizResults, startQuiz, submitQuiz } from "./pathQuiz";

/* The upfront quiz on a learning path: test out of it, and every topic counts as complete. */

let db: Db;
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-03T04:00:00Z");
// Topics with a quick check, for a small path of two chapters.
const withQuiz = lessons.filter((l) => l.track !== "reinforcement" && Object.values(l.nodes).some((c) => c.type === "quiz")).slice(0, 4);
const questionsIn = (slug: string) =>
  Object.values(lessons.find((l) => l.slug === slug)!.nodes).flatMap((c) => (c.type === "quiz" ? c.questions.map((q) => ({ card: c.id, q })) : []));
let pathId: string;

/** Answers every question in an attempt: right, or wrong for the first `wrong` of them. */
function answer(started: ReturnType<typeof startQuiz>, wrong = 0) {
  return Object.fromEntries(
    started.questions.map((q, i) => {
      const [slug, card, id] = q.key.split("|");
      const correct = questionsIn(slug).find((x) => x.card === card && x.q.id === id)!.q.correct;
      return [q.key, i < wrong ? q.options.find((o) => o.id !== correct)!.id : correct];
    }),
  );
}

beforeEach(() => {
  db = openDb(":memory:");
  const slugs = withQuiz.map((l) => l.slug);
  pathId = createLearningPath(
    db,
    u("jordan"),
    {
      name: "Quiz path",
      lessons: [],
      chapters: [
        { title: "One", lessons: slugs.slice(0, 2) },
        { title: "Two", lessons: slugs.slice(2) },
      ],
      quiz: { questions: null, passMark: 75, attempts: 2 },
    },
    now,
  ).id;
  assignLearningPath(db, u("jordan"), pathId, ["sam"], null, now);
});

describe("upfront path quiz", () => {
  it("needs four topics with quick checks to test with", () => {
    expect(withQuiz).toHaveLength(4);
  });

  it("asks one question from each topic by default, in path order, without the answers", () => {
    const offer = quizOffer(db, u("sam"), pathId)!;
    expect(offer).toMatchObject({ questions: 4, passMark: 75, attempts: 2, left: 2, available: true, passed: false });
    const s = startQuiz(db, u("sam"), pathId, now);
    expect(s.questions.map((q) => q.key.split("|")[0])).toEqual(withQuiz.map((l) => l.slug));
    expect(JSON.stringify(s.questions)).not.toContain("correct");
    // Leaving part way and coming back picks up the same questions.
    expect(startQuiz(db, u("sam"), pathId, now).questions).toEqual(s.questions);
  });

  it("spreads a short quiz across chapters", () => {
    const picked = drawQuestions(db, pathId, 2);
    const chapterOf = (slug: string) => (withQuiz.findIndex((l) => l.slug === slug) < 2 ? 1 : 2);
    expect(new Set(picked.map((q) => chapterOf(q.slug)))).toEqual(new Set([1, 2]));
  });

  it("completes every topic in the path on a pass, marked as by quiz, and earns the certificate", () => {
    const s = startQuiz(db, u("sam"), pathId, now);
    const r = submitQuiz(db, u("sam"), pathId, s.attempt, answer(s, 1), now);
    expect(r).toMatchObject({ score: 3, total: 4, percent: 75, passed: true });
    expect(r.focus.map((f) => f.slug)).toEqual([withQuiz[0].slug]);
    const p = learnerPath(db, u("sam"), pathId);
    expect(p.done).toBe(true);
    expect(certificateFor(db, u("sam"), pathId)).not.toBeNull();
    const via = db.prepare("SELECT DISTINCT via FROM lesson_completions WHERE user_id = 'sam'").all() as { via: string }[];
    expect(via).toEqual([{ via: `path-quiz:${pathId}` }]);
    expect(quizOffer(db, u("sam"), pathId)).toMatchObject({ passed: true, available: false });
    expect(() => startQuiz(db, u("sam"), pathId, now)).toThrow(/already passed/);
  });

  it("leaves the path as it was on a fail, with the topics to focus on, until the tries run out", () => {
    const s = startQuiz(db, u("sam"), pathId, now);
    expect(() => submitQuiz(db, u("sam"), pathId, s.attempt, {}, now)).toThrow(/Answer every question/);
    const r = submitQuiz(db, u("sam"), pathId, s.attempt, answer(s, 2), now);
    expect(r).toMatchObject({ score: 2, passed: false, left: 1 });
    expect(r.focus).toHaveLength(2);
    expect(learnerPath(db, u("sam"), pathId).completed).toBe(0);
    // Sending the same answers again doesn't count as another try.
    expect(submitQuiz(db, u("sam"), pathId, s.attempt, answer(s), now)).toMatchObject({ passed: false, left: 1 });

    const again = startQuiz(db, u("sam"), pathId, now);
    expect(again.attempt).not.toBe(s.attempt);
    submitQuiz(db, u("sam"), pathId, again.attempt, answer(again, 4), now);
    expect(quizOffer(db, u("sam"), pathId)).toMatchObject({ left: 0, available: false });
    expect(() => startQuiz(db, u("sam"), pathId, now)).toThrow(/used your tries/);
    expect(quizResults(db, pathId).get("sam")).toMatchObject({ tries: 2, passed: false, best: { score: 2 } });

    // An administrator can give them another go; the old attempts stay on record.
    expect(() => clearQuizAttempts(db, u("sam"), pathId, "sam", now)).toThrow();
    expect(clearQuizAttempts(db, u("jordan"), pathId, "sam", now)).toEqual({ cleared: 2 });
    expect(quizOffer(db, u("sam"), pathId)).toMatchObject({ left: 2, available: true, latest: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM path_quiz_attempts").get()).toEqual({ n: 2 });
  });

  it("isn't offered once the quiz is turned off", () => {
    updateLearningPath(db, u("jordan"), pathId, { name: "Quiz path", lessons: withQuiz.map((l) => l.slug), quiz: null }, now);
    expect(quizOffer(db, u("sam"), pathId)).toBeNull();
    expect(() => startQuiz(db, u("sam"), pathId, now)).toThrow(/doesn’t have a quiz/);
  });
});
