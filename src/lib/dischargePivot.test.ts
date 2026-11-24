import { describe, expect, it } from "vitest";
import { DOT_DISCHARGE } from "@/content/dischargeCases";
import {
  ACTION_STATUSES,
  applyMove,
  buildDebrief,
  CRITICAL,
  derive,
  deskView,
  dischargeForReaders,
  emptyState,
  MoveError,
  parseDischarge,
  pivotHardProblems,
  playPath,
  readyNow,
  scenarioProblems,
  sourceProblems,
  type Declaration,
  type DischargeData,
  type Path,
  type PivotState,
  type Stated,
} from "./dischargePivot";
import { charactersInBlock } from "./characters";

/*
  The 72-Hour Discharge Pivot's engine, against the PRD's acceptance criteria (section 15): a hidden first-service gap
  is never a safe handover however fast; no click confirms a service; the readiness panel reads gates, not cards;
  Fiona doesn't override Dot; AT–HM, TCP, Restorative Care and a review stay what they are; an escalated gap is a
  defensible ending; moves are idempotent; readers get no key.
*/

const d = DOT_DISCHARGE;
const TODAY = "2026-11-24";

/** Plays steps from the start: every field checked, then each action (or "wait"). */
function play(steps: string[], opts: { mode?: "timed" | "untimed"; variation?: string } = {}) {
  let s = applyMove(d, emptyState(opts.variation ?? ""), { do: "start", mode: opts.mode ?? "timed" });
  for (const f of d.facts) s = applyMove(d, s, { do: "inspect", fact: f.id });
  for (const st of steps) s = st === "wait" ? applyMove(d, s, { do: "wait", at: s.clock }) : applyMove(d, s, { do: "take", action: st });
  return s;
}
function finish(s: PivotState, declaration: Declaration, gates: Partial<Record<string, Stated>>, answers = { tell: "honest", firstcheck: "call" }) {
  let t = applyMove(d, s, { do: "handover" });
  t = applyMove(d, t, {
    do: "record",
    handover: { declaration, gates: Object.fromEntries(d.gates.map((g) => [g.id, { status: gates[g.id] ?? "confirmed", owner: g.owners[0] }])), answers },
  });
  return buildDebrief(d, t);
}
const path = (id: string) => d.paths.find((p) => p.id === id)!;

describe("the Dot case as authored", () => {
  it("passes its own scenario check, and every authored path ends where it says (three defensible endings and an unsafe shortcut)", () => {
    expect(scenarioProblems(d)).toEqual([]);
    const ends = d.paths.map((p) => [p.id, playPath(d, p).debrief.ending]);
    expect(ends).toEqual([
      ["prompt", "confirmed"],
      ["late", "contingency"],
      ["full", "escalated"],
      ["untimed", "confirmed"],
      ["shortcut", "unsafe"],
    ]);
    for (const p of d.paths.filter((x) => x.expect !== "unsafe")) {
      const r = playPath(d, p).debrief;
      expect(r.critical, p.id).toEqual([]);
      expect(r.score, p.id).toBeGreaterThanOrEqual(d.passMark);
    }
  });

  it("names only Dot and Fiona, who are already in the character library", () => {
    expect(charactersInBlock({ type: "discharge", ...d }).map((c) => c.name)).toEqual(["Dot", "Fiona"]);
  });

  it("can’t be published as it ships: placeholder sources and an empty sign-off", () => {
    const hard = pivotHardProblems(d, TODAY);
    expect(hard.some((p) => /placeholder Hub policy record/.test(p))).toBe(true);
    expect(hard.some((p) => /record the owner, clinical governance/.test(p))).toBe(true);
    expect(Object.values(d.approval).every((x) => x === "")).toBe(true);
  });

  it("reads back from stored JSON unchanged", () => {
    const parsed = parseDischarge(JSON.parse(JSON.stringify(d)), "Block", { str: (v) => (typeof v === "string" ? v : ""), unfinished: () => undefined });
    expect(parsed).toEqual(d);
  });
});

describe("a hidden first-service gap is never a safe handover (criterion 5)", () => {
  it("finished quickly, declaring ready, is a critical error with no pass, however few minutes it took", () => {
    const s = play(["ask-summary"]);
    expect(s.clock).toBe(15);
    const r = finish(s, "ready", {});
    expect(r.ending).toBe("unsafe");
    expect(r.critical.map((c) => c.code)).toContain("hiddenGap");
    expect(r.defensible).toBe(false);
    expect(r.dims.find((x) => x.dim === "continuity")!.level).toBe(0);
    expect(buildDebrief({ ...d, mode: "assessed" }, applyMove(d, applyMove(d, s, { do: "handover" }), { do: "record", handover: {} })).passed).toBe(false);
  });

  it("doing every good card but stating the uncovered visit as confirmed is still the critical error", () => {
    const s = play(path("prompt").steps, { variation: "outreach-full" });
    const r = finish(s, "ready", {});
    expect(r.critical.map((c) => c.code)).toContain("hiddenGap");
    expect(r.ending).toBe("unsafe");
    // Saying where it really stands, with the gap escalated, is defensible.
    expect(finish(s, "incomplete", { "first-care": "unresolved" }).ending).toBe("escalated");
  });

  it("“marking the visit arranged” changes nothing in the record, and is the critical error until it really is confirmed", () => {
    const s = play(["request-nurse", "mark-arranged"]);
    const x = derive(d, s);
    expect(x.facts.first.status).toBe("requested");
    expect(x.codes.map((c) => c.code)).toEqual(["hiddenGap", "requestAsConfirmed"]);
    // Once the outreach nurse is confirmed in writing, recording it is just recording it.
    const later = play([...path("prompt").steps, "wait", "mark-arranged"]);
    expect(derive(d, later).codes).toEqual([]);
  });

  it("time is never an input to the score: the same choices with waiting in between score the same", () => {
    const quick = finish(play(path("prompt").steps), "ready", {});
    const slow = finish(play(["wait", ...path("prompt").steps.flatMap((x) => [x])], { mode: "untimed" }), "ready", {});
    expect(quick.score).toBe(15);
    expect(slow.score).toBe(quick.score);
  });
});

describe("statuses and the readiness panel (criteria 3 and 4)", () => {
  it("no learner card can confirm, approve, book or deliver anything, and the check catches one that tries", () => {
    for (const a of d.actions) for (const e of a.effects) expect(ACTION_STATUSES, `${a.id} → ${e.status}`).toContain(e.status);
    const bad: DischargeData = structuredClone(d);
    bad.actions[0].effects.push({ fact: "first", status: "confirmed", text: "" });
    expect(scenarioProblems(bad).some((p) => /only request, record or agree/.test(p))).toBe(true);
    const hearsay: DischargeData = structuredClone(d);
    hearsay.alerts.find((a) => a.id === "fiona-call")!.effects.push({ fact: "first", status: "booked", text: "" });
    expect(scenarioProblems(hearsay).some((p) => /isn’t from a verified source/.test(p))).toBe(true);
  });

  it("keeps recommended, requested, declined, pending and confirmed apart", () => {
    expect(derive(d, play([])).facts.chair.status).toBe("recommended");
    expect(derive(d, play(["athm-request"])).facts.chair.status).toBe("requested");
    const s = play(["request-nurse"]);
    expect(derive(d, s).facts.first.status).toBe("requested");
    expect(derive(d, applyMove(d, s, { do: "wait", at: s.clock })).facts.first.status).toBe("declined");
    expect(derive(d, play(path("late").steps)).facts.first.status).toBe("pending");
    expect(derive(d, play([...path("prompt").steps, "wait"])).facts.first.status).toBe("confirmed");
  });

  it("never says ready because cards were used: every card taken, the panel stays not ready while a gate is open", () => {
    let s = play([], { variation: "outreach-full" });
    for (let guard = 0; guard < 80; guard++) {
      const next = derive(d, s).available[0];
      s = next ? applyMove(d, s, { do: "take", action: next.id }) : applyMove(d, s, { do: "wait", at: s.clock });
      if (s.clock >= d.clock.discharge) break;
    }
    const x = derive(d, s);
    expect(x.taken.length).toBe(d.actions.length);
    expect(x.gates["first-care"].status).not.toBe("confirmed");
    expect(readyNow(d, x)).toBe(false);
    expect(deskView(d, s).ready).toBe(false);
  });

  it("an unresolved gate stays unresolved until confirmation or a documented contingency", () => {
    const s = play(["ask-summary", "request-nurse", "wait", "wait"]);
    expect(derive(d, s).gates["first-care"]).toEqual({ status: "unresolved", escalated: false, contingency: false });
    const e = play(["ask-summary", "request-nurse", "wait", "wait", "escalate-lead", "escalate-hospital"]);
    expect(derive(d, e).gates["first-care"].escalated).toBe(true);
    expect(derive(d, e).gates["first-care"].status).toBe("unresolved");
  });
});

describe("the participant, the supporter, funding and pathways (criteria 6 to 10)", () => {
  const codesOf = (steps: string[]) => derive(d, play(steps)).codes.map((c) => c.code);
  it("Fiona’s request doesn’t override Dot, and her information follows Dot’s consent", () => {
    expect(codesOf(["wait", "fiona-dressings"])).toEqual(["unqualifiedWoundCare", "familyDecides"]);
    expect(codesOf(["ask-summary", "wait", "wait", "wait", "send-summary"])).toEqual(["restrictedDisclosure"]);
    expect(codesOf(["call-dot", "update-fiona"])).toEqual([]);
  });

  it("the learner is never required to prescribe, decide fitness or halt the discharge", () => {
    expect(codesOf(["twice-daily"])).toEqual(["inventedClinical"]);
    expect(codesOf(["request-nurse", "wait", "wait", "halt"])).toEqual(["haltDischarge"]);
    // The confirmed path contains none of those moves.
    expect(path("prompt").steps).not.toContain("halt");
    expect(path("prompt").steps).not.toContain("twice-daily");
  });

  it("AT–HM, TCP, Restorative Care and a Support Plan Review stay what they are", () => {
    expect(codesOf(["chair-budget"])).toEqual(["atHmFromOngoing"]);
    expect(codesOf(["ask-summary", "wait", "wait", "wait", "wait", "restorative-now"])).toEqual(["promisedApproval"]);
    expect(codesOf(["extra-now"])).toEqual(["reviewAsFunding"]);
    const s = play(["ask-summary", "call-dot", "wait", "wait", "review-request"]);
    expect(derive(d, s).facts.review.status).toBe("requested");
    expect(derive(d, s).facts.careplan.status).toBe("approved");
    for (const c of ["atHmFromOngoing", "promisedApproval", "reviewAsFunding", "restrictedDisclosure", "unqualifiedWoundCare", "inventedClinical"] as const)
      expect(CRITICAL).toContain(c);
  });

  it("cancelling the gardener to free money isn’t a good answer", () => {
    const steps = [...path("prompt").steps.filter((x) => x !== "keep-gardener"), "cancel-gardener"];
    const r = finish(play([...steps, "wait"]), "contingency", { services: "pending" });
    expect(r.codes).toContain("cancelledForFunds");
    expect(r.dims.find((x) => x.dim === "funding")!.level).toBeLessThanOrEqual(1);
  });
});

describe("endings, pausing and idempotent moves (criteria 11 to 13)", () => {
  it("an unresolved gap, promptly escalated and honestly recorded, is a defensible ending", () => {
    const r = playPath(d, path("full")).debrief;
    expect(r.ending).toBe("escalated");
    expect(r.defensible).toBe(true);
    expect(r.critical).toEqual([]);
    // The provider declined at 4:15 pm; the first escalation was at 4:30 pm.
    expect(r.recognised).toBe(15);
  });

  it("declaring incomplete without escalating is not defensible", () => {
    const r = finish(play(["ask-summary", "request-nurse", "wait", "wait"]), "incomplete", {
      clinical: "unresolved",
      "first-care": "unresolved",
      equipment: "unresolved",
      voice: "unresolved",
      handover: "unresolved",
      services: "unresolved",
    });
    expect(r.ending).toBe("incomplete");
    expect(r.codes).toContain("unescalatedGap");
  });

  it("pauses (nothing moves), and untimed play never closes a reply window", () => {
    const s = applyMove(d, play([]), { do: "pause" });
    expect(() => applyMove(d, s, { do: "take", action: "ask-summary" })).toThrow(MoveError);
    expect(applyMove(d, s, { do: "resume" }).paused).toBe(false);
    expect(derive(d, play(path("late").steps, { mode: "untimed" })).facts.first.status).toBe("confirmed");
  });

  it("a resent move changes nothing: an action is taken once, a wait is keyed by its minute", () => {
    const s = play(["ask-summary"]);
    expect(applyMove(d, s, { do: "take", action: "ask-summary" })).toBe(s);
    const w = applyMove(d, s, { do: "wait", at: 15 });
    expect(applyMove(d, w, { do: "wait", at: 15 })).toBe(w);
    expect(w.clock).toBe(30);
    expect(() => applyMove(d, s, { do: "take", action: "escalate-lead" })).toThrow(/can’t be done yet/);
  });

  it("a retry variation changes the case, and an attempt freezes it", () => {
    const base = derive(d, play([...path("prompt").steps, "wait"])).facts.first.status;
    const varied = derive(d, play([...path("prompt").steps, "wait"], { variation: "outreach-full" })).facts.first.status;
    expect([base, varied]).toEqual(["confirmed", "declined"]);
  });
});

describe("what the learner’s browser gets (privacy and readers’ copy)", () => {
  it("the readers’ copy has the frame only: no record, alerts, cards, gates, rubric, endings or paths", () => {
    const r = dischargeForReaders({ ...d });
    expect([r.facts, r.alerts, r.actions, r.gates, r.questions, r.paths, r.variations]).toEqual([[], [], [], [], [], [], []]);
    expect(JSON.stringify(r)).not.toMatch(/hiddenGap|feedback.*escalat|outreach/i);
    expect(r.participant.name).toBe("Dot");
  });

  it("the desk view carries no feedback, codes, future alerts or answer key", () => {
    const v = deskView(d, play(["ask-summary"]));
    const text = JSON.stringify(v);
    for (const a of d.actions) expect(text).not.toContain(a.feedback);
    expect(text).not.toMatch(/hiddenGap|unqualifiedWoundCare|"codes"|"verdict"/);
    expect(v.alerts.map((a) => a.id).sort()).toEqual(["fiona-call", "planner-call"]);
    expect(text).not.toContain("outreach team has accepted");
  });

  it("sources: the public ones are current, Trilogy Care’s own are placeholders that hold publishing", () => {
    const probs = sourceProblems(d, TODAY);
    expect(probs.length).toBe(3);
    expect(probs.every((p) => /placeholder Hub policy record/.test(p))).toBe(true);
  });
});

// Type-only use, so a path's shape stays checked here.
export const _paths: Path[] = d.paths;
