import { describe, expect, it } from "vitest";
import { calculate, type CoverageInputs, type SupplyState } from "./suburbCoverage";
import {
  applyMove,
  benchView,
  buildDebrief,
  canAdvance,
  caseProblems,
  checklistOf,
  emptyState,
  inputsAt,
  metricView,
  MoveError,
  networkForReaders,
  outreachDraft,
  outreachProblems,
  readySupply,
  scorecardView,
  stageOf,
  totals,
  type BenchState,
  type Diagnosis,
  type Move,
  type NetworkData,
} from "./networkBench";
import { NORTH_BRISBANE_BENCH as D } from "@/content/networkCases";

/*
  Build Your Local Bench, the pure model (docs/network-builder.md), against the PRD's acceptance criteria: the 12-hour
  gap; interest, daytime hours and another service never counted as capacity; stages that can't be skipped; stale
  availability that reverts without touching approval; one worker counted once; different role profiles; outreach
  that can't carry identity, rates or guarantees; a scorecard with no single score and small numbers suppressed; and
  critical flags no total can cancel.
*/

const RIGHT: Diagnosis = { measure: "slots", planned: 18, booked: 6, unfilled: 12, ready: 0, counted: [] };
const BRIEF = {
  profile: "pc-sole-trader",
  fields: {
    area: "Paperbark Rise, North Brisbane",
    window: "early morning (7–9 am), Monday to Saturday",
    business: "We’re a small Care Partner business working locally.",
    need: "Personal-care support early in the morning.",
  },
};
const play = (moves: Move[], s: BenchState = emptyState()) => moves.reduce((x, m) => applyMove(D, x, m), s);
const strong = (variation = ""): BenchState =>
  play(
    [
      { do: "open", card: "w-c" },
      { do: "diagnose", diagnosis: RIGHT },
      { do: "answer", step: "protect", option: "honest-interim" },
      { do: "answer", step: "chosen", option: "assess" },
      { do: "answer", step: "screen", option: "lead" },
      { do: "outreach", outreach: BRIEF },
      { do: "copy" },
      { do: "reveal" },
      { do: "answer", step: "revisit", option: "phased" },
      { do: "answer", step: "review", option: "pathway" },
    ],
    emptyState(variation),
  );
const row = (i: CoverageInputs, id: string) => i.supply.find((r) => r.id === id)!;

describe("the case (criterion 1)", () => {
  it("holds together", () => expect(caseProblems(D)).toEqual([]));

  it("has 18 planned and 6 booked early-morning hours: 12 unfilled, and nobody ready for them", () => {
    const r = calculate(D.inputs);
    expect(totals(r)).toMatchObject({ planned: 18, booked: 6, unfilled: 12, ready: 0, gap: 12 });
    expect(readySupply(r)).toEqual([]);
    const why = Object.fromEntries(r.cells[0].supply.map((x) => [x.id, x.kind]));
    // Daytime-only, a candidate's word, a participant's choice still to assess, and a gardener: none is capacity.
    expect(why).toEqual({ "w-a": "time", "w-b": "time", "w-c": "pipeline", "w-p": "pipeline", "w-g": "scope" });
  });

  it("shows the map and the list the same gap (criterion 5)", () => {
    const r = calculate(D.inputs);
    const byArea = r.areas.reduce((t, a) => t + a.gapHours, 0);
    expect(byArea).toBe(totals(r).gap);
    // "Five contractors nearby": five distinct cards, four listed in each suburb.
    expect(D.inputs.supply.length).toBe(5);
    expect(r.areas.map((a) => a.listed)).toEqual([4, 4]);
  });

  it("after the reveal: four hours remain, and every branch plays", () => {
    expect(totals(calculate(inputsAt(D, { variation: "" }, true))).gap).toBe(4);
    const gaps = Object.fromEntries(D.variations.map((v) => [v.id, totals(calculate(inputsAt(D, { variation: v.id }, true))).gap]));
    expect(gaps).toEqual({ "chosen-approved": 4, "chosen-declined": 4, stale: 8, "no-supplier": 12, "quality-concern": 4 });
  });
});

describe("the pipeline: interest isn’t approval, approval isn’t availability", () => {
  const card = (over: Partial<Parameters<typeof canAdvance>[0]> = {}) => ({
    stage: "candidate" as const,
    hold: "" as const,
    evidence: {},
    scope: [],
    approvedUntil: "",
    availabilityVerifiedOn: "",
    ...over,
  });

  it("can’t skip a stage, and only the stage’s owner moves a card", () => {
    expect(canAdvance(card(), "interested", "partner", "2027-03-01", 14).ok).toBe(true);
    expect(canAdvance(card(), "evidence", "partner", "2027-03-01", 14)).toMatchObject({ ok: false, reason: expect.stringMatching(/can’t be skipped/) });
    expect(canAdvance(card(), "available", "scheduling", "2027-03-01", 14)).toMatchObject({ ok: false, reason: expect.stringMatching(/can’t be skipped/) });
    const resolved = D.cards.find((c) => c.id === "w-a")!;
    const inVerification = card({ stage: "verification", evidence: resolved.evidence, scope: ["personalCare"], approvedUntil: "2028-01-01" });
    expect(canAdvance(inVerification, "approved", "partner", "2027-03-01", 14)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Only the provider/),
    });
    expect(canAdvance(inVerification, "approved", "provider", "2027-03-01", 14).ok).toBe(true);
    expect(canAdvance({ ...inVerification, stage: "approved" }, "available", "partner", "2027-03-01", 14).ok).toBe(false);
    expect(canAdvance({ ...inVerification, stage: "approved", hold: "expired" }, "available", "scheduling", "2027-03-01", 14)).toMatchObject({ ok: false });
  });

  it("uses the Vetting Card’s rules: evidence still to come blocks verification, and an ABN and insurance never make anyone approved (criterion 7)", () => {
    const c = D.cards.find((x) => x.id === "w-c")!;
    expect(canAdvance(card({ stage: "evidence", evidence: c.evidence }), "verification", "partner", "2027-03-01", 14)).toMatchObject({ ok: false });
    const abnAndInsurance = {
      entity_identity: { state: "verified" as const, note: "", owner: "", barrier: false },
      insurance_status: { state: "verified" as const, note: "", owner: "", barrier: false },
    };
    expect(
      canAdvance(
        card({ stage: "verification", evidence: abnAndInsurance, scope: ["personalCare"], approvedUntil: "2028-01-01" }),
        "approved",
        "provider",
        "2027-03-01",
        14,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/never makes anyone approved/) });
  });

  it("never counts interest, evidence or verification as capacity, however good the availability looks (criterion 1)", () => {
    for (const state of ["candidate", "interested", "evidence", "verification"] as SupplyState[]) {
      const i = structuredClone(D.inputs);
      Object.assign(row(i, "w-c"), {
        state,
        slots: [{ id: "c1", days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: 7, to: 9, hours: 12, status: "confirmed", effectiveFrom: "" }],
        verifiedOn: "2027-02-28",
      });
      expect(totals(calculate(i)).gap).toBe(12);
    }
    const i = structuredClone(D.inputs);
    Object.assign(row(i, "w-c"), {
      state: "approved",
      slots: [{ id: "c1", days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: 7, to: 9, hours: 12, status: "confirmed", effectiveFrom: "" }],
      verifiedOn: "2027-02-28",
    });
    // Approved, confirmed and fresh: now it counts, but one person can't be in both suburbs at 7 am.
    expect(totals(calculate(i)).gap).toBe(4);
  });

  it("reverts stale availability to unconfirmed, without touching the approval (criterion 4)", () => {
    const a = row(D.inputs, "w-a");
    expect(stageOf(a, "2027-03-01", 14)).toMatchObject({ stage: "available", staleAvailability: false });
    expect(stageOf(a, "2027-04-01", 14)).toMatchObject({ stage: "approved", staleAvailability: true, hold: "" });
    expect(a.state).toBe("approved");
    const stale = calculate(inputsAt(D, { variation: "stale" }, true));
    expect(stale.cells[0].supply.find((x) => x.id === "w-c")?.kind).toBe("stale");
  });

  it("excludes an expired or restricted worker from ready supply (criterion 9)", () => {
    for (const state of ["expired", "restricted", "paused"] as SupplyState[]) {
      const i = structuredClone(inputsAt(D, { variation: "" }, true));
      row(i, "w-c").state = state;
      expect(readySupply(calculate(i))).not.toContain("w-c");
      expect(stageOf(row(i, "w-c"), i.asOf, 14).hold).toBe(state);
    }
  });

  it("counts one worker once: never in two suburbs at overlapping times (criterion 5)", () => {
    const i = structuredClone(D.inputs);
    Object.assign(row(i, "w-a"), {
      slots: [{ id: "a1", days: ["mon", "tue", "wed", "thu", "fri", "sat"], from: 7, to: 8, hours: 6, status: "confirmed", effectiveFrom: "" }],
    });
    const r = calculate(i);
    const counted = r.cells.flatMap((c) => c.supply.filter((x) => x.id === "w-a" && x.hours > 0).map((x) => x.hours));
    expect(counted.reduce((t, h) => t + h, 0)).toBeLessThanOrEqual(6);
    expect(r.cells[1].supply.find((x) => x.id === "w-a")?.kind).toBe("taken");
  });
});

describe("profiles and outreach (criteria 6 and 7)", () => {
  it("gives a gardener and a nurse different reviewed profiles", () => {
    const g = D.profiles.find((p) => p.id === "garden-business")!;
    const n = D.profiles.find((p) => p.id === "nurse-agency")!;
    const req = (p: typeof g, axis: string) => p.items.find((x) => x.axis === axis)?.requirement;
    expect(req(n, "service_credential")).toBe("required");
    expect(req(g, "service_credential")).toBe("conditional");
    expect(req(g, "screening_route")).toBe("owner");
    expect(checklistOf(n).rows.map((r) => r.label)).not.toEqual(checklistOf(g).rows.map((r) => r.label));
  });

  it("refuses participant details, contact details, rates, hours and guarantees", () => {
    const with_ = (need: string) => outreachProblems(D.outreach, { ...BRIEF, fields: { ...BRIEF.fields, need } }, D.profiles, D.people);
    expect(with_("Personal care before 9 am.")).toEqual([]);
    expect(with_("Participant 2 needs help showering.")).toEqual([expect.stringMatching(/participant’s details/)]);
    expect(with_("Help for Mrs Smith each morning.")).toEqual([expect.stringMatching(/participant’s details/)]);
    expect(with_("Call 0412 345 678 to talk.")).toEqual([expect.stringMatching(/contact or address/)]);
    expect(with_("Paid $45 per hour.")).toEqual([expect.stringMatching(/rate/)]);
    expect(with_("Guaranteed work from Monday.")).toEqual([expect.stringMatching(/promise/)]);
    expect(with_("12 hours a week of mornings.")).toEqual([expect.stringMatching(/weekly hours/)]);
  });

  it("keeps the locked claims in every draft, marked as a draft, and copying isn’t sending", () => {
    const d = outreachDraft(D.outreach, BRIEF, D.profiles);
    for (const l of D.outreach.locked) expect(d.intro).toContain(l.text);
    expect(d.watermark).toMatch(/Not sent/);
    expect(d.subject).toBe("Availability for early morning (7–9 am), Monday to Saturday support in Paperbark Rise, North Brisbane");
    const s = strong();
    expect(s.outreach?.copied).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/"sent"/);
  });
});

describe("the quality scorecard (criterion 8)", () => {
  const v = scorecardView(D.scorecard, "2027-04-19");

  it("has no single score: dimensions with denominators, periods and sources", () => {
    expect(JSON.stringify(v)).not.toMatch(/"(score|total|average|rating|stars)"/);
    for (const d of v.dims) for (const m of d.metrics) expect(m.period && m.source).toBeTruthy();
    expect(v.dims.find((d) => d.dim === "reliability")?.metrics[0]).toMatchObject({ numerator: 15, denominator: 16, rate: 94 });
  });

  it("suppresses a rate under five observations: limited evidence, not a poor rating", () => {
    const one = metricView(D.scorecard.metrics.find((m) => m.id === "exp-reports")!);
    expect(one).toMatchObject({ suppressed: true, rate: null });
    expect(one.text).toMatch(/Limited evidence/);
    expect(metricView({ ...one, numerator: 4, denominator: 4 }).rate).toBeNull();
    expect(metricView({ ...one, numerator: 5, denominator: 5 }).rate).toBe(100);
    expect(v.statuses).toEqual(["current", "limited"]);
  });

  it("shows a restriction only as its neutral reason; the Quality detail never leaves", () => {
    const q = D.variations.find((x) => x.id === "quality-concern")!.scorecard!;
    const r = scorecardView(q, "2027-04-19");
    expect(r.statuses).toContain("restricted");
    expect(r.restriction).toMatch(/Not matchable for new work/);
    expect(JSON.stringify(r)).not.toContain(q.qualityDetail);
  });
});

describe("an attempt", () => {
  it("enforces the order: diagnose before deciding, the brief before the reveal, the reveal before planning the rest", () => {
    expect(() => applyMove(D, emptyState(), { do: "diagnose", diagnosis: RIGHT })).toThrow(MoveError);
    const opened = applyMove(D, emptyState(), { do: "open", card: "w-a" });
    expect(() => applyMove(D, opened, { do: "answer", step: "protect", option: "honest-interim" })).toThrow(/Diagnose/);
    const diagnosed = applyMove(D, opened, { do: "diagnose", diagnosis: RIGHT });
    expect(() => applyMove(D, diagnosed, { do: "answer", step: "revisit", option: "phased" })).toThrow(/after the reveal/);
    expect(() => applyMove(D, diagnosed, { do: "reveal" })).toThrow();
  });

  it("keeps an answer once given: the same answer again changes nothing, a different one is refused", () => {
    const s = play([
      { do: "open", card: "w-a" },
      { do: "diagnose", diagnosis: RIGHT },
      { do: "answer", step: "protect", option: "honest-interim" },
    ]);
    expect(applyMove(D, s, { do: "answer", step: "protect", option: "honest-interim" })).toBe(s);
    expect(() => applyMove(D, s, { do: "answer", step: "protect", option: "monday-start" })).toThrow(/already decided/);
    expect(applyMove(D, s, { do: "open", card: "w-a" })).toBe(s);
  });

  it("holds back the model’s result until the learner’s own diagnosis, and every feedback line until the debrief", () => {
    const open = benchView(D, applyMove(D, emptyState(), { do: "open", card: "w-a" }));
    expect(open.before).toBeNull();
    expect(open.steps).toEqual([]);
    const later = benchView(
      D,
      play([
        { do: "open", card: "w-a" },
        { do: "diagnose", diagnosis: RIGHT },
      ]),
    );
    expect(later.before && totals(later.before).gap).toBe(12);
    expect(JSON.stringify(later)).not.toMatch(/"feedback"|"levels"|"codes"|"ending"/);
  });

  it("scores a strong path as a defensible ending", () => {
    const d = buildDebrief(D, strong());
    expect(d).toMatchObject({ score: 21, ending: "phased", valid: true, critical: [] });
    expect(d.after.gap).toBe(4);
  });

  it("never lets a total cancel a critical flag: promising Monday, or counting a candidate as ready", () => {
    const s = play([
      { do: "open", card: "w-c" },
      { do: "diagnose", diagnosis: { ...RIGHT, ready: 12, counted: ["w-c"] } },
      { do: "answer", step: "protect", option: "monday-start" },
      { do: "answer", step: "chosen", option: "assess" },
      { do: "answer", step: "screen", option: "lead" },
      { do: "outreach", outreach: BRIEF },
      { do: "reveal" },
      { do: "answer", step: "revisit", option: "phased" },
      { do: "answer", step: "review", option: "pathway" },
    ]);
    const d = buildDebrief({ ...D, mode: "assessed", passMark: 1 }, s);
    expect(d.critical.map((c) => c.code).sort()).toEqual(["promisedStart", "readyFromClaim", "unverifiedStart"]);
    expect(d).toMatchObject({ ending: "unsafe", valid: false, passed: false });
    expect(d.dims.find((x) => x.dim === "supply")?.level).toBe(0);
  });

  it("flags a gardener counted as cover, and a map filled green", () => {
    const s = strong();
    const g = buildDebrief(D, { ...s, diagnosis: { ...RIGHT, counted: ["w-g"] } });
    expect(g.codes).toContain("outOfScope");
    const green = buildDebrief(D, { ...s, answers: { ...s.answers, revisit: "sign-five" } });
    expect(green).toMatchObject({ ending: "green", valid: false });
  });

  it("offers the chosen-worker endings only on their branches", () => {
    const step = D.steps.find((x) => x.id === "revisit")!;
    const opts = (v: string) =>
      benchView(D, { ...strong(v), answers: { ...strong(v).answers } })
        .steps.find((x) => x.id === "revisit")!
        .options.map((o) => o.id);
    expect(step.options.length).toBe(6);
    expect(opts("")).not.toContain("chosen-confirmed");
    expect(opts("chosen-approved")).toContain("chosen-confirmed");
    expect(opts("chosen-declined")).toContain("explain-cannot");
  });
});

describe("authors", () => {
  it("gives readers the frame only", () => {
    const r = networkForReaders({ ...D, id: "x", type: "network" } as NetworkData & { id: string; type: "network" });
    expect([r.cards, r.steps, r.variations, r.profiles, r.inputs.supply, r.later.patches]).toEqual([[], [], [], [], [], []]);
    expect(r.scorecard.metrics).toEqual([]);
  });

  it("catches a case that contradicts itself", () => {
    const bad = structuredClone(D);
    bad.inputs.supply.find((r) => r.id === "w-c")!.state = "approved";
    bad.outreach.locked.push({ id: "x", text: "Guaranteed work for the right person." });
    const p = caseProblems(bad);
    expect(p.some((x) => /approved with a check still open/.test(x))).toBe(true);
    expect(p.some((x) => /promises work/.test(x))).toBe(true);
  });
});
