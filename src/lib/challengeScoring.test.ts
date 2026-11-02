import { describe, expect, it } from "vitest";
import { DEFAULT_POINTS, achievementsFor, displayName, missionScore, rankBy, streakOf } from "./challengeScoring";

/* The challenge scoring rules on their own. */

const day = (onTheDay: boolean, completed = onTheDay, perfect = false) => ({ completedAt: completed ? "2026-11-02T00:00:00Z" : null, onTheDay, perfect });

describe("challenge scoring", () => {
  it("adds up a mission, and only counts on-the-day and perfect bonuses for a completed mission", () => {
    const all = missionScore(DEFAULT_POINTS, { decisions: { right: 2, asked: 2 }, questions: { right: 1, asked: 1 }, completed: true, onTheDay: true });
    expect(all).toMatchObject({ total: 200 + 50 + 100 + 50 + 100, possible: 500, perfect: true });
    const unfinished = missionScore(DEFAULT_POINTS, { decisions: { right: 2, asked: 2 }, questions: { right: 1, asked: 1 }, completed: false, onTheDay: true });
    expect(unfinished).toMatchObject({ total: 250, perfect: false, onTheDay: false });
  });

  it("counts the current streak, without breaking it for today's unfinished mission", () => {
    expect(streakOf([day(true), day(true), day(false, false)], 5, 3)).toBe(2);
    expect(streakOf([day(true), day(false, true), day(true)], 5, 3)).toBe(1);
    expect(streakOf([day(true), day(false, false), day(false, false)], 5, 3)).toBe(0);
  });

  it("awards achievements", () => {
    const earned = (days: ReturnType<typeof day>[]) =>
      achievementsFor(days, 5)
        .filter((a) => a.earned)
        .map((a) => a.id);
    expect(earned([day(true)])).toEqual(["first-steps"]);
    expect(earned([day(true), day(true), day(true, true, true)])).toEqual(["first-steps", "on-a-roll", "sharp"]);
    expect(earned([day(true), day(true), day(true), day(true), day(true)])).toEqual(["first-steps", "on-a-roll", "full-streak", "finale"]);
  });

  it("ranks equal scores equally, and shows first name and initial", () => {
    expect(rankBy([{ p: 10 }, { p: 30 }, { p: 30 }], (x) => x.p).map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(displayName("Jordan Lee")).toBe("Jordan L.");
    expect(displayName("Cher")).toBe("Cher");
  });
});
