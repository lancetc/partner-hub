import { describe, expect, it } from "vitest";
import { atHmFunding, carryoverOf, carryoverThreshold, caseFigureProblems, project, sessionCost, sessionProblems, type Case } from "./quarterBudget";
import { QUARTER_RULES, ruleStatus, type QuarterRuleSet } from "./quarterEndRules";
import { buildDebrief, caseOf, caseProblems, defensibleEndings, projectionFor, strongState, type BudgetLabData } from "./budgetLab";
import { DOT_QUARTER_END } from "@/content/budgetLabCases";
import { RULESETS } from "./sandbox";

/*
  The Quarterly Budget Decision Lab's calculation and rubric: the PRD's acceptance criteria 3 to 10 with exact figures
  (docs/budget-decision-lab.md). Money is in cents throughout.
*/

const rules = QUARTER_RULES[0];
const dot = (): BudgetLabData => structuredClone(DOT_QUARTER_END);
const dotCase = (): Case => caseOf(dot());

describe("the worked example: Dot at quarter end (criterion 3)", () => {
  it("shows $2,400 current, $900 booked, $1,500 projected, a $1,000 threshold and $500 above it", () => {
    const p = project(dotCase());
    expect(p.actualAvailableCents).toBe(240_000);
    expect(p.bookedEstimateCents).toBe(90_000);
    expect(p.scheduledEstimatedCents).toBe(90_000);
    expect(p.projectedBalanceCents).toBe(150_000);
    expect(p.threshold.cents).toBe(100_000);
    expect(p.threshold.percentOfBudgetCents).toBe(80_000);
    expect(p.projectedCarryoverCents).toBe(100_000);
    expect(p.projectedAboveThresholdCents).toBe(50_000);
    // Dot's estimated contributions on the bookings are hers, not a draw on the balance.
    expect(p.contribution).toMatchObject({ knownCents: 42_000, complete: true });
    expect(p.fullPriceCents).toBe(132_000);
    expect(p.days).toEqual({ quarter: 92, left: 27 });
  });

  it("never marks a booked service spent or claimed, and a booking never changes the current balance", () => {
    const p = project(dotCase());
    expect(p.lines.every((l) => l.status === "booked")).toBe(true);
    expect(p.lines.some((l) => /spent|claimed/i.test(l.status))).toBe(false);
    expect(p.checks.find((c) => c.code === "BOOKED_NOT_CLAIMED")?.result).toBe("pass");
    const more = project(dotCase(), { proposed: [{ serviceId: "physio", date: "2026-12-15" }] });
    expect(more.actualAvailableCents).toBe(240_000);
    expect(more.proposedEstimateCents).toBe(15_000);
    expect(more.projectedBalanceCents).toBe(135_000);
    expect(more.projectedAboveThresholdCents).toBe(35_000);
  });

  it("takes its prices and rates from the Budget Sandbox, and personal care's category from the Sandbox ruleset", () => {
    const c = dotCase();
    const clean = c.services.find((s) => s.id === "cleaning")!;
    expect(sessionCost(c, clean, "2026-12-09")).toMatchObject({ fullCents: 14_400, contributionCents: 5_760, governmentCents: 8_640, rateBp: 4000 });
    const pc = { ...clean, id: "pc", kind: "personal-care", category: "independence" as const };
    expect(sessionCost(c, pc, "2026-09-30").category).toBe("independence");
    expect(sessionCost(c, pc, "2026-10-01")).toMatchObject({ category: "clinical", contributionCents: 0 });
  });
});

describe("the carryover threshold (criterion 4)", () => {
  it("is $1,000 for an $8,000 budget and $1,200 for a $12,000 one, from the Sandbox ruleset's figures", () => {
    expect(RULESETS[0].carryover).toEqual({ minimumCapCents: 100_000, percentCap: 10 });
    expect(carryoverThreshold(800_000, rules).cents).toBe(100_000);
    expect(carryoverThreshold(1_200_000, rules).cents).toBe(120_000);
    expect(carryoverThreshold(1_000_000, rules).cents).toBe(100_000);
    expect(carryoverThreshold(1_000_100, rules).cents).toBe(100_010);
  });

  it("is limited to the amount actually unspent, on both sides of the threshold", () => {
    expect(carryoverOf(99_999, 100_000)).toEqual({ carryoverCents: 99_999, aboveCents: 0, overspendCents: 0 });
    expect(carryoverOf(100_000, 100_000)).toEqual({ carryoverCents: 100_000, aboveCents: 0, overspendCents: 0 });
    expect(carryoverOf(100_001, 100_000)).toEqual({ carryoverCents: 100_000, aboveCents: 1, overspendCents: 0 });
    expect(carryoverOf(150_000, 120_000)).toEqual({ carryoverCents: 120_000, aboveCents: 30_000, overspendCents: 0 });
  });

  it("carries nothing over from a zero or negative projected balance, and flags an overspend for an operational response", () => {
    expect(carryoverOf(0, 100_000)).toEqual({ carryoverCents: 0, aboveCents: 0, overspendCents: 0 });
    expect(carryoverOf(-2_500, 100_000)).toEqual({ carryoverCents: 0, aboveCents: 0, overspendCents: 2_500 });
    const c = dotCase();
    c.figures.currentBalanceCents = 89_000;
    const p = project(c);
    expect(p.projectedBalanceCents).toBe(-1_000);
    expect(p.projectedCarryoverCents).toBe(0);
    const over = p.checks.find((x) => x.code === "OVERSPEND")!;
    expect(over.severity).toBe("critical");
    expect(over.text).toMatch(/isn’t rolled into the next quarter/);
  });
});

describe("care management and the accounting basis (criterion 5)", () => {
  it("must be stated, and a double deduction fails validation", () => {
    const blank = dotCase();
    blank.figures.basis = "";
    expect(caseFigureProblems(blank).join(" ")).toMatch(/already accounts for the care-management allocation/);
    const twice = dotCase();
    twice.figures.careManagementDeductedCents = 80_000;
    expect(caseFigureProblems(twice).join(" ")).toMatch(/Double deduction/);
    const tooMuch = dotCase();
    tooMuch.figures.basis = "gross-before-cm";
    tooMuch.figures.careManagementDeductedCents = 80_001;
    expect(caseFigureProblems(tooMuch).join(" ")).toMatch(/Double deduction/);
    expect(caseFigureProblems(dotCase())).toEqual([]);
  });

  it("deducts care management once when the displayed balance still holds some", () => {
    const c = dotCase();
    c.figures.basis = "gross-before-cm";
    c.figures.currentBalanceCents = 260_000;
    c.figures.careManagementDeductedCents = 20_000;
    expect(caseFigureProblems(c)).toEqual([]);
    expect(project(c).actualAvailableCents).toBe(240_000);
    expect(project(c).projectedBalanceCents).toBe(150_000);
  });
});

describe("separate funding (criterion 6)", () => {
  it("never adds an AT–HM purchase to ongoing service spend", () => {
    const c = dotCase();
    expect(sessionProblems(c, { serviceId: "platform-step", date: "2026-12-15" })).toEqual(["ATHM_NOT_ONGOING"]);
    const p = project(c, { proposed: [{ serviceId: "platform-step", date: "2026-12-15" }] });
    expect(p.lines.some((l) => l.serviceId === "platform-step")).toBe(false);
    expect(p.projectedBalanceCents).toBe(150_000);
    expect(atHmFunding(38_900, c.figures.pools)).toEqual({ draws: [], gapCents: 38_900, fromOngoingCents: 0 });
  });

  it("funds an AT–HM item for a transitioned participant from unspent HCP funds first, never sharing the ongoing rollover", () => {
    const pools = { atHmCents: 50_000, hcpUnspentCents: 20_000, shortTermCents: null };
    expect(atHmFunding(38_900, pools)).toEqual({
      draws: [
        { pool: "hcp-unspent", cents: 20_000 },
        { pool: "at-hm-allocation", cents: 18_900 },
      ],
      gapCents: 0,
      fromOngoingCents: 0,
    });
    // The pools never touch the ongoing projection or its carryover.
    const c = dotCase();
    c.figures.pools = pools;
    const p = project(c);
    expect([p.projectedBalanceCents, p.projectedCarryoverCents, p.projectedAboveThresholdCents]).toEqual([150_000, 100_000, 50_000]);
    // v1 refuses a case that includes HCP funds rather than giving them the ongoing rule.
    expect(caseFigureProblems(c).join(" ")).toMatch(/Unspent HCP funds have their own rules/);
  });
});

describe("contributions (criterion 7)", () => {
  it("shows an estimate only with a rate, a price and an effective rule; otherwise it needs checking", () => {
    const c = dotCase();
    c.rates.everyday = null;
    const garden = c.services.find((s) => s.id === "garden")!;
    expect(sessionCost(c, garden, "2026-12-14")).toMatchObject({ contributionCents: null, known: false, governmentCents: 10_200 });
    const p = project(c);
    expect(p.contribution.complete).toBe(false);
    expect(p.contribution.unknown).toEqual(["Garden maintenance: heavy work", "Domestic assistance: cleaning with Lena"]);
    expect(p.checks.find((x) => x.code === "CONTRIBUTION_UNKNOWN")?.text).toMatch(/needs checking/);
    expect(sessionCost(dotCase(), { ...garden, unitPriceCents: 0 }, "2026-12-14").known).toBe(false);
    // Before the rule set takes effect there's no reviewed rule: no estimate.
    expect(sessionCost(dotCase(), garden, "2026-06-30").known).toBe(false);
    // The editor won't publish a case whose displayed booked estimate needs a missing rate.
    expect(caseFigureProblems(c).join(" ")).toMatch(/has no assessed rate/);
  });
});

describe("blocked and unresolved sessions (criterion 8)", () => {
  it("blocks impossible dates and unavailable suppliers, and marks unapproved or unagreed changes unresolved", () => {
    const c = dotCase();
    expect(sessionProblems(c, { serviceId: "physio", date: "2027-01-06" })).toEqual(["IMPOSSIBLE_DATE"]);
    expect(sessionProblems(c, { serviceId: "physio", date: "2026-12-04" })).toEqual(["IMPOSSIBLE_DATE"]);
    expect(sessionProblems(c, { serviceId: "physio", date: "2026-12-16" })).toEqual(["UNAVAILABLE"]);
    expect(sessionProblems(c, { serviceId: "respite", date: "2026-12-12" })).toEqual(["UNAPPROVED", "NOT_AGREED"]);
    expect(sessionProblems(c, { serviceId: "extra-clean", date: "2026-12-11" })).toEqual(["NOT_AGREED"]);
    const p = project(c, {
      proposed: [
        { serviceId: "physio", date: "2026-12-16" },
        { serviceId: "extra-clean", date: "2026-12-11" },
        { serviceId: "respite", date: "2026-12-12", review: true },
      ],
    });
    expect(p.lines.filter((l) => l.status !== "booked").map((l) => [l.serviceId, l.status])).toEqual([
      ["extra-clean", "unresolved"],
      ["respite", "review"],
    ]);
    // Neither counts in the projection.
    expect(p.projectedBalanceCents).toBe(150_000);
  });

  it("lets a learner finish a defensible no-additional-service ending", () => {
    const d = dot();
    const db = buildDebrief(d, strongState(d, [], "physio-full"));
    expect(db.ending).toBe("unchanged");
    expect(db.flags).toEqual([]);
    expect(db.score).toBe(15);
    expect(db.plan.projectedAboveThresholdCents).toBe(50_000);
  });
});

describe("feedback and scoring (criteria 9 and 10)", () => {
  it("gives two defensible plans with different projections both full feedback and no flag", () => {
    const d = dot();
    const ends = defensibleEndings(d);
    expect(ends.map((e) => [e.label, e.ending, e.projected, e.score, e.flags])).toEqual([
      ["what she asked for", "added", 135_000, 15, []],
      ["what she asked for, and what she agreed to", "added", 128_880, 15, []],
      ["The physio’s books are full", "unchanged", 150_000, 15, []],
      ["A supplier cancels", "added", 141_120, 15, []],
    ]);
    expect(caseProblems(d)).toEqual([]);
  });

  it("never passes reducing the closing balance alone: unwanted spending scores lower with flags", () => {
    const d = dot();
    d.assessment = { mode: "assessed", passMark: 11 };
    const spend = strongState(d, [
      { serviceId: "physio", date: "2026-12-15" },
      { serviceId: "physio", date: "2026-12-22" },
      { serviceId: "garden", date: "2026-12-14" },
      { serviceId: "extra-clean", date: "2026-12-11" },
      { serviceId: "extra-clean", date: "2026-12-18" },
    ]);
    spend.conversation = "spend-it";
    spend.explanation = "lose-it";
    const db = buildDebrief(d, spend);
    expect(db.plan.projectedBalanceCents).toBeLessThan(projectionFor(d, strongState(d, [{ serviceId: "physio", date: "2026-12-15" }])).projectedBalanceCents);
    expect(db.flags.map((f) => f.id)).toEqual(expect.arrayContaining(["overrodeChoice", "thresholdAsTarget"]));
    expect(db.unsafe).toBe(true);
    expect(db.passed).toBe(false);
    const good = buildDebrief(d, strongState(d, [{ serviceId: "physio", date: "2026-12-15" }]));
    expect(good.passed).toBe(true);
  });

  it("lets a critical error stand above any score in assessed mode", () => {
    const d = dot();
    d.assessment = { mode: "assessed", passMark: 1 };
    for (const [k, v, flag] of [
      ["equipment", "ongoing", "atHmFromOngoing"],
      ["nextStep", "claim", "claimUndelivered"],
      ["explanation", "covered", "concealContribution"],
    ] as const) {
      const s = { ...strongState(d, [{ serviceId: "physio", date: "2026-12-15" }]), [k]: v };
      const db = buildDebrief(d, s);
      expect(db.flags.find((f) => f.id === flag)?.critical, flag).toBe(true);
      expect(db.passed, flag).toBe(false);
    }
    const unapproved = buildDebrief(d, strongState(d, [{ serviceId: "respite", date: "2026-12-12" }]));
    expect(unapproved.flags.map((f) => f.id)).toContain("unapprovedAsApproved");
    expect(unapproved.dims.find((x) => x.dim === "route")?.rating).toBe(0);
    // As a review request it isn't an error.
    const reviewed = buildDebrief(
      d,
      strongState(d, [
        { serviceId: "physio", date: "2026-12-15" },
        { serviceId: "respite", date: "2026-12-12", review: true },
      ]),
    );
    expect(reviewed.flags.map((f) => f.id)).not.toContain("unapprovedAsApproved");
    // Formative mode never passes or fails anyone.
    expect(buildDebrief(dot(), strongState(dot(), [])).passed).toBeNull();
  });

  it("checks the learner's reason for figures not in the projection and for phrases to avoid", () => {
    const d = dot();
    const s = {
      ...strongState(d, [{ serviceId: "physio", date: "2026-12-15" }]),
      reason: "About $1,350 is projected and $1,000 carries. Use it or lose it, $777.",
    };
    const db = buildDebrief(d, s);
    expect(db.reason.unsupported).toEqual(["$777"]);
    expect(db.reason.avoided.map((a) => a.phrase)).toEqual(["use it or lose it"]);
    expect(db.dims.find((x) => x.dim === "explain")?.rating).toBe(1);
  });

  it("puts the scenario, rule set, rubric and model versions on every debrief", () => {
    const db = buildDebrief(dot(), strongState(dot(), []));
    expect(db.versions).toEqual({
      lab: "budget-lab-1",
      scenario: "dot-quarter-end-1",
      rubric: "budget-rubric-1",
      model: "quarter-budget-1",
      ruleSet: "sah-quarter-end-2026-11",
    });
  });
});

describe("rule status (criterion 14)", () => {
  it("marks blocks Review required when a rule set changes or passes its review date, and withdrawn when withdrawn", () => {
    expect(ruleStatus(rules.id, "2026-11-24")).toBe("current");
    expect(ruleStatus(rules.id, "2027-06-01")).toBe("review-required");
    const changed: QuarterRuleSet[] = [{ ...rules, status: "review-required", statusNote: "Source updated" }];
    expect(ruleStatus(rules.id, "2026-11-24", changed)).toBe("review-required");
    expect(ruleStatus(rules.id, "2026-11-24", [{ ...rules, status: "withdrawn" }])).toBe("withdrawn");
    expect(ruleStatus("nope", "2026-11-24")).toBe("withdrawn");
  });
});
