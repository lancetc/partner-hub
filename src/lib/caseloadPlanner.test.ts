import { describe, expect, it } from "vitest";
import { forecast } from "./hiringModel";
import { MAYA_GROWTH, MAYA_INPUTS, MAYA_OPTIONS } from "./hiringRunway";
import {
  analyse,
  blankPlan,
  cleanPlan,
  decision,
  fictionalExample,
  growthCases,
  monthlyRows,
  readPlan,
  whatChanged,
  workbookSheets,
  type Plan,
} from "./caseloadPlanner";

/* The Caseload-to-Margin Work Tool's plans: the fictional fixture, blank business plans, revenue unknown, and the PRD's edge cases. */

const example = () => fictionalExample();
const withValues = (p: Plan, patch: Partial<Plan["values"]>): Plan => ({ ...p, values: { ...p.values, ...patch } });

describe("the fictional example", () => {
  it("reproduces the reference prototype through the planner", () => {
    const a = analyse(example(), "expected", "add-06")!;
    expect(a.clientsNow).toBe(35);
    expect(a.noHire.firstPressure).toBe(3);
    expect(a.byOption["add-06"].monthsAbove).toBe(0);
    expect(Math.round(a.byOption["add-06"].lowestCash)).toBe(18_160);
    expect(a.byOption["add-10"].monthsAbove).toBe(0);
    expect(Math.round(a.byOption["add-10"].lowestCash)).toBe(-1_670);
  });

  it("matches the shared model's Maya fixture month for month", () => {
    const a = analyse(example(), "expected", "current")!;
    const direct = forecast(MAYA_INPUTS, MAYA_OPTIONS[0], MAYA_GROWTH[1]);
    a.noHire.months.forEach((m, i) => {
      expect(m.requiredHours).toBeCloseTo(direct.months[i].requiredHours, 9);
      expect(m.closingCash).toBeCloseTo(direct.months[i].closingCash, 9);
    });
  });

  it("shows both conflicts: a profitable no-hire path under pressure, and a safe hire below the reserve", () => {
    const none = analyse(example(), "expected", "current")!;
    expect(none.noHire.operating12).toBeGreaterThan(0);
    expect(decision(none).warnings.join(" ")).toMatch(/doesn’t make the workload safe/);
    const one = analyse(example(), "expected", "add-10")!;
    expect(one.selected.monthsAbove).toBe(0);
    expect(decision(one).warnings.join(" ")).toMatch(/below your \$10,000 reserve/);
  });

  it("explains the window and never gives an order", () => {
    const d = decision(analyse(example(), "expected", "add-06")!);
    expect(d.headline).toBe("Current-team work exceeds your 85% planning threshold in Month 3.");
    expect(d.reasons[0]).toBe("A two-month search and two-month ramp make recruitment planning timely now.");
    expect(d.reasons[1]).toMatch(/any later than Month 1 adds months above the threshold/);
    expect(JSON.stringify(d)).not.toMatch(/hire now/i);
    expect(d.caveat).toMatch(/not a hiring order/);
  });
});

describe("a new business plan", () => {
  it("never starts with the fictional income, and needs the caseload before it forecasts", () => {
    const p = blankPlan();
    expect(p.values.income).toBeNull();
    expect(p.values.staffCostPerFte).toBeNull();
    const r = readPlan(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("standardCount");
  });

  it("forecasts capacity with income blank, and says revenue is unknown", () => {
    const p = withValues(blankPlan(), {
      standardCount: 10,
      higherCount: 5,
      intensiveCount: 0,
      newPerMonth: 2,
      exitsPerMonth: 1,
      standardHours: 1.5,
      higherHours: 2.5,
      intensiveHours: 4,
      onboardingHours: 3,
      reviewHours: 4,
      currentFte: 0.4,
    });
    const a = analyse(p, "expected", "current")!;
    expect(a.revenueKnown).toBe(false);
    expect(a.moneyKnown).toBe(false);
    const d = decision(a);
    expect(d.warnings[0]).toMatch(/^Revenue unknown/);
    expect(d.reasons.join(" ")).not.toMatch(/\$/);
    expect(monthlyRows(a.selected, a)[0][7]).toBe("Revenue unknown");
    expect(whatChanged(a, analyse(withValues(p, { currentFte: 1 }), "expected", "current")).map((c) => c.label)).not.toContain("Lowest cash");
  });

  it("treats a cleared field as blank, not zero, and names it", () => {
    const r = readPlan(withValues(example(), { currentFte: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["currentFte"]);
  });

  it("names a field that can't be used", () => {
    const r = readPlan(withValues(example(), { availability: 140, leadMonths: 1.5 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid.map((x) => x.key)).toEqual(["availability", "leadMonths"]);
  });

  it("marks financial figures illustrative until the income is verified", () => {
    const p = { ...example(), kind: "business" as const };
    expect(analyse(p, "expected", "current")!.illustrative).toBe(true);
    const verified = { ...p, provenance: { ...p.provenance, income: { status: "verified" as const, source: "Agreement v3", date: "2026-11-01" } } };
    expect(analyse(verified, "expected", "current")!.illustrative).toBe(false);
  });

  it("cleans whatever it's sent", () => {
    const c = cleanPlan({ kind: "business", values: { income: "360", standardCount: 5, nonsense: 1 }, provenance: { income: { status: "hacked" } } });
    expect(c.values.income).toBeNull();
    expect(c.values.standardCount).toBe(5);
    expect("nonsense" in c.values).toBe(false);
    expect(c.provenance.income?.status).toBe("entered");
  });
});

describe("the PRD's edge cases", () => {
  const a = (p: Plan, option: "current" | "add-06" | "add-10" | "workflow" = "current", growth = "expected") => analyse(p, growth, option)!;

  it("no participants and no work", () => {
    const f = a(withValues(example(), { standardCount: 0, higherCount: 0, intensiveCount: 0, newPerMonth: 0, reviewHours: 0 })).noHire;
    expect(f.months[0]).toMatchObject({ clients: 0, requiredHours: 0, pressure: false });
  });

  it("no available capacity", () => {
    const x = a(withValues(example(), { currentFte: 0 }));
    expect(x.noHire.months[0].utilisation).toBeNull();
    expect(decision(x).headline).toMatch(/no available capacity from Month 1/);
    expect(monthlyRows(x.noHire, x)[0][5]).toBe("No available capacity");
  });

  it("early and late hires", () => {
    const late = a(withValues(example(), { startMonth: 6 }), "add-06");
    expect(late.selected.joins).toBe(8);
    expect(late.selected.monthsAbove).toBeGreaterThan(0);
    expect(a(example(), "add-06").selected.joins).toBe(3);
  });

  it("part-time and full-time ramps, salary from joining", () => {
    const six = a(example(), "add-06").selected;
    expect(six.months[2].staffCost).toBeCloseTo(7_550 * 1.6, 6);
    const instant = a(withValues(example(), { rampMonths: 0 }), "add-10").selected;
    expect(instant.months[2].availableHours).toBeCloseTo(2 * instant.months[0].availableHours, 6);
  });

  it("slower and faster growth, with editable deltas", () => {
    expect(a(example(), "current", "slower").noHire.firstPressure ?? 99).toBeGreaterThan(3);
    expect(a(example(), "current", "faster").noHire.firstPressure!).toBeLessThanOrEqual(3);
    const p = { ...example(), faster: { newDelta: 3, exitDelta: 0, complexity: 1 } };
    expect(growthCases(p)[2].describe).toBe("Faster: 3 more new participants each month than your base.");
    expect(a(p, "current", "faster").noHire.months[0].newClients).toBe(6);
    // Switching cases leaves the base untouched.
    expect(a(p, "current", "expected").noHire.months[0].newClients).toBe(3);
  });

  it("zero income, a fixed monthly basis, and delayed payments", () => {
    const zero = a(withValues(example(), { income: 0 }));
    expect(zero.revenueKnown).toBe(true);
    expect(zero.noHire.months[0].earned).toBe(0);
    const fixed = a({ ...example(), incomeBasis: "fixed-monthly", values: { ...example().values, income: 15_000 } });
    expect(fixed.noHire.months.every((m) => m.earned === 15_000)).toBe(true);
    const slow = a(withValues(example(), { paymentLagMonths: 2, receivable2: 12_600 }));
    expect(slow.noHire.months[0].received).toBe(12_600);
    expect(slow.noHire.months[1].received).toBe(12_600);
    expect(slow.noHire.months[2].received).toBe(slow.noHire.months[0].earned);
  });

  it("counts an opening receivable once, however long the lag", () => {
    const x = a(withValues(example(), { paymentLagMonths: 3, receivable1: 10_000, receivable2: null, receivable3: null }));
    const opening = x.noHire.months.slice(0, 3).reduce((n, m) => n + m.received, 0);
    expect(opening).toBe(10_000);
  });

  it("a negative operating result and a reserve breach", () => {
    const x = a(withValues(example(), { income: 150 }), "add-10");
    expect(x.selected.operating12).toBeLessThan(0);
    expect(x.selected.firstReserveBreach).not.toBeNull();
    expect(decision(x).warnings.join(" ")).toMatch(/Cash goes negative/);
  });

  it("a workflow saving: hypothetical until checked, onboarding and reviews still there", () => {
    const x = a(example(), "workflow");
    const none = x.noHire;
    expect(x.selected.months[0].requiredHours).toBeCloseTo(none.months[0].requiredHours, 9);
    expect(x.selected.months[1].requiredHours).toBeLessThan(none.months[1].requiredHours);
    expect(x.selected.months[0].oneOff).toBe(2_500);
    expect(decision(x).warnings.join(" ")).toMatch(/hypothetical/);
    expect(decision(a({ ...example(), workflowChecked: true }, "workflow")).warnings.join(" ")).not.toMatch(/hypothetical/);
  });

  it("an incoming mix that differs from today's keeps hours band by band", () => {
    const same = a(withValues(example(), { mixStandard: (20 / 35) * 100, mixHigher: (10 / 35) * 100, mixIntensive: (5 / 35) * 100 }));
    const base = a(example());
    same.noHire.months.forEach((m, i) => expect(m.requiredHours).toBeCloseTo(base.noHire.months[i].requiredHours, 6));
    const heavy = a(withValues(example(), { mixStandard: 0, mixHigher: 0, mixIntensive: 100 }));
    expect(heavy.noHire.months[5].requiredHours).toBeGreaterThan(base.noHire.months[5].requiredHours);
    expect(heavy.noHire.months[5].clients).toBeCloseTo(base.noHire.months[5].clients, 9);
  });

  it("doesn't count leave or admin twice: availability and productive share multiply once", () => {
    const x = a(example());
    expect(x.noHire.months[0].availableHours).toBeCloseTo(((38 * 52) / 12) * 0.9 * 0.8, 9);
  });

  it("validates the planning window by simulation", () => {
    const relaxed = a(withValues(example(), { newPerMonth: 1, exitsPerMonth: 0 }), "add-06");
    expect(relaxed.noHire.firstPressure).not.toBeNull();
    expect(relaxed.window.pressureBeforeJoin).toBe(false);
    expect(relaxed.window.latestStart).not.toBeNull();
    const at = forecast(
      readPlanInputs(withValues(example(), { newPerMonth: 1, exitsPerMonth: 0 })),
      { ...MAYA_OPTIONS[1], startMonth: relaxed.window.latestStart! },
      MAYA_GROWTH[1],
    );
    expect(at.monthsAbove).toBe(
      forecast(readPlanInputs(withValues(example(), { newPerMonth: 1, exitsPerMonth: 0 })), MAYA_OPTIONS[1], MAYA_GROWTH[1]).monthsAbove,
    );
  });

  it("records classifications without using them", () => {
    const p = { ...example(), classifications: [1, 2, 3, 4, 5, 6, 7, 8] };
    expect(a(p).noHire.months).toEqual(a(example()).noHire.months);
  });
});

function readPlanInputs(p: Plan) {
  const r = readPlan(p);
  if (!r.ok) throw new Error("not ok");
  return r.inputs;
}

describe("what changed", () => {
  it("shows the pressure month and operating result, and cash when only cash moved", () => {
    const before = analyse(example(), "expected", "add-06");
    const busier = analyse(withValues(example(), { newPerMonth: 5 }), "expected", "add-06");
    const labels = whatChanged(before, busier).map((c) => c.label);
    expect(labels).toContain("No-hire pressure month");
    expect(labels).toContain("12-month operating result");
    const richer = analyse(withValues(example(), { openingCash: 40_000 }), "expected", "add-06");
    expect(whatChanged(before, richer)).toEqual([{ label: "Lowest cash", before: "$18,160", after: "$31,440" }]);
  });
});

describe("the workbook", () => {
  it("has the five sheets, and its monthly sheet is the on-screen table", () => {
    const p = example();
    const a = analyse(p, "expected", "add-10")!;
    const sheets = workbookSheets(p, a, { name: "Example", generatedAt: "2026-11-22T00:00:00Z", version: null });
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Inputs and provenance", "Monthly forecast", "Option comparison", "Assumptions and model version"]);
    const monthly = sheets[2];
    expect(monthly.rows).toEqual(monthlyRows(a.selected, a));
    // Reconciles: the months' operating results add to the 12-month figure, and the last closing cash follows.
    const op = monthly.rows.reduce((n, r) => n + (r[12] as number), 0);
    expect(op).toBeCloseTo(a.selected.operating12, 0);
    expect(sheets[3].rows.find((r) => r[0] === "Add 1.0 FTE")![4]).toBe(-1_670);
  });

  it("carries no names, and says revenue unknown rather than inventing it", () => {
    const p = withValues(blankPlan(), {
      standardCount: 3,
      higherCount: 0,
      intensiveCount: 0,
      newPerMonth: 0,
      exitsPerMonth: 0,
      standardHours: 1,
      higherHours: 1,
      intensiveHours: 1,
      onboardingHours: 0,
      reviewHours: 0,
      currentFte: 0.2,
    });
    const a = analyse(p, "expected", "current")!;
    const sheets = workbookSheets(p, a, { name: "Mine", generatedAt: "x", version: 2 });
    expect(sheets[0].rows.find((r) => r[0] === "Lowest cash (option)")![1]).toBe("Revenue unknown");
    expect(sheets[1].rows.find((r) => r[1] === "Agreement income")![2]).toBe("Blank");
  });
});
