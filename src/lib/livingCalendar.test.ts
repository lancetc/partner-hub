import { describe, expect, it } from "vitest";
import { cleanRoutine, monthGrid, routineDates, routineWhen, shiftMonth, spreadSchedule } from "./livingCalendar";

/* Routines and their days, the month grid, and the serendipity spreader's own rules. */

const r = (o: Record<string, unknown>) => cleanRoutine({ title: "x", start: "2026-10-01", source: "Bible", ...o });

describe("routines", () => {
  it("fall on the right days, and skip their exceptions and pauses", () => {
    expect(routineDates(r({ freq: "weekly", weekdays: [6] }), "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
    expect(routineDates(r({ freq: "fortnightly", weekdays: [3], start: "2026-11-05" }), "2026-11-01", "2026-11-30")).toEqual(["2026-11-05", "2026-11-19"]);
    expect(routineDates(r({ freq: "monthly", weekdays: [4], nth: 2 }), "2026-11-01", "2026-12-31")).toEqual(["2026-11-13", "2026-12-11"]);
    expect(routineDates(r({ freq: "monthly", weekdays: [4], nth: -1 }), "2026-11-01", "2026-11-30")).toEqual(["2026-11-27"]);
    expect(routineDates(r({ freq: "annual", month: 1, day: 14 }), "2026-11-01", "2027-02-01")).toEqual(["2027-01-14"]);
    const paused = r({ freq: "weekly", weekdays: [6], skips: ["2026-11-08"], pauses: [{ from: "2026-11-14", to: "2026-11-23", reason: "Away" }] });
    expect(routineDates(paused, "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-29"]);
    expect(routineDates(r({ freq: "weekly", weekdays: [6], end: "2026-11-10" }), "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-08"]);
  });

  it("say when they happen in plain words", () => {
    expect(routineWhen(r({ freq: "weekly", weekdays: [6], time: "12:00" }))).toBe("Every Sunday at 12 pm");
    expect(routineWhen(r({ freq: "fortnightly", weekdays: [3], time: "09:30" }))).toBe("Every second Thursday at 9:30 am");
    expect(routineWhen(r({ freq: "monthly", weekdays: [4], nth: 2 }))).toBe("The second Friday of each month");
  });
});

describe("the month grid", () => {
  it("runs Monday to Sunday around the month, and steps across years", () => {
    const g = monthGrid("2026-11");
    expect(g.days[0]).toBe("2026-10-26");
    expect(g.days.at(-1)).toBe("2026-12-06");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("spreading a schedule", () => {
  it("never crowds a day past the maximum, and is the same for the same seed", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ memberId: `m${i % 4}`, category: "everyday" }));
    const opts = { from: "2026-12-01", days: 14, seed: "s", variety: { maxPerDay: 2, quietDays: 20, consecutive: false } };
    const a = spreadSchedule(items, opts);
    expect(a).toEqual(spreadSchedule(items, opts));
    const perDay = new Map<string, number>();
    for (const p of a.placed) perDay.set(p.date, (perDay.get(p.date) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    expect(a.placed.length + a.dropped).toBe(20);
  });
});
