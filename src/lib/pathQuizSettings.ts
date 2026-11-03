/*
  A learning path's upfront quiz: people who think they already know the content can test out.
  Pass it and every topic in the path counts as complete. Shared by the server and the path editor.
*/

export type PathQuizSettings = {
  /** How many questions to ask; null for one from each topic. */
  questions: number | null;
  /** The percentage needed to pass. */
  passMark: number;
  /** How many tries each person gets. */
  attempts: number;
};

export const QUIZ_DEFAULTS: PathQuizSettings = { questions: null, passMark: 80, attempts: 1 };

/** The stored settings, or null when the path has no quiz (or the value is damaged). */
export function parseQuizSettings(raw: string | null | undefined): PathQuizSettings | null {
  if (!raw) return null;
  try {
    return cleanQuizSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Settings from the editor, kept within sensible limits; null turns the quiz off. */
export function cleanQuizSettings(v: unknown): PathQuizSettings | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const whole = (x: unknown, lo: number, hi: number, fallback: number) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  return {
    questions: o.questions === null || o.questions === undefined || o.questions === "" ? null : whole(o.questions, 5, 200, 20),
    passMark: whole(o.passMark, 50, 100, QUIZ_DEFAULTS.passMark),
    attempts: whole(o.attempts, 1, 5, QUIZ_DEFAULTS.attempts),
  };
}

/** Roughly how long the quiz takes: about 20 seconds a question. */
export const quizMinutes = (questions: number) => Math.max(1, Math.round((questions * 20) / 60));

/** "1 minute", "13 minutes". */
export const minutesLabel = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;
