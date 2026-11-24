import { describe, expect, it } from "vitest";
import {
  addDays,
  BASELINE,
  blankInputs,
  brisbaneDate,
  calculate,
  chartLow,
  cleanInputs,
  mergeScenario,
  money,
  planChanges,
  tableDays,
  validateInputs,
  windowEnd,
  type CashEvent,
  type CashInputs,
  type Hire,
} from "./cashBridge";

/*
  The 90-Day Cash Bridge model against the PRD's worked fixture and acceptance criteria (section 12): exact dates,
  cents, the opening instant, the conservative intraday check kept apart, a midweek payroll low the weekly view
  would hide, receipts only on settlement, no fees from enquiries or allocations, no double counting, and a hire
  date that moves cash but never makes a fee.
*/

const ev = (id: string, category: CashEvent["category"], date: string, amount: CashEvent["amount"], more: Partial<CashEvent> = {}): CashEvent => ({
  id,
  label: id,
  category,
  date,
  amount,
  status: "projected",
  source: "fictional",
  asOf: "",
  uncertain: category === "receivable" || category === "otherIncome",
  discretionary: false,
  essential: false,
  serviceMonth: "",
  overdue: false,
  note: "",
  ...more,
});
const plain = (over: Partial<CashInputs> = {}): CashInputs => ({
  ...blankInputs("2026-12-01"),
  agreement: null,
  caseload: { active: 0, exits: [], source: "fictional" },
  statutory: { super: "na", payg: "na", gst: "na", incomeTax: "na" },
  ...over,
});

/** The PRD's worked fixture: $10,000 opening, $4,000 reserve, three dated pairs, receipts settling first. */
const fixture = (receipt15 = "2026-12-15") =>
  plain({
    openingCash: 10_000,
    reserve: 4_000,
    events: [
      ev("r1", "otherIncome", "2026-12-01", 2_000),
      ev("o1", "other", "2026-12-01", 5_000),
      ev("r2", "otherIncome", "2026-12-08", 1_000),
      ev("o2", "other", "2026-12-08", 6_000),
      ev("r3", "otherIncome", receipt15, 6_000),
      ev("o3", "other", "2026-12-15", 3_000),
    ],
  });

describe("the window", () => {
  it("is 90 consecutive Brisbane dates including the start, in 13 display buckets with a shorter last one", () => {
    const r = calculate(fixture());
    expect(r.days).toHaveLength(90);
    expect(r.days[0].date).toBe("2026-12-01");
    expect(r.days[89].date).toBe("2027-02-28");
    expect(windowEnd("2026-12-01")).toBe("2027-02-28");
    for (let k = 1; k < 90; k++) expect(r.days[k].date).toBe(addDays(r.days[k - 1].date, 1));
    expect(r.buckets).toHaveLength(13);
    expect(r.buckets.slice(0, 12).every((b) => b.days === 7)).toBe(true);
    expect(r.buckets[12]).toMatchObject({ days: 6, from: "2027-02-23", to: "2027-02-28" });
    // Evening of 30 November in UTC is already 1 December in Brisbane.
    expect(brisbaneDate(new Date("2026-11-30T15:00:00Z"))).toBe("2026-12-01");
    expect(brisbaneDate(new Date("2026-11-30T13:59:00Z"))).toBe("2026-11-30");
  });
});

describe("the worked fictional fixture (PRD section 6 and 12)", () => {
  it("finds a $2,000 low on 8 December, needs $12,000 opening cash, and a $2,000 additional gap", () => {
    const r = calculate(fixture());
    expect(r.days.filter((d) => d.events.length).map((d) => [d.date, d.closing])).toEqual([
      ["2026-12-01", 700_000],
      ["2026-12-08", 200_000],
      ["2026-12-15", 500_000],
    ]);
    expect(r.low).toMatchObject({ cents: 200_000, date: "2026-12-08", atOpening: false });
    expect(r.worstCumulative).toBe(-800_000);
    expect(r.required).toBe(1_200_000);
    expect(r.additional).toBe(200_000);
    expect([money(r.low.cents), money(r.required), money(r.additional!)]).toEqual(["$2,000", "$12,000", "$2,000"]);
    // The reserve shortfall is $2,000 on the low date.
    expect(r.reserve - r.low.cents).toBe(200_000);
  });

  it("moving the $6,000 receipt to 8 December gives a $5,000 low, $9,000 required and no gap", () => {
    const r = calculate(fixture("2026-12-08"));
    expect(r.low.cents).toBe(500_000);
    expect(r.low.date).toBe("2026-12-15");
    expect(r.required).toBe(900_000);
    expect(r.additional).toBe(0);
  });

  it("keeps the conservative intraday check separately labelled, never mixed into the end-of-day result", () => {
    const moved = calculate(fixture("2026-12-08"));
    // If the $6,000 outflow cleared before the $7,000 of receipts on 8 December, the balance would touch $1,000.
    expect(moved.days.find((d) => d.date === "2026-12-08")!.intraday).toBe(100_000);
    expect(moved.intraday.risks).toEqual([{ date: "2026-12-08", cents: 100_000 }]);
    expect(moved.low.cents).toBe(500_000);
    expect(moved.required).toBe(900_000);
    // And the original fixture flags every same-day pair.
    const base = calculate(fixture());
    expect(base.intraday).toMatchObject({ cents: -100_000, date: "2026-12-15" });
    expect(base.intraday.risks.map((x) => x.date)).toEqual(["2026-12-08", "2026-12-15"]);
    expect(base.low.cents).toBe(200_000);
  });

  it("counts the opening instant: a business that starts below its reserve needs to close that gap", () => {
    const r = calculate(plain({ openingCash: 3_000, reserve: 4_000, events: [ev("r", "otherIncome", "2026-12-02", 5_000)] }));
    expect(r.low).toMatchObject({ cents: 300_000, date: "2026-12-01", atOpening: true });
    expect(r.required).toBe(400_000);
    expect(r.additional).toBe(100_000);
  });
});

describe("a midweek payroll low point", () => {
  it("is found on its actual date even when the end-of-week balance stays above the reserve, and the chart and table agree", () => {
    // Tuesday 1 December start: the first bucket runs Tuesday 1 to Monday 7 December. Payroll is Thursday 3 December.
    const r = calculate(
      plain({
        openingCash: 10_000,
        reserve: 5_000,
        events: [ev("pay", "wages", "2026-12-03", 8_000, { status: "committed" }), ev("fee", "otherIncome", "2026-12-04", 8_000)],
      }),
    );
    expect(r.buckets[0].closing).toBe(1_000_000);
    expect(r.buckets[0].closing).toBeGreaterThanOrEqual(r.reserve);
    expect(r.low).toMatchObject({ cents: 200_000, date: "2026-12-03" });
    expect(r.buckets[0]).toMatchObject({ low: 200_000, lowDate: "2026-12-03" });
    expect(r.belowReserve).toMatchObject({ days: 1, first: "2026-12-03" });
    expect(chartLow(r)).toEqual({ date: "2026-12-03", bucket: 0, cents: 200_000 });
    const row = tableDays(r).find((d) => d.date === chartLow(r).date)!;
    expect(row.closing).toBe(r.low.cents);
  });
});

describe("what counts as cash", () => {
  const agreement = {
    label: "Fictional agreement",
    feePerMonth: 360,
    earning: "monthEnd" as const,
    lagMonths: 1,
    payDay: "lastWeekday" as const,
    clearDays: 0,
    source: "fictional" as const,
    asOf: "",
  };

  it("pays an earned fee only on its settlement date, and never from an enquiry or an allocation", () => {
    const i = plain({
      openingCash: 20_000,
      reserve: 0,
      agreement,
      caseload: { active: 10, exits: [], source: "fictional" },
      clients: [
        { id: "a", label: "Start 1", certainty: "agreement", start: "2026-12-07", source: "fictional" },
        { id: "b", label: "Start 2", certainty: "enquiry", start: "2026-12-07", source: "fictional" },
        { id: "c", label: "Start 3", certainty: "allocation", start: "2026-12-07", source: "fictional" },
      ],
    });
    const r = calculate(i);
    const fees = r.days.flatMap((d) => d.events).filter((e) => e.category === "fee");
    // December's fee (11 participants) is earned on 31 December and paid on the last weekday of January: Friday 29th.
    expect(fees.map((e) => [e.id, e.date, e.cents])).toEqual([
      ["fee-2026-12", "2027-01-29", 11 * 36_000],
      ["fee-2027-01", "2027-02-26", 11 * 36_000],
    ]);
    expect(r.earned.find((m) => m.month === "2026-12")).toMatchObject({ count: 11, paidOn: "2027-01-29", inWindow: true });
    // Nothing is received on 31 December, the day it's earned.
    expect(r.days.find((d) => d.date === "2026-12-31")!.receipts).toBe(0);
    // February's fee is paid after the window: earned, not cash.
    expect(r.outside.map((e) => e.id)).toEqual(["fee-2027-02"]);
  });

  it("without agreement terms forecasts no fee at all, and says the cash requirement isn’t reliable", () => {
    const r = calculate(plain({ openingCash: 1_000, reserve: 0, caseload: { active: 35, exits: [], source: "estimate" } }));
    expect(r.days.some((d) => d.receipts > 0)).toBe(false);
    expect(r.reliable).toBe(false);
    expect(r.limitations.map((l) => l.text).join(" ")).toMatch(/No agreement terms/);
    const unknownFee = calculate(
      plain({ openingCash: 1_000, reserve: 0, agreement: { ...agreement, feePerMonth: "unknown" }, caseload: { active: 35, exits: [], source: "estimate" } }),
    );
    expect(unknownFee.reliable).toBe(false);
    expect(unknownFee.days.some((d) => d.receipts > 0)).toBe(false);
  });

  it("refuses an existing receivable for a month the agreement already pays, and a loaded cost beside its components", () => {
    const twice = plain({
      openingCash: 1_000,
      reserve: 0,
      agreement,
      caseload: { active: 10, exits: [], source: "fictional" },
      events: [ev("rec", "receivable", "2027-01-29", 3_600, { serviceMonth: "2026-12" })],
    });
    expect(
      validateInputs(twice)
        .map((e) => e.message)
        .join(" "),
    ).toMatch(/counted twice|count them twice/);
    // November's receivable (before the window) is fine: it's entered once.
    expect(validateInputs({ ...twice, events: [ev("rec", "receivable", "2026-12-31", 3_600, { serviceMonth: "2026-11" })] })).toEqual([]);
    const both: Hire = {
      id: "h",
      label: "Coordinator role 1",
      fte: 1,
      start: "2026-01-01",
      existing: true,
      committed: true,
      payAnchor: "2026-12-03",
      everyDays: 14,
      basis: "loaded",
      grossPerPay: 3_000,
      superPerPay: 360,
      superLagDays: 7,
      onCostPerMonth: 270,
      onCostDay: 15,
      loadedPerPay: 3_484.62,
      source: "fictional",
    };
    expect(
      validateInputs(plain({ openingCash: 1, reserve: 0, hires: [both] }))
        .map((e) => e.message)
        .join(" "),
    ).toMatch(/not both/);
  });

  it("keeps blank, unknown and zero apart", () => {
    expect(validateInputs(plain({ openingCash: null, reserve: 0 })).map((e) => e.field)).toContain("openingCash");
    const unknown = calculate(plain({ openingCash: "unknown", reserve: 1_000, events: [ev("o", "other", "2026-12-05", 500)] }));
    expect(unknown.openingKnown).toBe(false);
    expect(unknown.additional).toBeNull();
    expect(unknown.required).toBe(150_000);
    const zero = calculate(plain({ openingCash: 0, reserve: 0 }));
    expect(zero.additional).toBe(0);
    expect(zero.reliable).toBe(true);
    const unknownAmount = calculate(plain({ openingCash: 100, reserve: 0, events: [ev("x", "tax", "2026-12-20", "unknown")] }));
    expect(unknownAmount.unknowns).toEqual([{ id: "x", label: "x", what: "amount unknown" }]);
    expect(unknownAmount.reliable).toBe(false);
  });

  it("never counts a credit limit as cash, and includes financing only when selected and fully costed", () => {
    const i = plain({
      openingCash: 1_000,
      reserve: 0,
      credit: { limit: 20_000, committed: false, note: "" },
      events: [
        ev("pay", "wages", "2026-12-10", 3_000),
        ev("draw", "draw", "2026-12-09", 5_000),
        ev("fee", "financeCost", "2026-12-09", 50),
        ev("back", "repayment", "2027-01-20", 5_000),
      ],
    });
    const off = calculate(i);
    expect(off.low.cents).toBe(-200_000);
    expect(off.financing).toMatchObject({ included: false, complete: true, limit: 2_000_000, drawn: 0 });
    const on = calculate(i, mergeScenario([{ financing: true }]));
    expect(on.financing).toMatchObject({ included: true, drawn: 500_000, repaid: 500_000, costs: 5_000, outstanding: 0 });
    expect(on.days.find((d) => d.date === "2026-12-10")!.closing).toBe(1_000 * 100 + 500_000 - 5_000 - 300_000);
    const partial = calculate({ ...i, events: i.events.filter((e) => e.id !== "back") }, mergeScenario([{ financing: true }]));
    expect(partial.financing.included).toBe(false);
    expect(partial.limitations.map((l) => l.text).join(" ")).toMatch(/Financing was selected/);
  });
});

describe("payroll and hires", () => {
  const coordinator = (over: Partial<Hire> = {}): Hire => ({
    id: "new",
    label: "Second coordinator",
    fte: 0.6,
    start: "2027-01-04",
    existing: false,
    committed: false,
    payAnchor: "2026-12-03",
    everyDays: 14,
    basis: "components",
    grossPerPay: 1_800,
    superPerPay: 216,
    superLagDays: 7,
    onCostPerMonth: 162,
    onCostDay: 15,
    loadedPerPay: null,
    source: "fictional",
    ...over,
  });
  const base = () =>
    plain({
      openingCash: 30_000,
      reserve: 10_000,
      agreement: {
        label: "Fictional agreement",
        feePerMonth: 360,
        earning: "monthEnd",
        lagMonths: 1,
        payDay: "lastWeekday",
        clearDays: 0,
        source: "fictional",
        asOf: "",
      },
      caseload: { active: 35, exits: [], source: "fictional" },
      hires: [coordinator()],
    });

  it("pays a part fortnight pro rata to the cent, on the actual pay date, with super after it", () => {
    const r = calculate(base());
    const ev = r.days.flatMap((d) => d.events).filter((e) => e.origin === "new");
    // Starts Monday 4 January: 11 of 14 days in the fortnight ending Thursday 14 January.
    expect(ev.find((e) => e.date === "2027-01-14")!.cents).toBe(141_429);
    expect(ev.find((e) => e.category === "super" && e.date === "2027-01-21")!.cents).toBe(16_971);
    expect(ev.filter((e) => e.category === "wages").map((e) => e.date)).toEqual(["2027-01-14", "2027-01-28", "2027-02-11", "2027-02-25"]);
    expect(ev.filter((e) => e.category === "onCosts").map((e) => e.date)).toEqual(["2027-01-15", "2027-02-15"]);
  });

  it("moves its cash events with the hire date, never creates a fee, and updates the capacity check", () => {
    const i = { ...base(), capacity: null };
    const now = calculate(i);
    const later = calculate(i, mergeScenario([{ hireStarts: [{ id: "new", start: "2027-02-01" }] }]));
    const fees = (r: ReturnType<typeof calculate>) =>
      r.days
        .flatMap((d) => d.events)
        .filter((e) => e.category === "fee")
        .map((e) => [e.date, e.cents]);
    expect(fees(later)).toEqual(fees(now));
    expect(
      later.days
        .flatMap((d) => d.events)
        .filter((e) => e.origin === "new" && e.category === "wages")
        .map((e) => e.date),
    ).toEqual(["2027-02-11", "2027-02-25"]);
    expect(later.low.cents).toBeGreaterThan(now.low.cents);
    // A committed hire's date isn't moved by a scenario.
    const committed = calculate({ ...i, hires: [coordinator({ committed: true })] }, mergeScenario([{ hireStarts: [{ id: "new", start: "2027-02-01" }] }]));
    expect(committed.refused.join(" ")).toMatch(/committed/);
  });

  it("delays only uncertain receipts, and stages only discretionary spending", () => {
    const i = {
      ...base(),
      events: [ev("desk", "setup", "2026-12-14", 700, { discretionary: true }), ev("ad", "setup", "2026-12-03", 2_000, { status: "committed" })],
    };
    const r = calculate(
      i,
      mergeScenario([
        {
          delays: [{ id: "fee-2026-12", days: 14 }],
          stage: [
            { id: "desk", date: "2027-03-01" },
            { id: "ad", date: "2027-03-01" },
          ],
        },
      ]),
    );
    expect(r.days.flatMap((d) => d.events).find((e) => e.id === "fee-2026-12")).toMatchObject({ date: "2027-02-12", moved: "2027-01-29" });
    expect(r.outside.map((e) => e.id)).toContain("desk");
    expect(r.refused.join(" ")).toMatch(/ad is committed/);
  });
});

describe("reading saved inputs", () => {
  it("drops fields the model doesn't know, and keeps blanks as blanks", () => {
    const i = cleanInputs({ ...blankInputs("2026-12-01"), lifetimeValue: 9_999, openingCash: "", publicFunding: 10 });
    expect(i).not.toHaveProperty("lifetimeValue");
    expect(i).not.toHaveProperty("publicFunding");
    expect(i.openingCash).toBeNull();
    expect(cleanInputs(blankInputs("2026-12-01"))).toEqual(blankInputs("2026-12-01"));
  });

  it("says what changed since last time", () => {
    const a = fixture();
    const b = fixture("2026-12-08");
    const lines = planChanges(a, calculate(a, BASELINE), b, calculate(b, BASELINE));
    expect(lines.join("\n")).toMatch(/Lowest cash: \$2,000 on Tue 8 Dec → \$5,000 on Tue 15 Dec/);
    expect(lines.join("\n")).toMatch(/Opening cash needed: \$12,000 → \$9,000/);
  });
});
