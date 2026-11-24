import { describe, expect, it } from "vitest";
import { blendedHours, forecast, hoursPerFte, planningWindow, rampFraction, type HiringOption } from "./hiringModel";
import { MAYA_GROWTH, MAYA_INPUTS, MAYA_OPTIONS, modelFixturesPass } from "./hiringRunway";

/* The shared Caseload-to-Margin model: the Maya fixture, ramps, receipts, zero and invalid capacity, and negative cash. */

const expected = MAYA_GROWTH.find((g) => g.id === "expected")!;
const option = (id: string, patch: Partial<HiringOption> = {}) => ({ ...MAYA_OPTIONS.find((o) => o.id === id)!, ...patch });

describe("the Maya fixture", () => {
  it("reproduces the reference prototype's expected case", () => {
    expect(modelFixturesPass()).toBe(true);
    const none = forecast(MAYA_INPUTS, option("current"), expected);
    const six = forecast(MAYA_INPUTS, option("add-06"), expected);
    const one = forecast(MAYA_INPUTS, option("add-10"), expected);
    expect(none.firstPressure).toBe(3);
    expect(six.monthsAbove).toBe(0);
    expect(Math.round(six.lowestCash)).toBe(18_160);
    expect(one.monthsAbove).toBe(0);
    expect(Math.round(one.lowestCash)).toBe(-1_670);
  });

  it("shows a profitable no-hire path that breaches the threshold, and a safe hire that breaches the reserve", () => {
    const none = forecast(MAYA_INPUTS, option("current"), expected);
    expect(none.operating12).toBeGreaterThan(0);
    expect(none.monthsAbove).toBeGreaterThan(0);
    expect(none.firstReserveBreach).toBeNull();
    const one = forecast(MAYA_INPUTS, option("add-10"), expected);
    expect(one.monthsAbove).toBe(0);
    expect(one.firstReserveBreach).not.toBeNull();
  });

  it("works from weighted hours, with onboarding in the month a participant starts", () => {
    expect(blendedHours(MAYA_INPUTS)).toBeCloseTo(75 / 35, 10);
    expect(hoursPerFte(MAYA_INPUTS)).toBeCloseTo(118.56, 10);
    const m1 = forecast(MAYA_INPUTS, option("current"), expected).months[0];
    expect(m1.clients).toBe(37);
    expect(m1.requiredHours).toBeCloseTo(37 * (75 / 35) + 3 * 3 + 6, 10);
  });
});

describe("hiring, ramps and timing", () => {
  it("pays a hire in full from the month they join while their capacity ramps", () => {
    const o = option("add-06");
    expect([1, 2, 3, 4, 5].map((m) => rampFraction(o, m))).toEqual([0, 0, 0.5, 1, 1]);
    const f = forecast(MAYA_INPUTS, o, expected);
    expect(f.joins).toBe(3);
    expect(f.months[1].staffCost).toBe(7_550);
    expect(f.months[2].staffCost).toBeCloseTo(7_550 * 1.6, 6);
    // The recruitment cost happens once, in the start month.
    expect(f.months.map((m) => m.oneOff)).toEqual([4_000, ...Array(11).fill(0)]);
  });

  it("handles early and late hires, and full-time versus part-time", () => {
    const late = forecast(MAYA_INPUTS, option("add-06", { startMonth: 4 }), expected);
    expect(late.joins).toBe(6);
    expect(late.monthsAbove).toBeGreaterThan(0);
    const full = forecast(MAYA_INPUTS, option("add-10", { rampMonths: 0 }), expected);
    expect(full.months[2].availableHours).toBeCloseTo(hoursPerFte(MAYA_INPUTS) * 2, 6);
  });

  it("gives a planning window that can fall before Month 1, meaning an interim plan is needed", () => {
    expect(planningWindow(3, 2, 2)).toBe(0);
    expect(planningWindow(8, 2, 2)).toBe(5);
    expect(planningWindow(null, 2, 2)).toBeNull();
  });
});

describe("earned income and cash received", () => {
  it("receives income after the lag, with opening receivables first", () => {
    const f = forecast(MAYA_INPUTS, option("current"), expected);
    expect(f.months[0].received).toBe(12_600);
    expect(f.months[1].received).toBe(f.months[0].earned);
    expect(f.months[0].earned).toBe(37 * 360);
  });

  it("moves later payments later, without losing them", () => {
    const base = forecast(MAYA_INPUTS, option("current"), expected);
    const delayed = forecast(MAYA_INPUTS, option("current"), expected, [{ kind: "paymentDelay", fromMonth: 4, extraMonths: 1 }]);
    expect(delayed.months[3].received).toBe(0);
    expect(delayed.months[4].received).toBe(base.months[3].received);
    expect(delayed.operating12).toBe(base.operating12);
    expect(delayed.lowestCash).toBeLessThan(base.lowestCash);
  });

  it("counts opening receivables once over a longer lag", () => {
    const f = forecast({ ...MAYA_INPUTS, paymentLagMonths: 2 }, option("current"), expected);
    expect(f.months[0].received).toBe(12_600);
    expect(f.months[1].received).toBe(12_600);
    expect(f.months[2].received).toBe(f.months[0].earned);
  });
});

describe("edges", () => {
  it("shows no available capacity, not a percentage, when nobody is working", () => {
    const f = forecast({ ...MAYA_INPUTS, currentFte: 0 }, option("current"), expected);
    expect(f.months[0]).toMatchObject({ noCapacity: true, utilisation: null, pressure: true });
  });

  it("handles no participants and no work", () => {
    const empty = {
      ...MAYA_INPUTS,
      bands: { standard: { count: 0, hours: 0 }, higher: { count: 0, hours: 0 }, intensive: { count: 0, hours: 0 } },
      newPerMonth: 0,
      reviewHours: 0,
    };
    const f = forecast(empty, option("current"), expected);
    expect(f.months[0]).toMatchObject({ clients: 0, requiredHours: 0, pressure: false, utilisation: 0 });
    expect(blendedHours(empty)).toBe(0);
  });

  it("never goes below zero participants", () => {
    const f = forecast({ ...MAYA_INPUTS, newPerMonth: 0, exitsPerMonth: 10 }, option("current"), expected);
    expect(f.months.every((m) => m.clients >= 0)).toBe(true);
    expect(f.months.at(-1)!.clients).toBe(0);
  });

  it("applies leave, temporary help, a workflow saving and paced intake where they fall", () => {
    const base = forecast(MAYA_INPUTS, option("current"), expected);
    const adj = forecast(MAYA_INPUTS, option("current"), expected, [
      { kind: "leave", month: 4, hours: 60.8 },
      { kind: "temporary", fromMonth: 3, months: 3, hours: 20, cost: 1_700 },
      { kind: "saving", fromMonth: 3, share: 0.15, setupCost: 2_500 },
      { kind: "intake", fromMonth: 3, extraNew: -1 },
    ]);
    expect(adj.months[3].availableHours).toBeCloseTo(base.months[3].availableHours - 60.8 + 20, 6);
    expect(adj.months[4].availableHours).toBeCloseTo(base.months[4].availableHours + 20, 6);
    expect(adj.months[5].availableHours).toBeCloseTo(base.months[5].availableHours, 6);
    expect(adj.months[1].oneOff).toBe(2_500);
    expect(adj.months[2].newClients).toBe(2);
    expect(adj.months[2].requiredHours).toBeLessThan(base.months[2].requiredHours);
  });

  it("is deterministic and keeps full precision", () => {
    const a = forecast(MAYA_INPUTS, option("add-06"), MAYA_GROWTH[2]);
    const b = forecast(MAYA_INPUTS, option("add-06"), MAYA_GROWTH[2]);
    expect(a).toEqual(b);
    expect(Number.isInteger(a.months[0].requiredHours)).toBe(false);
  });
});
