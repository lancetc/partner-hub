import { describe, expect, it } from "vitest";
import {
  blankInputs,
  blankLeads,
  calculate,
  cleanInputs,
  cleanOccurrence,
  comparisonCard,
  inputChanges,
  money,
  resultChanges,
  validateInputs,
  type CostItem,
  type Occurrence,
  type RecoveryTask,
  type ReliabilityInputs,
} from "./serviceReliability";
import { RELIABILITY_CASE } from "@/content/reliabilityCases";

/*
  The Service Reliability model against the PRD's calculation fixtures (section 15), with exact figures, and the rules
  that keep care, workload and money apart.
*/

const occ = (id: string, over: Partial<Occurrence> = {}): Occurrence => ({
  ...cleanOccurrence({ id, date: "2026-10-06", service: "domestic", window: "morning", outcome: "delivered", source: "fictional" }, 0),
  ...over,
});
const task = (id: string, occurrence: string, minutes: number, over: Partial<RecoveryTask> = {}): RecoveryTask => ({
  id,
  label: id,
  category: "conversation",
  causes: ["missedService"],
  occurrence,
  issue: "",
  reason: "",
  week: null,
  count: 1,
  minutes,
  ...over,
});
const premium = (id: string, occurrence: string, amount = 25): CostItem => ({
  id,
  label: "Weekend replacement premium",
  kind: "premium",
  amount,
  bears: "yes",
  occurrence,
  issue: "",
  reason: "",
  source: "verified",
});

/**
  Fixture 2's four weeks: 100 eligible scheduled visits; five verified supplier misses (four in one recurring Tuesday
  issue), two participant-requested cancellations and one provider booking error. Fixture 3's work and costs: each of
  the four Tuesday failures took 1.5 unique coordinator hours; two documented $25 premiums.
*/
function fixture(): ReliabilityInputs {
  const i = blankInputs("2026-11-03");
  i.period = { start: "2026-10-05", weeks: 4, asOf: "2026-11-03" };
  i.rows = [];
  i.tasks = [];
  i.hourly = 40;
  i.windowDays = 2;
  i.issues = [{ id: "tue", label: "Tuesday morning cleaning", note: "" }];
  const missed = (id: string, date: string, over: Partial<Occurrence> = {}) =>
    occ(id, { date, outcome: "missed", reason: "supplier", verified: true, issue: "tue", restored: "", ...over });
  const special = [
    missed("S1", "2026-10-06", { restored: "2026-10-07" }),
    missed("S2", "2026-10-13", { restored: "2026-10-17" }),
    missed("S3", "2026-10-20", { restored: "2026-10-21" }),
    missed("S4", "2026-10-27", { booked: "2026-10-29" }),
    missed("S5", "2026-10-30", { issue: "", service: "personalCare", restored: "2026-10-30" }),
    occ("P1", { date: "2026-10-08", outcome: "missed", reason: "participant", verified: true }),
    occ("P2", { date: "2026-10-22", outcome: "missed", reason: "participant", verified: true }),
    occ("B1", { date: "2026-10-15", outcome: "missed", reason: "booking", verified: true, restored: "2026-10-15" }),
  ];
  const routine = Array.from({ length: 100 - special.length }, (_, k) => occ(`D${k + 1}`, { date: "2026-10-12" }));
  i.occurrences = [...special, ...routine];
  for (const s of ["S1", "S2", "S3", "S4"]) i.tasks.push(task(`${s}-a`, s, 60), task(`${s}-b`, s, 30, { category: "change" }));
  i.costs = [premium("c1", "S2"), premium("c2", "S3")];
  return i;
}

describe("PRD fixtures (section 15)", () => {
  it("2. the supplier failure rate is 5/100 = 5%, with other categories visible but not in the numerator", () => {
    const r = calculate(fixture());
    expect(validateInputs(fixture())).toEqual([]);
    expect(r.scheduled).toBe(100);
    expect(r.supplierRate.text).toBe("5/100 = 5%");
    expect(r.supplierRate.value).toBe(0.05);
    expect(r.missedBy).toMatchObject({ supplier: 5, participant: 2, booking: 1 });
    expect(r.reasonRates.participant.text).toBe("2/100 = 2%");
    expect(r.reasonRates.booking.text).toBe("1/100 = 1%");
    expect(r.findings.join(" ")).toMatch(/1 provider booking or handoff error; 2 participant’s own cancellation or no-show/);
  });

  it("3. four failures at 1.5 unique hours each: 6 hours and $240, then $290 with the two premiums the partner bears; no fee loss assumed", () => {
    const r = calculate(fixture());
    expect(r.effort.hours).toBe(6);
    expect(r.cost.labour).toBe(240);
    expect(r.cost.borne.premium).toBe(50);
    expect(r.cost.observedDirect).toBe(290);
    expect(money(r.cost.observedDirect)).toBe("$290");
    expect(r.cost.fee).toEqual([]);
    expect(r.cost.trail).toBe("6 h × $40 = $240 recovery labour + $50 replacement premiums = $290");
    // If the partner doesn't bear the premiums, they're shown apart, not added.
    const i = fixture();
    i.costs.forEach((c) => (c.bears = "no"));
    const r2 = calculate(i);
    expect(r2.cost.observedDirect).toBe(240);
    expect(r2.cost.notBorne).toHaveLength(2);
  });

  it("4. preventing three of the four: 4.5 modelled hours and $217.50 modelled avoided cost, labelled a forecast", () => {
    const i = fixture();
    i.interventions = [
      {
        id: "backup",
        label: "Tuesday backup",
        kind: "backup",
        reason: "supplier",
        issue: "tue",
        affected: null,
        reduction: 0.75,
        oneOff: 0,
        recurring: 0,
        hours: 0,
        starts: "",
        owner: "",
        evidence: "",
        active: true,
      },
    ];
    const x = calculate(i).interventions[0];
    expect(x.affected).toBe(4);
    expect(x.prevented).toBe(3);
    expect(x.perHours).toBe(1.5);
    expect(x.perCost).toBe(72.5);
    expect(x.hoursReleased).toBe(4.5);
    expect(x.avoided).toBe(217.5);
    expect(money(x.avoided!)).toBe("$217.50");
    expect(x.forecast).toBe(true);
    expect(x.trail.join(" ")).toMatch(/modelled/);
    // Only the affected subset moves: the observed figures don't change.
    expect(calculate(i).cost.observedDirect).toBe(290);
    // Freed hours as onboarding capacity instead: the labour part isn't also counted as money.
    i.freedHours = "onboarding";
    i.leads = {
      ...blankLeads(),
      active: true,
      label: "GP push",
      effortHours: 10,
      cost: 200,
      enquiries: 6,
      starts: 2,
      firstStartWeeks: 8,
      onboardingPerStart: 4,
    };
    i.onboardingHours = 2;
    const r = calculate(i);
    expect(r.interventions[0].avoided).toBe(37.5);
    expect(r.interventions[0].hoursReleased).toBe(4.5);
    expect(r.leads!.onboardingSpare).toBe(6.5);
  });

  it("5. a service restored at day 4 and one unresolved at day 7 have separate statuses; the open one isn't a zero-day recovery", () => {
    const i = fixture();
    const r = calculate(i);
    const s2 = r.recovery.cases.find((c) => c.id === "S2")!;
    const s4 = r.recovery.cases.find((c) => c.id === "S4")!;
    expect(s2).toMatchObject({ status: "restored", days: 4, within: false });
    expect(s4).toMatchObject({ status: "booked", days: 7, within: false });
    // The median is of restored cases only; the open case keeps its age beside it and stays in the denominator.
    expect(r.recovery.exact.sort()).toEqual([0, 0, 1, 1, 4]);
    expect(r.recovery.median).toBe(1);
    expect(r.recovery.eligible).toBe(6);
    expect(r.recovery.withinWindow.text).toBe("4/6 = 67%");
    expect(r.recovery.openBeyondWindow).toBe(1);
  });

  it("6. a replacement booked but not delivered doesn't clear the visit; a participant’s own cancellation isn't a supplier no-show", () => {
    const r = calculate(fixture());
    expect(r.recovery.booked).toBe(1);
    expect(r.recovery.cases.find((c) => c.id === "S4")!.status).not.toBe("restored");
    expect(r.recovery.cases.map((c) => c.id)).not.toContain("P1");
    expect(r.supplierVerified).toBe(5);
    const i = fixture();
    const p1 = i.occurrences.find((o) => o.id === "P1")!;
    p1.reason = "supplier";
    p1.verified = false;
    // Reported as supplier but unverified: shown, still not in the numerator.
    expect(calculate(i).supplierRate.text).toBe("5/100 = 5%");
    expect(calculate(i).supplierUnverified).toBe(1);
  });

  it("7. one visit with two calls and a billing correction is one visit; the three tasks sum once; a rework tag adds nothing", () => {
    const i = fixture();
    i.tasks = [
      task("call1", "S1", 20),
      task("call2", "S1", 15),
      task("bill", "S1", 25, { category: "supplier", causes: ["missedService", "invoiceCorrection"] }),
    ];
    const r = calculate(i);
    expect(r.effort.visitsWithTasks).toBe(1);
    expect(r.effort.tasks).toBe(3);
    expect(r.effort.hours).toBe(1);
    expect(r.effort.byCause.missedService).toBe(1);
    expect(r.effort.byCause.invoiceCorrection).toBeCloseTo(0.42, 2);
    expect(r.effort.partitionOk).toBe(true);
    expect(r.effort.byCategory.conversation + r.effort.byCategory.supplier).toBe(1);
  });

  it("8. a $200 action and a $200 referral push: no verdict, and no lifetime client value can be added", () => {
    const i = fixture();
    i.interventions = [
      {
        id: "backup",
        label: "Tuesday backup",
        kind: "backup",
        reason: "supplier",
        issue: "tue",
        affected: null,
        reduction: 0.75,
        oneOff: 200,
        recurring: 0,
        hours: 0,
        starts: "",
        owner: "",
        evidence: "",
        active: true,
      },
    ];
    i.leads = {
      ...blankLeads(),
      active: true,
      label: "GP push",
      effortHours: 10,
      cost: 200,
      enquiries: 6,
      starts: 2,
      firstStartWeeks: 8,
      onboardingPerStart: 4,
    };
    i.onboardingHours = 2;
    const r = calculate(i);
    expect(r).not.toHaveProperty("verdict");
    const card = comparisonCard(i, r);
    const all = [...card.now, ...card.reliability, ...card.leads, ...card.confirm].join(" ");
    expect(all).not.toMatch(/better|best|winner|lifetime/i);
    expect(card.reliability[0]).toMatch(/forecast/);
    expect(card.leads.join(" ")).toMatch(/still open/);
    expect(card.now.join(" ")).toMatch(/booked but hasn’t happened/);
    // Anything outside the model is dropped when inputs are read.
    const sent = { ...i, lifetimeValue: 3000, churnRisk: 0.4 };
    expect(cleanInputs(JSON.parse(JSON.stringify(sent)))).not.toHaveProperty("lifetimeValue");
    expect(calculate(cleanInputs(JSON.parse(JSON.stringify(sent)))).cost.observedDirect).toBe(290);
  });
});

describe("blank, unknown and zero", () => {
  it("a blank is an error; unknown is kept out and named; zero is zero", () => {
    const i = fixture();
    i.hourly = null;
    expect(validateInputs(i).map((e) => e.field)).toContain("hourly");
    i.hourly = "unknown";
    expect(validateInputs(i)).toEqual([]);
    const r = calculate(i);
    expect(r.cost.labour).toBeNull();
    expect(r.cost.trail).toMatch(/not assessed/);
    expect(comparisonCard(i, r).confirm.join(" ")).toMatch(/hourly cost of recovery work: not assessed/);
    i.hourly = 0;
    expect(calculate(i).cost.labour).toBe(0);
    i.tasks[0].minutes = "unknown";
    expect(calculate(i).effort.unmeasured).toBe(1);
    i.tasks[0].minutes = null;
    expect(validateInputs(i).some((e) => e.field === "task.S1-a.minutes")).toBe(true);
  });

  it("a fee effect needs a verified record, and is never added to the direct cost", () => {
    const i = fixture();
    i.costs.push({ id: "fee", label: "Fee effect", kind: "fee", amount: 80, bears: "yes", occurrence: "", issue: "", reason: "", source: "estimate" });
    expect(validateInputs(i).map((e) => e.field)).toContain("cost.fee.source");
    i.costs.at(-1)!.source = "verified";
    expect(calculate(i).cost.observedDirect).toBe(290);
    expect(calculate(i).cost.fee).toHaveLength(1);
  });

  it("aggregate counts give the same figures, and must account for every miss that needs recovery", () => {
    const i = blankInputs("2026-11-03");
    i.period.start = "2026-10-05";
    i.hourly = 40;
    i.rows = [i.rows[0]];
    const row = i.rows[0];
    Object.assign(row, { delivered: 92, late: 0, replaced: 0, unknown: 0, unverified: 0, booked: 1, unresolved: 0, essentialOpen: 0, repeatIssues: 1 });
    row.missed = { supplier: 5, booking: 1, participant: 2, pause: 0, health: 0, access: 0, unknown: 0 };
    row.restored = { d0: 3, d1_2: 1, d3_7: 0, d8: 0 };
    i.tasks = i.tasks.map((t) => ({ ...t, count: 4, minutes: t.id === "t1" ? 60 : t.id === "t2" ? 30 : 0 }));
    expect(
      validateInputs(i)
        .map((e) => e.message)
        .join(" "),
    ).toMatch(/restored, booked and unresolved add to 5/);
    row.restored.d3_7 = 1;
    expect(validateInputs(i)).toEqual([]);
    const r = calculate(i);
    expect(r.supplierRate.text).toBe("5/100 = 5%");
    expect(r.effort.hours).toBe(6);
    expect(r.cost.observedDirect).toBe(240);
    expect(r.recovery.withinWindow.text).toBe("4/6 = 67%");
    // Bands never make an exact median.
    expect(r.recovery.median).toBeNull();
  });

  it("says what changed, in words", () => {
    const a = fixture();
    const b = structuredClone(a);
    b.hourly = 45;
    expect(inputChanges(a, b)).toEqual(["Loaded hourly cost: 40 → 45."]);
    expect(resultChanges(calculate(a), calculate(b))).toEqual(["Observed direct extra cost: $290 → $320."]);
  });
});

describe("the fictional case", () => {
  it("validates, and shows Mrs Patel’s day-4 restoration beside her day-7 open visit", () => {
    expect(validateInputs(RELIABILITY_CASE.inputs)).toEqual([]);
    const r = calculate(RELIABILITY_CASE.inputs);
    expect(r.scheduled).toBe(100);
    expect(r.supplierRate.text).toBe("5/100 = 5%");
    const patel = r.recovery.cases.filter((c) => c.who === "Mrs Patel");
    expect(patel.map((c) => [c.status, c.days])).toEqual([
      ["restored", 4],
      ["booked", 7],
    ]);
    expect(r.recovery.openBeyondWindow).toBe(2);
    expect(r.repeat.issues.find((g) => g.id === "tuesday-clean")!.visits).toBe(4);
  });
});
