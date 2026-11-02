/*
  Challenge scoring, kept apart from the database so the rules are easy to read and test.
  There's no penalty for a wrong answer: the cost is the points you miss.
*/

export type Points = {
  /** Each decision right first time. */
  decision: number;
  /** Each quiz question right first time. */
  question: number;
  /** Finishing the mission. */
  complete: number;
  /** Finishing it on the day it opened. */
  onTheDay: number;
  /** Every decision and question right first time. */
  perfect: number;
};

export const DEFAULT_POINTS: Points = { decision: 100, question: 50, complete: 100, onTheDay: 50, perfect: 100 };

export const POINT_LABELS: Record<keyof Points, string> = {
  decision: "Decision right first time",
  question: "Quiz question right first time",
  complete: "Mission completed",
  onTheDay: "Completed on the day it opened",
  perfect: "Perfect mission bonus",
};

export type MissionInput = {
  decisions: { right: number; asked: number };
  questions: { right: number; asked: number };
  completed: boolean;
  onTheDay: boolean;
};

export function missionScore(p: Points, m: MissionInput) {
  const asked = m.decisions.asked + m.questions.asked;
  const perfect = m.completed && asked > 0 && m.decisions.right + m.questions.right === asked;
  const parts = {
    decisions: m.decisions.right * p.decision,
    questions: m.questions.right * p.question,
    complete: m.completed ? p.complete : 0,
    onTheDay: m.completed && m.onTheDay ? p.onTheDay : 0,
    perfect: perfect ? p.perfect : 0,
  };
  const possible = m.decisions.asked * p.decision + m.questions.asked * p.question + p.complete + p.onTheDay + (asked ? p.perfect : 0);
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0), possible, perfect, onTheDay: m.completed && m.onTheDay };
}

type DayResult = { completedAt: string | null; onTheDay: boolean; perfect: boolean };

/**
  The current run of missions finished on the day they opened, counting back from the latest open
  day. Today's mission doesn't break the streak until today is over, so it's skipped if not done yet.
*/
export function streakOf(days: DayResult[], _total: number, openDays: number) {
  let n = 0;
  for (let i = openDays - 1; i >= 0; i--) {
    if (days[i].onTheDay) n++;
    else if (i === openDays - 1 && !days[i].completedAt) continue;
    else break;
  }
  return n;
}

export type Achievement = { id: string; label: string; description: string; earned: boolean };

export function achievementsFor(days: DayResult[], total: number): Achievement[] {
  let run = 0;
  let best = 0;
  for (const d of days) {
    run = d.onTheDay ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return [
    { id: "first-steps", label: "First Steps", description: "Finish day 1", earned: Boolean(days[0]?.completedAt) },
    { id: "on-a-roll", label: "On a Roll", description: "Three missions in a row, each on the day it opened", earned: best >= Math.min(3, total) && total > 0 },
    {
      id: "sharp",
      label: "Sharp Judgement",
      description: "Get every decision and question right first time in a mission",
      earned: days.some((d) => d.perfect),
    },
    {
      id: "full-streak",
      label: "Full Streak",
      description: "Finish every mission on the day it opened",
      earned: total > 0 && days.length === total && days.every((d) => d.onTheDay),
    },
    { id: "finale", label: "Grand Finale", description: "Finish the final mission", earned: Boolean(days[total - 1]?.completedAt) },
  ];
}

/** Standard competition ranking: equal scores share a place (1, 1, 3). */
export function rankBy<T>(items: T[], score: (t: T) => number) {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  return sorted.map((item) => ({ item, rank: sorted.findIndex((x) => score(x) === score(item)) + 1 }));
}

/** How someone appears on a leaderboard: first name and last initial. */
export function displayName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

/** Team colours, for swatches and bars. */
export const TEAM_SWATCH: Record<string, string> = { teal: "#2b9c96", navy: "#2d4875", warm: "#e2725b", gold: "#e7b23c", sky: "#6fb4dc" };
