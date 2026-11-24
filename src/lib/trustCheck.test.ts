import { describe, expect, it } from "vitest";
import { MRS_PATEL_TRUST } from "@/content/trustCases";
import { charactersInBlock } from "./characters";
import {
  applyMove,
  budgetSignal,
  buildDebrief,
  caseProblems,
  complaintWording,
  CRITICAL,
  discouragesComplaint,
  emptyState,
  evidenceCovers,
  MAX_SCORE,
  MoveError,
  phaseOf,
  playPath,
  restrictedTopics,
  triageFromSignals,
  trustForReaders,
  trustSignOffProblems,
  trustUsable,
  trustView,
  type Plan,
  type Signal,
  type TrustData,
  type TrustState,
} from "./trustCheck";

/*
  The 28-Day Trust Check engine (docs/trust-check.md), against the PRD's acceptance criteria (section 19): a signal
  never becomes a "will leave" verdict; the person's own preference governs who is told what; choosing to move is
  supported, not scored as a failure; discouraging a complaint is critical; "did it help?" needs evidence; AT–HM stays
  separate; a known pause or a claim lag isn't a problem; and the case holds together.
*/

const d = MRS_PATEL_TRUST;
const path = (id: string) => d.paths.find((p) => p.id === id)!;
const play = (id: string, patch: { answers?: Record<string, string[]>; plan?: Partial<Plan>; variation?: string } = {}) => {
  const p = path(id);
  return playPath(d, {
    ...p,
    variation: patch.variation ?? p.variation,
    answers: { ...p.answers, ...patch.answers },
    plan: { ...p.plan, ...patch.plan },
  });
};
const codes = (id: string, patch: Parameters<typeof play>[1] = {}) => play(id, patch).debrief.codes;

describe("the case", () => {
  it("passes its own check, and every authored path ends where it says, with at least two defensible endings (criteria 7 and 10)", () => {
    expect(caseProblems(d)).toEqual([]);
    for (const p of d.paths) {
      const r = playPath(d, p);
      expect(r.problems, p.id).toEqual([]);
      expect(r.debrief.ending, p.id).toBe(p.expect);
    }
    expect(new Set(d.paths.map((p) => p.expect))).toEqual(new Set(["stays", "transfer", "context", "escalated", "unsafe"]));
  });

  it("names only library characters (Mrs Patel and Asha), so publishing queues no portrait", () => {
    const names = charactersInBlock({ type: "trustcheck", ...d }).map((c) => c.name);
    expect(names).toEqual(["Mrs Patel", "Asha"]);
  });

  it("can’t be published as it ships: placeholders, and nobody has signed off", () => {
    const problems = trustSignOffProblems(d, "2026-11-24");
    expect(problems.some((p) => /placeholder/i.test(p) || /Replace it/.test(p))).toBe(true);
    expect(problems.some((p) => /record the owner/.test(p))).toBe(true);
  });

  it("catches a case that breaks its own rules: a churn score on a signal card, or a path that doesn’t end where it says", () => {
    const scored = structuredClone(d);
    scored.signals[0].noticed = "Churn score: 82% chance she leaves.";
    expect(caseProblems(scored).join(" ")).toMatch(/churn score or probability/);
    const wrong = structuredClone(d);
    wrong.paths[0].expect = "transfer";
    expect(caseProblems(wrong).join(" ")).toMatch(/ends as/);
  });

  it("holds an expired rule set: it can’t publish, and an assessed attempt can’t start (criterion 14, rule expiry)", () => {
    const late = "2027-06-01";
    expect(trustSignOffProblems(d, late).join(" ")).toMatch(/rule set is due for review/);
    expect(trustUsable({ ...d, mode: "assessed" }, late).ok).toBe(false);
    expect(trustUsable(d, late).ok).toBe(true);
    expect(trustUsable(d, "2026-11-24").ok).toBe(true);
  });
});

describe("a signal is not a prediction (criteria 1 and 8)", () => {
  const blank = (x: Partial<Signal>): Signal => ({ ...d.signals[0], visits: [], budget: null, kind: "", reliability: "verified", ...x });

  it("never turns any single signal into a verdict about leaving: no score, no probability, no ‘will leave’", () => {
    for (const s of d.signals) {
      const r = triageFromSignals([s]);
      expect(["immediate", "recovery", "review", "context"]).toContain(r.level);
      expect(Object.keys(r).sort()).toEqual(["level", "why"]);
      expect(JSON.stringify(r)).not.toMatch(/leave|churn|probab|%/i);
    }
  });

  it("reads a budget balance alone as no more than a review with the person, and a known pause or claim lag as context", () => {
    const money = d.signals.find((s) => s.id === "s-budget")!.budget!;
    expect(triageFromSignals([blank({ budget: money })]).level).toBe("review");
    expect(triageFromSignals([blank({ budget: { ...money, pausedCents: 30_000 } })]).level).toBe("context");
    const pause = d.signals.filter((s) => s.only.includes("pause") || (!s.notIn.includes("pause") && !s.only.length && s.phase === "notice" && !s.hidden));
    expect(triageFromSignals(pause).level).toBe("context");
  });

  it("raises missed visits only for reasons that need recovery (the Service Reliability Calculator’s), and safety straight to escalation", () => {
    const visit = (reason: "supplier" | "pause" | "participant" | "health") => blank({ visits: [{ date: "2026-11-10", outcome: "missed", reason, note: "" }] });
    expect(triageFromSignals([visit("supplier")]).level).toBe("recovery");
    for (const r of ["pause", "participant", "health"] as const) expect(triageFromSignals([visit(r)]).level).toBe("context");
    expect(triageFromSignals([visit("pause"), blank({ kind: "safety" })]).level).toBe("immediate");
  });

  it("keeps delivered, claimed, pending and scheduled apart: the 41% shrinks to a $300 projection once the lag and scheduled services are counted", () => {
    const money = d.signals.find((s) => s.id === "s-claims")!.budget!;
    const b = budgetSignal(money, d.ruleSetId);
    expect(b.remainingShare).toBe(41);
    expect(b.projectedClosingCents).toBe(30_000);
    expect(b.serviceGapCents).toBe(30_000);
    expect(b.carryover?.cents).toBe(100_000);
    expect(b.aboveCarryoverCents).toBe(0);
    expect(Object.keys(b).join(" ")).not.toMatch(/churn|probab|likely|risk|score/i);
  });

  it("scores treating a known pause as a problem down, and recording the context up (criterion 8)", () => {
    const good = play("pause");
    expect(good.debrief).toMatchObject({ ending: "context", score: MAX_SCORE });
    const worried = play("pause", { answers: { retriage: ["rt-recovery"] } });
    expect(worried.debrief.codes).toContain("pauseAsRisk");
    expect(worried.debrief.dims.find((x) => x.dim === "signal")?.level).toBe(1);
  });

  it("doesn’t punish a revised assumption: the provisional triage is kept, and only the revision is scored (criterion 2)", () => {
    const wrongFirst = play("strong", { answers: { triage: ["t-context"] } });
    expect(wrongFirst.debrief.score).toBe(MAX_SCORE);
    expect(wrongFirst.debrief.revised).toMatchObject({ from: expect.stringMatching(/Context/), to: expect.stringMatching(/Service recovery/) });
    expect(wrongFirst.debrief.choices.find((c) => c.step === "triage")?.revised).toBe(true);
  });

  it("needs an alternative explanation before a triage (criterion 1)", () => {
    let s = emptyState();
    for (const id of ["s-cleans", "s-budget", "s-invoice"]) s = applyMove(d, s, { do: "open", signal: id });
    s = applyMove(d, s, { do: "answer", step: "facts", options: ["f-missed"] });
    s = applyMove(d, s, { do: "answer", step: "alternatives", options: ["a-leaving"] });
    s = applyMove(d, s, { do: "answer", step: "artefact", options: ["r-none"] });
    expect(() => applyMove(d, s, { do: "answer", step: "triage", options: ["t-recovery"] })).toThrow(/alternative explanation/);
  });
});

describe("her voice and permissions (criterion 4)", () => {
  it("flags telling Asha her budget against Mrs Patel’s recorded preference, and lets an appointment update stand", () => {
    expect(restrictedTopics(d.sharing, ["appointments"])).toEqual([]);
    expect(restrictedTopics(d.sharing, ["appointments", "budget"]).map((r) => r.id)).toEqual(["budget"]);
    const told = play("strong", { plan: { share: ["appointments", "budget"] } }).debrief;
    expect(told.ending).toBe("unsafe");
    expect(told.critical.map((c) => c.code)).toEqual(["restrictedDisclosure"]);
    expect(told.plan?.shared).toEqual([
      { label: expect.stringMatching(/Appointment/), allowed: true },
      { label: expect.stringMatching(/Budget/), allowed: false },
    ]);
    expect(play("strong").debrief.critical).toEqual([]);
  });

  it("keeps the person first: going to Asha first is coded, and she answers guardedly until she’s been heard", () => {
    expect(codes("strong", { answers: { "first-contact": ["c-asha"] } })).toContain("familyFirst");
    const unheard = play("strong", { answers: { opening: ["o-leave"] } }).debrief.conversation;
    expect(unheard.find((l) => l.who === "her" && /Someone who turns up before ten/.test(l.text))).toBeUndefined();
    expect(unheard.some((l) => /Just someone who turns up/.test(l.text))).toBe(true);
  });

  it("sends the sharing topics without saying which are allowed: that’s on her preferences card", () => {
    const view = trustView(d, play("strong").state);
    expect(view.plan?.sharing.map((t) => t.id)).toEqual(["appointments", "budget", "health"]);
    expect(JSON.stringify(view.plan?.sharing)).not.toMatch(/allowed/);
  });
});

describe("choice, complaints and funding (criteria 3, 6, 7)", () => {
  it("gives a genuine fix and a supported move the same strong feedback; pressure to stay is critical (criterion 7)", () => {
    const stays = play("strong").debrief;
    const moves = play("moves").debrief;
    expect([stays.ending, moves.ending]).toEqual(["stays", "transfer"]);
    expect(moves.score).toBe(stays.score);
    expect(moves.defensible).toBe(true);
    for (const pick of ["m-voucher", "m-asha", "m-delay"]) {
      const p = play("moves", { answers: { "day28-move": [pick] } }).debrief;
      expect(p.ending, pick).toBe("unsafe");
      expect(p.critical.map((c) => c.code)).toContain("retentionPressure");
    }
    expect(codes("moves", { answers: { "day28-move": ["m-fail"] } })).toContain("transferAsFailure");
  });

  it("makes discouraging a complaint critical: a choice, or the plan’s own words read by the Tough Family Call’s rules", () => {
    expect(complaintWording().length).toBeGreaterThan(5);
    for (const pick of ["cp-noneed", "cp-wait", "cp-retention"])
      expect(codes("strong", { answers: { complaint: [pick] } }), pick).toContain("complaintDiscouraged");
    expect(discouragesComplaint("Honestly there’s no point complaining, we’ll fix it.")).toMatchObject({ hedged: false });
    expect(discouragesComplaint("I’d never say there’s no point complaining.")).toMatchObject({ hedged: true });
    expect(discouragesComplaint("If you’d like to make a complaint, I’ll help you lodge it.")).toBeNull();
    const said = play("strong", { plan: { say: "You don’t need to make a complaint, I’ll sort it." } }).debrief;
    expect(said.critical.map((c) => c.code)).toEqual(["complaintDiscouraged"]);
    expect(said.plan?.complaint?.quote).toMatch(/complaint/);
  });

  it("corrects a shower chair from the ongoing budget, citing AT–HM, and offers the assessment route (criterion 3)", () => {
    const r = play("strong", { plan: { actions: ["pa-booking", "pa-billing", "pa-chair"] } }).debrief;
    const c = r.critical.find((x) => x.code === "atHmFromOngoing")!;
    expect(c.correction).toMatch(/AT–HM assessment/);
    expect(c.source.url).toMatch(/assistive-technology-and-home-modifications/);
  });

  it("treats a contractor who can’t do Tuesdays as a choice for her, never a promise (criterion 6)", () => {
    expect(codes("strong", { answers: { tuesdays: ["tu-sorted"] } })).toContain("unverifiedPromise");
    expect(play("strong", { answers: { tuesdays: ["tu-thursday"] } }).debrief.dims.find((x) => x.dim === "voice")?.level).toBe(1);
  });

  it("escalates a newly revealed safety concern now; holding it for Day 28 is critical", () => {
    expect(play("safety").debrief.ending).toBe("escalated");
    expect(codes("safety", { answers: { safety: ["sf-later"] } })).toContain("delayedSafety");
    expect(codes("safety", { answers: { safety: ["sf-chair"] } })).toEqual(expect.arrayContaining(["atHmFromOngoing", "bypassedReview"]));
  });
});

describe("the plan and the follow-up (criteria 5 and 14)", () => {
  it("won’t propose a plan without a concern, an action, an owner, an update, a contingency and a check; ‘call her’ alone isn’t a fix", () => {
    const at = playPath(d, { ...path("strong"), plan: { ...path("strong").plan, contingency: "" } });
    expect(at.problems.join(" ")).toMatch(/first fix fails/);
    expect(codes("strong", { plan: { actions: ["pa-call"], owner: "coordinator" } })).toContain("callOnly");
    expect(codes("strong", { plan: { owner: "family" } })).toContain("noOwner");
  });

  it("needs evidence to say it worked: a booking and a reminder aren’t delivery, and never reach the resolved ending", () => {
    const booked = d.signals.filter((s) => ["c7-booked", "c7-sent"].includes(s.id));
    expect(evidenceCovers(booked, ["delivery", "person"])).toBe(false);
    const r = play("strong", { answers: { "day7-evidence": ["c7-booked", "c7-sent"], "day28-evidence": ["c28-person"] } }).debrief;
    expect(r.codes).toContain("noEvidence");
    expect(r.ending).toBe("unverified");
    expect(r.defensible).toBe(false);
    expect(codes("strong", { answers: { day7: ["s7-closed"] } })).toContain("noEvidence");
    // A Day 7 claim without evidence is coded even when Day 28 is then verified properly: the ending stands, the outcome dimension doesn’t.
    const late = play("strong", { answers: { "day7-evidence": ["c7-booked", "c7-sent"] } }).debrief;
    expect(late.ending).toBe("stays");
    expect(late.codes).toContain("noEvidence");
    expect(late.dims.find((x) => x.dim === "outcome")?.level).toBe(1);
  });

  it("puts every critical flag above the total: a high score with one critical error is still the critical ending", () => {
    const r = play("strong", { answers: { complaint: ["cp-wait"] } }).debrief;
    expect(r.score).toBeGreaterThan(15);
    expect(r.ending).toBe("unsafe");
    expect(play("shortcut").debrief.critical.length).toBeGreaterThan(3);
    for (const c of play("shortcut").debrief.critical) expect(CRITICAL).toContain(c.code);
  });
});

describe("moves, order and the readers’ copy", () => {
  const open = (s: TrustState, ids: string[]) => ids.reduce((x, id) => applyMove(d, x, { do: "open", signal: id }), s);

  it("is idempotent: the same answer again changes nothing, a different one is refused", () => {
    let s = open(emptyState(), ["s-cleans", "s-budget", "s-invoice"]);
    s = applyMove(d, s, { do: "answer", step: "facts", options: ["f-missed", "f-line"] });
    expect(applyMove(d, s, { do: "answer", step: "facts", options: ["f-line", "f-missed"] })).toBe(s);
    expect(() => applyMove(d, s, { do: "answer", step: "facts", options: ["f-leave"] })).toThrow(MoveError);
    expect(applyMove(d, s, { do: "open", signal: "s-cleans" })).toBe(s);
  });

  it("asks for signal cards to be opened first, and keeps the order: Notice, Ask, then the plan", () => {
    expect(() => applyMove(d, emptyState(), { do: "answer", step: "facts", options: ["f-missed"] })).toThrow(/Open at least 3/);
    const s = open(emptyState(), ["s-cleans", "s-budget", "s-invoice"]);
    expect(() => applyMove(d, s, { do: "plan", plan: path("strong").plan })).toThrow(/hear her/);
    expect(phaseOf(d, s)).toBe("notice");
  });

  it("releases a requested record only once it’s requested, and checkpoint records only at Check", () => {
    const s = open(emptyState(), ["s-cleans", "s-budget", "s-invoice"]);
    const ids = trustView(d, s).signals.map((x) => x.id);
    expect(ids).not.toContain("s-claims");
    expect(ids.some((x) => x.startsWith("c7"))).toBe(false);
  });

  it("sends learners the frame only, and the view carries no feedback, levels, codes or endings", () => {
    const r = trustForReaders(d);
    expect([r.signals, r.steps, r.paths, r.variations, r.sharing]).toEqual([[], [], [], [], []]);
    const v = JSON.stringify(trustView(d, play("strong").state));
    expect(v).not.toMatch(/"feedback"|"levels"|"codes"|"ending"|"key"/);
  });

  it("debriefs with versions, sources and the case’s own budget view", () => {
    const r = buildDebrief(d, play("strong").state);
    expect(r.versions).toMatchObject({ scenario: d.scenarioVersion, rules: d.ruleSetId });
    expect(r.budget?.carryover?.cents).toBe(100_000);
    expect(r.signals.level).toBe("recovery");
  });

  it("parses back to the same case it was saved as", async () => {
    const { parseTrust } = await import("./trustCheck");
    const parsed = parseTrust(JSON.parse(JSON.stringify(d)) as Record<string, unknown>, "test", {
      str: (v) => (typeof v === "string" ? v : undefined),
      unfinished: () => undefined,
    });
    expect(parsed).toEqual(d as TrustData);
  });
});
