import type { QuizQuestion } from "@/content/lessons";

/*
  Assessment mode for quiz cards, for compliance training: the whole quiz is marked at once against a
  pass mark, with no feedback until it's submitted. Questions and options come in an order that's
  shuffled for each attempt, and every attempt's score is kept with the learner's answers so reports
  can show their first score, latest score, attempts and when they passed.
*/

export type Assessment = {
  passMark: number;
  /** Ask this many questions, drawn afresh from the card's pool for each attempt; all of them when unset. */
  draw?: number;
};

type Answers = Record<string, string | number | string[]>;

/** Where each part of an assessment lives in the learner's saved answers. */
export const assessmentKeys = (cardId: string) => ({
  attempt: `attempts:${cardId}`,
  first: `firstScore:${cardId}`,
  latest: `score:${cardId}`,
  passed: `passedAt:${cardId}`,
});

/** A small, fast seeded random generator (mulberry32), so a shuffle can be repeated exactly. */
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same items in an order fixed by the seed: the same seed always gives the same order. */
export function shuffled<T>(items: T[], seed: string): T[] {
  const rand = seeded(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** This attempt's questions, and each question's options, in order: a fresh draw of `draw` from the pool when set. */
export function assessmentOrder(questions: QuizQuestion[], seed: string, draw?: number): QuizQuestion[] {
  const order = shuffled(questions, `${seed}:q`);
  return (draw && draw > 0 && draw < order.length ? order.slice(0, draw) : order).map((q) => ({ ...q, options: shuffled(q.options, `${seed}:${q.id}`) }));
}

/**
  What fixes an attempt's order (and draw): when the topic was started, and which attempt this is.
  Once an attempt is submitted (`checked`), the count has moved on, so step back to the one just marked.
*/
export const attemptSeed = (startedAt: string, cardId: string, answers: Answers, checked: boolean) =>
  `${startedAt}:${Number(answers[assessmentKeys(cardId).attempt] ?? 0) - (checked ? 1 : 0)}`;

/** The questions asked in this attempt of a quiz card: an assessment's shuffled draw, or every question otherwise. */
export function attemptQuestions(
  card: { id: string; questions: QuizQuestion[]; assessment?: Assessment },
  startedAt: string,
  answers: Answers,
  checked: boolean,
) {
  return card.assessment ? assessmentOrder(card.questions, attemptSeed(startedAt, card.id, answers, checked), card.assessment.draw) : card.questions;
}

/** This attempt's number (1 for the first), from the learner's saved answers. */
export const attemptNumber = (cardId: string, answers: Answers) => Number(answers[assessmentKeys(cardId).attempt] ?? 0) + 1;

/** The marks for the answers given now. */
export function assessmentScore(cardId: string, questions: QuizQuestion[], answers: Answers, passMark: number) {
  const right = questions.filter((q) => answers[`${cardId}.${q.id}`] === q.correct).length;
  const total = questions.length;
  const percent = total ? Math.round((100 * right) / total) : 0;
  return { right, total, percent, passed: percent >= passMark };
}

/**
  Records a submitted attempt: its score, the first score if this is the first attempt, the number of
  attempts, and when they first passed. Returns the updated answers.
*/
export function recordAttempt(cardId: string, questions: QuizQuestion[], answers: Answers, passMark: number, at: string): Answers {
  const k = assessmentKeys(cardId);
  const score = assessmentScore(cardId, questions, answers, passMark);
  const next: Answers = { ...answers, [k.attempt]: attemptNumber(cardId, answers), [k.latest]: score.percent };
  if (next[k.first] === undefined) next[k.first] = score.percent;
  if (score.passed && next[k.passed] === undefined) next[k.passed] = at;
  return next;
}

/** Clears this attempt's answers for a retake, keeping the record of attempts and scores. */
export function clearForRetake(cardId: string, questions: QuizQuestion[], answers: Answers): Answers {
  const next = { ...answers };
  for (const q of questions) delete next[`${cardId}.${q.id}`];
  return next;
}

/** A learner's assessment record, for reports. Null if they haven't submitted it. */
export function assessmentRecord(cardId: string, answers: Record<string, unknown> | undefined) {
  if (!answers) return null;
  const k = assessmentKeys(cardId);
  const attempts = Number(answers[k.attempt] ?? 0);
  if (!attempts) return null;
  return {
    attempts,
    firstScore: Number(answers[k.first] ?? 0),
    latestScore: Number(answers[k.latest] ?? 0),
    passedAt: typeof answers[k.passed] === "string" ? (answers[k.passed] as string) : null,
  };
}

/**
  The results worth keeping with a completion, from a learner's answers: first-try quiz and scenario
  results, and assessment scores. Kept so a later attempt (starting again, or a refresh) can't erase
  what they demonstrated when they finished.
*/
export function completionEvidence(answers: unknown) {
  const out: Record<string, number | string> = {};
  if (!answers || typeof answers !== "object") return out;
  for (const [k, v] of Object.entries(answers as Record<string, unknown>).slice(0, 500)) {
    if (!/^(first|attempts|firstScore|score|passedAt):[\w.-]{1,120}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v.length <= 40) out[k] = v;
  }
  return out;
}
