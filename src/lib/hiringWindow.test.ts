import { describe, expect, it } from "vitest";
import { forecast, type HiringInputs, type HiringOption } from "./hiringModel";
import { breakEvenMonth, decisionWindow, SENSITIVITIES, sensitivity, WINDOW_VERSION, windowSummary, type WindowInput } from "./hiringWindow";
import { MAYA_GROWTH, MAYA_INPUTS, MAYA_OPTIONS, modelFixturesPass, windowFixturesPass } from "./hiringRunway";
import { analyse, blankPlan, decision, fictionalExample, type Plan } from "./caseloadPlanner";

/*
  The decision window (Care Partner Hiring Runway PRD, sections 6 and 15): a window and its assumptions across low,
  base and high cases, never one exact trigger; recruitment lead and ramp; contribution, operating result and cash
  runway side by side; conflict shown plainly; revenue unknown is unknown. Every figure is fictional.
*/

const maya = (patch: Partial<WindowInput> = {}): WindowInput => ({ inputs: MAYA_INPUTS, options: MAYA_OPTIONS, growth: MAYA_GROWTH, ...patch });
const withInputs = (p: Partial<HiringInputs>) => maya({ inputs: { ...MAYA_INPUTS, ...p } });
const withHires = (p: Partial<HiringOption>) => maya({ options: MAYA_OPTIONS.map((o) => (o.kind === "hire" ? { ...o, ...p } : o)) });
const option = (w: ReturnType<typeof decisionWindow>, id: string) => w.options.find((o) => o.id === id)!;
const allText = (w: ReturnType<typeof decisionWindow>) =>
  [w.recommendation.headline, ...w.recommendation.factors, ...w.recommendation.alternatives, ...w.assumptions, w.caveat].join(" ");

describe("the model under the window", () => {
  it("still reproduces the reviewed fixtures, and the margins add up", () => {
    expect(modelFixturesPass()).toBe(true);
    expect(windowFixturesPass()).toBe(true);
    for (const o of MAYA_OPTIONS)
      for (const m of forecast(MAYA_INPUTS, o, MAYA_GROWTH[1]).months) {
        // The split is additive only: other costs, operating result and cash are what they always were.
        expect(m.variableCost + m.fixedCost + m.ownerPay).toBeCloseTo(m.otherCost, 6);
        expect(m.contribution).toBeCloseTo(m.earned - m.staffCost - m.variableCost - m.oneOff, 6);
        expect(m.operatingBeforeOwner - m.ownerPay).toBeCloseTo(m.operating, 6);
      }
  });

  it("finds the break-even month: the first month from which the monthly result stays at or above zero", () => {
    const f = forecast(MAYA_INPUTS, MAYA_OPTIONS[1], MAYA_GROWTH[1]);
    const b = breakEvenMonth(f)!;
    expect(b).toBe(6);
    expect(f.months.slice(b - 1).every((m) => m.operating >= 0)).toBe(true);
    expect(f.months[b - 2].operating).toBeLessThan(0);
    expect(breakEvenMonth({ ...f, months: f.months.map((m) => ({ ...m, operating: -1 })) })).toBeNull();
  });
});

describe("the decision window for Maya's fictional case", () => {
  const w = decisionWindow(maya());

  it("reads a capacity date for each case and a recruitment window from lead and ramp", () => {
    expect(w.version).toBe(WINDOW_VERSION);
    expect(w.cases.map((c) => [c.id, c.capacityMonth, c.startBy])).toEqual([
      ["slower", null, null],
      ["expected", 3, 0],
      ["faster", 1, -2],
    ]);
    // Pressure from Month 1 (faster) to Month 3 (expected); none in the slower case.
    expect(w.pressure).toMatchObject({ from: 1, to: 3, allCases: false });
    // Start-by = capacity − 2-month search − 2-month ramp + 1; the window widens by the month the search may run over.
    expect(w.recruit).toEqual({ earliest: -3, latest: 0, base: 0, late: true, openNow: true });
    expect(w.recommendation.kind).toBe("interim-and-recruit");
    expect(w.recommendation.headline).toMatch(/before a new coordinator could reach full capacity \(Month 4 at the earliest\)/);
  });

  it("puts capacity, contribution margin, operating result and cash side by side for every option", () => {
    expect(w.options.map((o) => o.id)).toEqual(["current", "add-06", "add-10", "workflow"]);
    const none = option(w, "current");
    const six = option(w, "add-06");
    const ten = option(w, "add-10");
    expect([none.monthsAbove, six.monthsAbove, ten.monthsAbove]).toEqual([10, 0, 0]);
    expect(six).toMatchObject({ lowestCash: 18_160, firstReserveBreach: null, breakEven: 6, cashRisk: false, joins: 3 });
    expect(ten).toMatchObject({ lowestCash: -1_670, firstReserveBreach: 5, breakEven: 11, cashRisk: true, negativeCash: true });
    // Owner remuneration never disappears: operating result is the before-owner result less 12 months of it.
    for (const o of w.options) expect(o.operatingBeforeOwner12 - o.operating12).toBeCloseTo(12 * MAYA_INPUTS.ownerPay, 6);
    // The worst cash across cases is no better than the base case's.
    for (const o of w.options) expect(o.worstCash).toBeLessThanOrEqual(o.lowestCash);
    expect(option(w, "workflow").hypothetical).toBe(true);
  });

  it("warns about quality even when margin is positive, and about cash even when a hire is profitable", () => {
    // Keeping the current team is profitable and still over the threshold for ten months.
    expect(option(w, "current").operating12).toBeGreaterThan(0);
    expect(w.recommendation.factors.join(" ")).toMatch(/margin doesn’t make the workload safe/);
    // A cheaper full-time hire that's profitable over the year can still breach the reserve.
    const cheaper = decisionWindow(withInputs({ incomePerClient: 470, openingCash: 12_000 }));
    const ten = option(cheaper, "add-10");
    expect(ten.operating12).toBeGreaterThan(0);
    expect(ten.cashRisk).toBe(true);
    expect(cheaper.recommendation.factors.join(" ")).toMatch(/Add 1\.0 FTE has a positive 12-month operating result but still dips below the reserve/);
  });

  it("says which hire stays above the reserve when one does and another doesn't", () => {
    expect(w.recommendation.factors.join(" ")).toMatch(/Add 0\.6 FTE stays above the reserve; Add 1\.0 FTE doesn’t/);
  });
});

describe("recruitment and ramp timing", () => {
  it("moves the start window a month earlier for each extra month of search or ramp", () => {
    const base = decisionWindow(maya());
    const longer = decisionWindow(withHires({ leadMonths: 3 }));
    const slower = decisionWindow(withHires({ rampMonths: 3 }));
    for (const x of [longer, slower]) {
      expect(x.cases.map((c) => c.capacityMonth)).toEqual(base.cases.map((c) => c.capacityMonth));
      expect(x.recruit!.latest).toBe(base.recruit!.latest - 1);
      expect(x.recruit!.earliest).toBe(base.recruit!.earliest - 1);
    }
    // A longer search also pushes back the earliest a hire could join: pressure now arrives before anyone could join.
    expect(longer.earliestJoin).toBe(4);
    expect(longer.pressureBeforeJoin).toBe(true);
    expect(longer.recommendation.headline).toMatch(/before a new coordinator could join \(Month 4 at the earliest\)/);
  });

  it("costs each hire from the base case's start-by, so a late pressure date isn't judged on a hire paid from Month 1", () => {
    const w = decisionWindow(withInputs({ currentFte: 1.4 }));
    const base = w.cases.find((c) => c.id === "expected")!;
    expect(base.startBy).toBeGreaterThan(1);
    expect(w.timedStart).toBe(base.startBy);
    expect(option(w, "add-06").joins).toBe(base.startBy! + 2);
    // Paid from Month 1 instead, the same hire would look far worse on cash.
    const early = forecast({ ...MAYA_INPUTS, currentFte: 1.4 }, MAYA_OPTIONS[1], MAYA_GROWTH[1]);
    expect(option(w, "add-06").lowestCash).toBeGreaterThan(early.lowestCash);
    // Maya's own window is unchanged: her hires already start in Month 1.
    expect(decisionWindow(maya()).timedStart).toBe(1);
  });

  it("widens the window by the stated recruitment uncertainty, never narrowing it to one month", () => {
    const tight = decisionWindow(maya({ leadSpread: 0 }));
    const wide = decisionWindow(maya({ leadSpread: 2 }));
    expect(tight.recruit!.earliest - wide.recruit!.earliest).toBe(2);
    expect(tight.recruit!.latest).toBe(wide.recruit!.latest);
    expect(wide.assumptions.join(" ")).toMatch(/plus or minus 2 months/);
  });

  it("plans recruitment for a later window when pressure comes later, from the earliest case to the latest", () => {
    // 0.4 FTE more today and more cash: pressure comes later, so the window opens in the future.
    const w = decisionWindow(withInputs({ currentFte: 1.4, openingCash: 60_000 }));
    const pressured = w.cases.filter((c) => c.capacityMonth !== null);
    expect(pressured.length).toBeGreaterThan(0);
    for (const c of pressured) expect(c.startBy).toBe(c.capacityMonth! - 2 - 2 + 1);
    const starts = pressured.map((c) => c.startBy!);
    expect(w.recruit!.earliest).toBe(Math.min(...starts) - 1);
    expect(w.recruit!.latest).toBe(Math.max(...starts));
    expect(w.recruit!.earliest).toBeLessThanOrEqual(w.recruit!.latest);
    expect(["plan-recruitment", "begin-recruiting", "watch"]).toContain(w.recommendation.kind);
  });
});

describe("cash runway", () => {
  it("a later payment run lowers the lowest cash without changing capacity", () => {
    const base = decisionWindow(maya());
    const late = decisionWindow(maya({ adjustments: [{ kind: "paymentDelay", fromMonth: 1, extraMonths: 1 }] }));
    expect(late.cases.map((c) => c.capacityMonth)).toEqual(base.cases.map((c) => c.capacityMonth));
    expect(option(late, "add-06").lowestCash).toBeLessThan(option(base, "add-06").lowestCash);
    expect(option(late, "add-06").operating12).toBeCloseTo(option(base, "add-06").operating12, 6);
  });

  it("shows the conflict plainly when capacity is needed but every hire breaches the reserve", () => {
    const w = decisionWindow(withInputs({ openingCash: 4_000 }));
    expect(w.recommendation.kind).toBe("conflict");
    expect(w.recommendation.headline).toMatch(/every hire option takes cash below the \$10,000 reserve/);
    expect(w.recommendation.alternatives).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Interim or contract capacity/),
        expect.stringMatching(/Pace intake/),
        expect.stringMatching(/Trilogy Care/),
      ]),
    );
  });

  it("treats unknown revenue as unknown: no affordability, no fabricated margin", () => {
    const w = decisionWindow(maya({ revenueKnown: false }));
    expect(w.moneyKnown).toBe(false);
    expect(w.options.every((o) => !o.cashRisk)).toBe(true);
    expect(w.recommendation.factors.join(" ")).toMatch(/Revenue unknown: enter the agreement’s income/);
    expect(w.recommendation.factors.join(" ")).not.toMatch(/lowest cash/);
    expect(w.recommendation.kind).not.toBe("conflict");
    // The planner reads a blank income the same way: capacity still forecasts, the window still opens.
    const blank: Plan = { ...fictionalExample(), kind: "business", values: { ...fictionalExample().values, income: null } };
    const a = analyse(blank, "expected", "add-06")!;
    expect(a.range.revenueKnown).toBe(false);
    expect(a.range.recruit).not.toBeNull();
  });
});

describe("no single exact trigger", () => {
  it("never names a client count to hire at, an order to hire now, or a staffing ratio, across many businesses", () => {
    for (const fte of [0.6, 1, 1.4, 2])
      for (const newPerMonth of [0, 2, 3, 6])
        for (const openingCash of [2_000, 26_720, 80_000]) {
          const w = decisionWindow(withInputs({ currentFte: fte, newPerMonth, openingCash }));
          const text = allText(w);
          expect(text).not.toMatch(/\b\d+\s+(clients|participants)\b/i);
          expect(text).not.toMatch(/\bhire now\b|\byou (must|should) hire\b/i);
          expect(text).not.toMatch(/clients?[- ]per[- ]coordinator/i);
          if (w.recruit) expect(w.recruit.earliest).toBeLessThanOrEqual(w.recruit.latest);
          expect(w.caveat).toMatch(/not a hiring instruction, a client count at which to hire, or a staffing ratio/);
        }
  });

  it("holds and monitors when no case is under pressure, and only watches when just the faster case is", () => {
    const calm = decisionWindow(withInputs({ currentFte: 3 }));
    expect(calm.recommendation.kind).toBe("hold-monitor");
    expect(calm.recruit).toBeNull();
    expect(calm.recommendation.alternatives).toEqual([]);
    const watch = [1.2, 1.3, 1.4, 1.5, 1.6, 1.7].map((fte) => decisionWindow(withInputs({ currentFte: fte }))).find((x) => x.recommendation.kind === "watch");
    expect(watch).toBeDefined();
    expect(watch!.cases.find((c) => c.id === "expected")!.capacityMonth).toBeNull();
    expect(watch!.recommendation.headline).toMatch(/^Only the faster and more complex case passes the threshold/);
  });

  it("is deterministic: the same inputs give the same window", () => {
    expect(decisionWindow(maya())).toEqual(decisionWindow(maya()));
    expect(sensitivity(maya())).toEqual(sensitivity(maya()));
  });

  it("a figure-free summary carries months and a kind, nothing in dollars", () => {
    const s = windowSummary(decisionWindow(maya()));
    expect(s).toEqual({ version: WINDOW_VERSION, kind: "interim-and-recruit", pressureFrom: 1, pressureTo: 3, startFrom: 1, startTo: 1 });
  });
});

describe("guardrails and sensitivity", () => {
  it("shows the monthly-contact guardrail only when the agreement assigns it to the business", () => {
    expect(decisionWindow(maya()).recommendation.factors.join(" ")).not.toMatch(/direct care-management contact/);
    expect(decisionWindow(maya({ contactDuty: true })).recommendation.factors.join(" ")).toMatch(/direct care-management contact .* service risk/);
    // In the planner, the warning follows the plan's own setting.
    const p = { ...fictionalExample(), contactDuty: true };
    expect(decision(analyse(p, "expected", "current")!).warnings.join(" ")).toMatch(/monthly direct care-management contact/);
    expect(decision(analyse(fictionalExample(), "expected", "current")!).warnings.join(" ")).not.toMatch(/monthly direct care-management contact/);
  });

  it("changes one stated assumption at a time and says what moved", () => {
    const s = sensitivity(maya());
    expect(s.rows.map((r) => r.id)).toEqual(SENSITIVITIES.map((x) => x.id));
    expect(s.base).toMatchObject({ capacityMonth: 3, startBy: 0, lowestCash: 18_160 });
    const row = (id: string) => s.rows.find((r) => r.id === id)!;
    expect(row("referrals").capacityMonth).toBeLessThan(3);
    expect(row("lead").startBy).toBe(-1);
    expect(row("lead").capacityMonth).toBe(3);
    expect(row("lag").lowestCash).toBeLessThan(s.base.lowestCash);
    expect(row("lag").capacityMonth).toBe(3);
    expect(row("exits").capacityMonth).toBeGreaterThan(3);
    for (const r of s.rows) expect(r.moved.length).toBeGreaterThan(0);
  });

  it("a blank business plan has no window until its caseload is in", () => {
    expect(analyse(blankPlan(), "expected", "add-06")).toBeNull();
  });
});
