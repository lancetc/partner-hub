import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  changeSummary,
  checkExplanation,
  computeLedger,
  fixturesPass,
  freshSandbox,
  planProblems,
  planWarnings,
  sandboxForReaders,
  unsupportedAmounts,
  type PlanLine,
  type SandboxBlockData,
} from "@/lib/sandbox";
import { SANDBOX_CASES } from "@/content/sandboxCases";
import { coachIssues, coachSandbox, finishSandbox, reviseSandbox, sandboxState, saveSandbox, submitPlan } from "./sandbox";

/* Budget Sandbox: a whole-cent ledger from a dated ruleset, unknown rates kept unknown, and a plan explained to the person from its own figures. */

let db: Db;
let jordan: User, riley: User;
const now = new Date("2026-11-20T00:00:00Z");
const SIGNED = { owner: "Owner", operations: "Operations", finance: "Finance", quality: "Quality", accessibility: "Accessibility", approvedOn: "2026-11-20" };
const margaret = (signed = true): SandboxBlockData => {
  const d = structuredClone(SANDBOX_CASES[0].data);
  if (signed) d.approval = { ...SIGNED };
  return d;
};
const line = (serviceId: string, perWeek: number, unitsEach = 1, goalId = "safe"): PlanLine => ({ serviceId, perWeek, unitsEach, goalId, review: false });
const doc = (data: SandboxBlockData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Plan",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Plan", blocks: [{ id: "sb", type: "sandbox", ...data }] }],
    },
  ],
});
const blocking = (data: SandboxBlockData) => publishChecks(doc(data) as never, "confirm").blocking.join(" | ");
function course(data = margaret()) {
  const c = createGuide(db, jordan, { title: "Budget", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("the ruleset and the ledger", () => {
  it("passes the reviewed fixtures", () => expect(fixturesPass()).toBe(true));

  it("shows Classification 4 at $7,617.13 with its 10% care management identified", () => {
    const l = computeLedger(margaret(), []);
    expect(l).toMatchObject({ quarterlyCents: 761713, careManagementCents: 76171, availableCents: 685542, weeks: 13, days: 92 });
  });

  it("accepts $10,000 only as a labelled fictional budget, and refuses a classification it hasn't got", () => {
    const fict = margaret();
    fict.funding = { ...fict.funding, variant: "fictional", fictionalQuarterlyCents: 1_000_000 };
    expect(computeLedger(fict, []).quarterlyCents).toBe(1_000_000);
    expect(blocking(fict)).toBe("");
    const wrong = margaret();
    wrong.funding.classification = "3";
    expect(blocking(wrong)).toMatch(/Classification 3 isn’t in/);
  });

  it("splits a $100 Independence line at a fictional 20% into $20 and $80, and charges nothing for Clinical Supports", () => {
    const d = margaret();
    d.services.push({ ...d.services[2], id: "hundred", unitPriceCents: 10000, unitsEach: 1 });
    const l = computeLedger(d, [line("hundred", 1 / 13, 1, "group"), line("personal-care", 1)]);
    expect(l.lines[0]).toMatchObject({ fullPriceCents: 10000, participantCents: 2000, governmentCents: 8000 });
    expect(l.lines[1]).toMatchObject({ category: "clinical", participantCents: 0, governmentCents: 117000 });
  });

  it("follows the dated personal-care change: Independence before 1 October 2026, Clinical Supports after", () => {
    const july = margaret();
    july.quarter = { start: "2026-07-01", end: "2026-09-30" };
    expect(blocking(july)).toMatch(/in this quarter Personal care: help to shower is Independence, not Clinical Supports/);
    july.services[0].category = "independence";
    expect(blocking(july)).toBe("");
    expect(computeLedger(july, [line("personal-care", 1)]).lines[0]).toMatchObject({ category: "independence", participantCents: 23400 });
  });

  it("never turns a missing rate into a dollar amount, and shows what's left as a range", () => {
    const d = margaret();
    d.rates.everyday = null;
    const l = computeLedger(d, [line("cleaning", 1, 2, "house"), line("personal-care", 1)]);
    expect(l.lines[0]).toMatchObject({ participantCents: undefined, governmentCents: undefined, rateBp: null });
    expect(l.unknownCents).toBe(187200);
    expect(l.remaining).toEqual({ low: 685542 - 117000 - 187200, high: 685542 - 117000 });
    expect(l.carryoverOutCents).toBeNull();
    expect(
      planWarnings(d, [line("cleaning", 1, 2, "house")], computeLedger(d, [line("cleaning", 1, 2, "house")])).some((w) => /rate to confirm/.test(w.text)),
    ).toBe(true);
    // A question about contributions can't be published with a rate missing.
    expect(blocking(d)).toMatch(/Everyday Living has no assessed rate/);
  });

  it("caps carryover at the higher of $1,000 or 10%, and never carries an overspend", () => {
    const d = margaret();
    expect(computeLedger(d, []).carryoverCapCents).toBe(100000);
    expect(computeLedger(d, [line("personal-care", 1)])).toMatchObject({ carryoverOutCents: 100000, forfeitCents: 685542 - 117000 - 100000 });
    const five = margaret();
    five.funding.classification = "5";
    expect(computeLedger(five, []).carryoverCapCents).toBe(101824);
    const over = computeLedger(d, [line("personal-care", 7, 2)]);
    expect(over.remaining.high).toBeLessThan(0);
    expect(over.carryoverOutCents).toBe(0);
  });

  it("won't model interim, transitioned or no-worse-off funding with the ongoing rules", () => {
    const d = margaret() as unknown as Record<string, unknown>;
    (d.funding as Record<string, unknown>).variant = "transitioned";
    expect(publishChecks(doc(d as never) as never, "confirm").blocking.join(" ")).toMatch(/transitioned funding has its own rules/);
  });

  it("updates every figure when a frequency changes, and says what changed in one sentence", () => {
    const d = margaret();
    const a = computeLedger(d, [line("social-group", 1, 1, "group")]);
    const b = computeLedger(d, [line("social-group", 2, 1, "group")]);
    expect(b.grossCents - a.grossCents).toBe(104000);
    expect(b.participantCents - a.participantCents).toBe(20800);
    expect(changeSummary(d, a, b, "social-group")).toBe(
      "Social support group: this change adds $1,040.00 a quarter in full price, $208.00 estimated contribution and $832.00 government-funded share.",
    );
  });

  it("lets the reviewed illustrative plan fit Margaret's funding and what she said she can afford", () => {
    const d = margaret();
    const l = computeLedger(d, d.illustrative.lines);
    expect(l.remaining.high).toBe(6262);
    expect(l.participantCents).toBe(84520);
    // A fortnightly service over 13 weeks is 7 whole visits, never 6.5.
    expect(l.lines.find((x) => x.serviceId === "nursing")!.units).toBe(7);
    expect(planWarnings(d, d.illustrative.lines, l).filter((w) => w.tone !== "note")).toEqual([]);
  });
});

describe("the plan and the explanation", () => {
  it("needs every service tied to a goal, the costs looked at, and a review action for anything outside the care plan", () => {
    const d = margaret();
    const s = { lines: [line("respite", 1, 3, "group")], inspected: false, explanation: "", stage: 0 as const, revisions: 0 };
    expect(planProblems(d, s).join(" ")).toMatch(/Mark any service outside the approved care plan for review.*Open the costs/);
    expect(planProblems(d, { ...s, lines: [{ ...s.lines[0], review: true }], inspected: true })).toEqual([]);
    expect(planWarnings(d, [line("social-group", 0, 1, "group")], computeLedger(d, [])).some((w) => w.id === "priority-group")).toBe(true);
  });

  it("flags a dollar figure that isn't in the plan's ledger, but accepts the weekly and quarterly ones", () => {
    const d = margaret();
    const l = computeLedger(d, d.illustrative.lines);
    expect(unsupportedAmounts("Your cleaning is $28.80 a week and $403.20 a quarter.", l)).toEqual([]);
    expect(unsupportedAmounts("It's about $65 a week.", l)).toEqual([]);
    expect(unsupportedAmounts("You'll pay $250 for cleaning.", l)).toEqual(["$250"]);
    const check = checkExplanation(d, "Personal care is Clinical Supports, so there's no contribution. Use it or lose it!", l);
    expect(check.avoided.map((a) => a.phrase)).toEqual(["use it or lose it"]);
    expect(check.covered.find((c) => c.id === "clinical")!.met).toBe(true);
  });

  it("keeps the coach to the ledger's figures and the scenario's facts", () => {
    const l = computeLedger(margaret(), margaret().illustrative.lines);
    const ids = new Set(["totals", "rate-everyday"]);
    expect(coachIssues({ points: [{ kind: "suggestion", text: "Say her cleaning is $403.20 a quarter.", facts: ["totals"] }] }, ids, l)).toEqual([]);
    expect(coachIssues({ points: [{ kind: "suggestion", text: "Tell her it costs $888 a quarter.", facts: ["totals"] }] }, ids, l).join(" ")).toMatch(
      /isn’t a figure/,
    );
    expect(
      coachIssues({ points: [{ kind: "suggestion", text: "Part-pensioners pay 20% for this kind of help.", facts: ["totals"] }] }, ids, l).join(" "),
    ).toMatch(/pension/);
    expect(coachIssues({ points: [{ kind: "strength", text: "A clear and kind explanation.", facts: ["made-up"] }] }, ids, l).join(" ")).toMatch(/cite facts/);
  });
});

describe("a learner's attempt", () => {
  it("runs from plan to debrief, recomputing the ledger on the server, and keeps the reviewed plan back until the end", async () => {
    const c = course();
    const sent = JSON.stringify(readGuide(db, riley, c.slug).doc);
    expect(sent).toContain("Personal care: help to shower");
    expect(sent).not.toContain("her son offered to help");
    expect(sent).not.toContain("use it or lose it");
    const plan = [line("personal-care", 3), line("social-group", 1, 1, "group"), line("transport", 2, 1, "group"), line("cleaning", 1, 2, "house")];
    expect(() => submitPlan(db, riley, c.id, { blockId: "sb", state: { lines: plan, inspected: false } }, now)).toThrow(/Open the costs/);
    const submitted = submitPlan(db, riley, c.id, { blockId: "sb", state: { lines: plan, inspected: true } }, now);
    expect(submitted.state.stage).toBe(1);
    expect(submitted.ledger.governmentCents).toBe(351000 + 83200 + 93600 + 112320);
    expect(submitted.debrief).toBeNull();
    // Once submitted, the plan is settled: a save can only change the explanation.
    const saved = saveSandbox(db, riley, c.id, { blockId: "sb", state: { lines: [line("personal-care", 7)], explanation: "Draft words." } }, now);
    expect(saved.state.lines).toHaveLength(4);
    expect(saved.state.explanation).toBe("Draft words.");
    // No model connected: the coach falls back to the plan's rules and still works.
    const coach = await coachSandbox(
      db,
      riley,
      c.id,
      { blockId: "sb", explanation: "Your cleaning costs you $250 every week, Margaret, and the rest is covered." },
      now,
    );
    expect(coach.source).toBe("rules");
    expect(coach.points.map((p) => p.text).join(" ")).toMatch(/\$250 isn’t in the plan’s ledger/);
    const done = finishSandbox(
      db,
      riley,
      c.id,
      {
        blockId: "sb",
        explanation:
          "Your personal care is Clinical Supports, so there's no contribution for it. Cleaning is Everyday Living at your assessed rate of 40%, so it's about $57.60 a week. You only pay for services as they're delivered, and if it stops fitting we can review the plan.",
      },
      now,
    );
    expect(done.debrief!.check.covered.every((x) => x.met)).toBe(true);
    expect(done.debrief!.dims.find((x) => x.id === "communication")!.rating).toBe("Strong");
    expect(done.debrief!.why).toMatch(/her son offered/);
    expect(done.debrief!.statement).toMatch(/PRACTICE STATEMENT for Margaret/);
    // Revising starts a new attempt from the same plan; the finished one is kept.
    const again = reviseSandbox(db, riley, c.id, { blockId: "sb" }, now);
    expect(again.state).toMatchObject({ stage: 0, revisions: 1 });
    expect(again.state.lines).toHaveLength(4);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sandbox_attempts WHERE status = 'finished'").get()).toEqual({ n: 1 });
    expect(sandboxState(db, riley, c.id, "sb").attemptId).toBe(again.attemptId);
  });

  it("can't be published without sign-off, even with Publish anyway", () => {
    const g = createGuide(db, jordan, { title: "Unsigned", completion: "confirm", doc: doc(margaret(false)) as never }, now);
    expect(() => publishGuide(db, jordan, g.id, "", now, { allowUnverified: true })).toThrow(/Budget Sandbox needs its sign-off/);
  });

  it("gives two sandboxes in one course ids of their own, and strips the answers for readers", () => {
    const a = freshSandbox(margaret(), "aaaaa");
    expect(a.services[0].id).toBe("personal-care-baaaaa");
    expect(a.illustrative.lines[0]).toMatchObject({ serviceId: "personal-care-baaaaa", goalId: "safe-baaaaa" });
    expect(sandboxForReaders(margaret())).toMatchObject({ illustrative: { lines: [], why: "" }, explain: { checklist: [], avoid: [] }, debrief: "" });
  });
});
