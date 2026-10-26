import { describe, expect, it } from "vitest";
import { dayOfWeek, localParts, projectSchedule, releaseAfter, reminderAt, validateSchedule, zonedToUtc, type ScheduleConfig } from "./schedule";

const brisbane: ScheduleConfig = {
  mode: "scheduled",
  unit: "calendar",
  deliveryDays: "weekdays",
  sendTime: "09:30",
  window: { start: "09:00", end: "17:00" },
  timezone: "Australia/Brisbane",
};

const local = (d: Date, tz = brisbane.timezone) => {
  const p = localParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
};
const weekday = (d: Date, tz = brisbane.timezone) => {
  const p = localParts(d, tz);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek(p)];
};

// Friday 23 October 2026, 3:15 pm in Brisbane.
const fridayAnchor = zonedToUtc({ y: 2026, m: 10, d: 23 }, "15:15", "Australia/Brisbane");

describe("weekend handling (acceptance 3)", () => {
  it("a 2 calendar day wait from a Friday releases on Monday at the send time", () => {
    const r = releaseAfter(fridayAnchor, 2, brisbane);
    expect(weekday(r.at)).toBe("Mon");
    expect(local(r.at)).toBe("2026-10-26 09:30");
    expect(r.notes[0]).toMatch(/weekdays only/);
  });

  it("a 2 weekday wait from a Friday releases on Tuesday", () => {
    const r = releaseAfter(fridayAnchor, 2, { ...brisbane, unit: "weekdays" });
    expect(weekday(r.at)).toBe("Tue");
    expect(local(r.at)).toBe("2026-10-27 09:30");
  });

  it("every-day delivery keeps a weekend date", () => {
    const r = releaseAfter(fridayAnchor, 2, { ...brisbane, deliveryDays: "every" });
    expect(local(r.at)).toBe("2026-10-25 09:30");
  });
});

describe("the four step reinforcement preset", () => {
  it("chains gaps from each effective release in scheduled mode", () => {
    const steps = projectSchedule({ cfg: brisbane, anchor: fridayAnchor, anchorLabel: "the base lesson was completed", gaps: [2, 5, 7, 16] });
    expect(steps.map((s) => local(s.at!))).toEqual([
      "2026-10-26 09:30", // Sun 25 → Mon 26
      "2026-11-02 09:30", // Mon 26 + 5 = Sat 31 → Mon 2
      "2026-11-09 09:30",
      "2026-11-25 09:30",
    ]);
    expect(steps.every((s) => s.status === "planned")).toBe(true);
  });
});

describe("delivery modes (acceptance 4 and 5)", () => {
  const anchor = zonedToUtc({ y: 2026, m: 10, d: 20 }, "11:00", "Australia/Brisbane"); // Tue

  it("scheduled: an unfinished first activity does not move the next release", () => {
    const without = projectSchedule({ cfg: brisbane, anchor, anchorLabel: "x", gaps: [2, 5] });
    const withLate = projectSchedule({
      cfg: brisbane,
      anchor,
      anchorLabel: "x",
      gaps: [2, 5],
      completions: [zonedToUtc({ y: 2026, m: 10, d: 30 }, "10:00", "Australia/Brisbane")],
    });
    expect(withLate[1].at).toEqual(without[1].at);
  });

  it("after completion: an unopened first activity leaves the next one waiting", () => {
    const steps = projectSchedule({ cfg: { ...brisbane, mode: "after_completion" }, anchor, anchorLabel: "x", gaps: [2, 5] });
    expect(steps[0].status).toBe("planned");
    expect(steps[1]).toMatchObject({ status: "waiting", at: null, explanation: "Waiting for the previous activity" });
  });

  it("after completion: a late completion starts the next gap from the actual completion", () => {
    const late = zonedToUtc({ y: 2026, m: 11, d: 3 }, "16:40", "Australia/Brisbane"); // Tue
    const steps = projectSchedule({ cfg: { ...brisbane, mode: "after_completion" }, anchor, anchorLabel: "x", gaps: [2, 5], completions: [late] });
    expect(local(steps[1].at!)).toBe("2026-11-09 09:30"); // Tue 3 + 5 = Sun 8 → Mon 9
  });

  it("after completion preview labels later dates as estimates", () => {
    const steps = projectSchedule({ cfg: { ...brisbane, mode: "after_completion" }, anchor, anchorLabel: "x", gaps: [2, 5, 7], estimate: true });
    expect(steps.map((s) => s.status)).toEqual(["planned", "estimated", "estimated"]);
  });
});

describe("timezones and daylight saving (acceptance 9)", () => {
  const sydney: ScheduleConfig = { ...brisbane, timezone: "Australia/Sydney", deliveryDays: "every" };

  it("keeps 9:30 am local in Sydney across the October daylight saving change", () => {
    const anchor = zonedToUtc({ y: 2026, m: 10, d: 2 }, "12:00", "Australia/Sydney"); // AEST, UTC+10
    const r = releaseAfter(anchor, 3, sydney); // Mon 5 Oct, AEDT, UTC+11
    expect(local(r.at, "Australia/Sydney")).toBe("2026-10-05 09:30");
    expect(r.at.toISOString()).toBe("2026-10-04T22:30:00.000Z");
    const before = releaseAfter(zonedToUtc({ y: 2026, m: 9, d: 28 }, "12:00", "Australia/Sydney"), 1, sydney);
    expect(before.at.toISOString()).toBe("2026-09-28T23:30:00.000Z");
  });

  it("calendar days are local dates, not 24 hour blocks", () => {
    // 23:50 Saturday 3 Oct; one calendar day is Sunday 4 Oct even though that day is 23 hours long.
    const lateNight = zonedToUtc({ y: 2026, m: 10, d: 3 }, "23:50", "Australia/Sydney");
    expect(local(releaseAfter(lateNight, 1, sydney).at, "Australia/Sydney")).toBe("2026-10-04 09:30");
  });

  it("Brisbane has no daylight saving, so the same rule gives a different UTC time", () => {
    const anchor = zonedToUtc({ y: 2026, m: 10, d: 2 }, "12:00", "Australia/Brisbane");
    expect(releaseAfter(anchor, 3, { ...brisbane, deliveryDays: "every" }).at.toISOString()).toBe("2026-10-04T23:30:00.000Z");
  });
});

describe("zero gaps and windows", () => {
  it("releases immediately inside the window", () => {
    const inWindow = zonedToUtc({ y: 2026, m: 10, d: 21 }, "11:00", "Australia/Brisbane");
    expect(releaseAfter(inWindow, 0, brisbane).at).toEqual(inWindow);
  });
  it("waits for the next permitted window outside it", () => {
    const friEvening = zonedToUtc({ y: 2026, m: 10, d: 23 }, "18:00", "Australia/Brisbane");
    expect(local(releaseAfter(friEvening, 0, brisbane).at)).toBe("2026-10-26 09:00");
  });
});

describe("reminders and validation", () => {
  it("reminds two weekdays after release", () => {
    const release = zonedToUtc({ y: 2026, m: 10, d: 23 }, "09:30", "Australia/Brisbane"); // Fri
    expect(local(reminderAt(release, brisbane))).toBe("2026-10-27 09:30"); // Tue
  });
  it("rejects a send time outside the window and bad gaps", () => {
    expect(validateSchedule({ ...brisbane, sendTime: "08:00" }, [2])).toContain("The send time must fall inside the delivery window");
    expect(validateSchedule(brisbane, [2, -1])).toContain("Each wait must be a whole number from 0 to 365");
    expect(validateSchedule(brisbane, [2, 5, 7, 16])).toEqual([]);
  });
});
