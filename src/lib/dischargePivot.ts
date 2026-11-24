import { dischargeSource, dischargeSourceStatus } from "./dischargeSources";

/*
  The 72-Hour Discharge Pivot (docs/discharge-pivot.md): a time-aware triage simulation. A fictional coordinator's
  desk while a participant's return home from hospital is being arranged: alerts arrive as authored milestones, the
  handover record shows what's missing and unverified, an action board (Verify, Arrange, Escalate, Follow up) holds
  the decisions, and a readiness panel shows each gate as confirmed, pending or unresolved. The learner records a
  handover and sees the consequences.

  Deterministic throughout. A scenario is data: facts, alerts with release conditions, actions with effects, gates
  with conditions, a rubric of conditions, and endings. `derive` replays the learner's ordered choices against it,
  so the server and the editor's preview compute the same thing, and an attempt resumes exactly. Nothing here is an
  LLM, and no character dialogue can change the state without an authored event.

  Safety rules the model enforces (and `scenarioProblems` checks for every authored case):
  - A learner's own action can only ask, record or agree (ACTION_STATUSES). Only an alert from a verified source can
    make something accepted, approved, booked, confirmed, delivered or reviewed. No click turns a recommendation
    into a delivered service.
  - The readiness panel reads the gates' conditions, never how many cards were used. It is never "ready" while an
    essential gate isn't confirmed.
  - Declaring the handover ready, or stating a gate as confirmed, when it isn't, is the critical error `hiddenGap`,
    however quickly it was done. Finishing fast is never an input to the rubric.
  - An unresolved gap that was escalated, and presented honestly, is a defensible ending.

  The story clock moves only when the learner acts or chooses to wait: reading the record, an alert or the readiness
  panel costs nothing, and escalation costs no more than any other call. Untimed practice turns off the time windows
  (a reply that would close while the learner thinks never closes) and hides the clock.
*/

export const PIVOT_VERSION = "discharge-pivot-1";
export const RUBRIC_VERSION = "discharge-rubric-1";
export const ENGINE_VERSION = "discharge-engine-1";

export const LANES = { verify: "Verify", arrange: "Arrange", escalate: "Escalate", followup: "Follow up" } as const;
export type Lane = keyof typeof LANES;
export const LANE_ORDER = Object.keys(LANES) as Lane[];
export const LANE_HINTS: Record<Lane, string> = {
  verify: "Check what’s known, and who owns it",
  arrange: "Ask for a service, an item or a plan",
  escalate: "Raise a gap with the people who decide",
  followup: "Tell people, record it, and check it happened",
};

/** Every state a handover field can be in, in plain words. The PRD's distinctions: recommended ≠ requested ≠ confirmed ≠ delivered. */
export const STATUSES = {
  missing: "Missing",
  unknown: "Not yet known",
  unverified: "Unverified",
  proposed: "Proposed",
  recommended: "Recommended, not arranged",
  requested: "Requested, not confirmed",
  pending: "Pending",
  accepted: "Accepted, not yet confirmed",
  approved: "Approved",
  booked: "Booked",
  confirmed: "Confirmed",
  delivered: "Delivered",
  reviewed: "Reviewed",
  declined: "Declined",
  "not-approved": "Not approved",
  agreed: "Agreed",
  recorded: "Recorded",
} as const;
export type FactStatus = keyof typeof STATUSES;
const STATUS_IDS = Object.keys(STATUSES) as FactStatus[];
/** What a learner's own action can set: it asks, records or agrees. It never confirms anything. */
export const ACTION_STATUSES: readonly FactStatus[] = ["requested", "pending", "recorded", "agreed"];
/** What only an alert from a verified source can set. */
export const CONFIRMING: readonly FactStatus[] = ["accepted", "approved", "booked", "confirmed", "delivered", "reviewed"];

export const RELIABILITY = { verified: "Verified source", unverified: "Not yet verified", hearsay: "Second-hand" } as const;
export type Reliability = keyof typeof RELIABILITY;

export const GATE_STATUS = { unknown: "Not yet checked", unresolved: "Unresolved", pending: "Pending", confirmed: "Confirmed" } as const;
export type GateStatus = keyof typeof GATE_STATUS;
/** What a learner can say a gate is, in the handover. */
export const STATED = { confirmed: "Confirmed", pending: "Pending", unresolved: "Unresolved" } as const;
export type Stated = keyof typeof STATED;

export const DECLARATIONS = {
  ready: "Ready: the first days at home are confirmed",
  contingency: "Ready with a documented contingency and a named owner",
  incomplete: "Handover incomplete: the gap is escalated",
} as const;
export type Declaration = keyof typeof DECLARATIONS;

export const DIMENSIONS = {
  clinical: "Clinical handover",
  continuity: "First-day continuity",
  voice: "Participant voice and privacy",
  funding: "Funding and service route",
  coordination: "Coordination",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong" };
export const MAX_SCORE = DIM_ORDER.length * 3;

/** Error and misconception codes. CRITICAL ones are the PRD's section 8 list: in assessed mode they prevent a pass. */
export const CODES = {
  hiddenGap: "Marked the handover ready, or a gate confirmed, while an essential gap remained",
  unqualifiedWoundCare: "Assigned wound care to an unqualified or unconfirmed person",
  inventedClinical: "Invented or acted on a clinical direction no clinician gave",
  promisedApproval: "Promised a pathway or equipment approval that isn’t there",
  atHmFromOngoing: "Used ongoing quarterly funding for an AT–HM item",
  restrictedDisclosure: "Shared information the participant hadn’t agreed to share",
  reviewAsFunding: "Treated a requested review as immediate funding",
  requestAsConfirmed: "Treated a request as a confirmation",
  familyDecides: "Let a family member’s view stand in for the participant’s choice",
  cancelledForFunds: "Cancelled a valued service only to free up money",
  haltDischarge: "Tried to stop the hospital’s discharge decision on the provider’s own authority",
  unescalatedGap: "Left an essential gap without escalating it",
  noFollowUp: "Left the first check after the return home to chance",
} as const;
export type Code = keyof typeof CODES;
export const CRITICAL: readonly Code[] = [
  "hiddenGap",
  "unqualifiedWoundCare",
  "inventedClinical",
  "promisedApproval",
  "atHmFromOngoing",
  "restrictedDisclosure",
  "reviewAsFunding",
];
/** How far a code caps a rubric dimension, whatever else was done. Fixed here so a reviewer reads one table. */
export const CODE_CAPS: Record<Code, Partial<Record<Dim, Level>>> = {
  hiddenGap: { continuity: 0, coordination: 1 },
  unqualifiedWoundCare: { clinical: 0, continuity: 0 },
  inventedClinical: { clinical: 0 },
  promisedApproval: { funding: 0, voice: 1 },
  atHmFromOngoing: { funding: 0 },
  restrictedDisclosure: { voice: 0 },
  reviewAsFunding: { funding: 0 },
  requestAsConfirmed: { continuity: 1 },
  familyDecides: { voice: 1 },
  cancelledForFunds: { funding: 1, voice: 1 },
  haltDischarge: { coordination: 1 },
  unescalatedGap: { continuity: 1 },
  noFollowUp: { coordination: 1 },
};

export const ENDINGS = {
  confirmed: "A fully confirmed first-day plan",
  contingency: "A plan with a documented contingency and a named owner",
  escalated: "An unresolved gap, escalated and not presented as ready",
  incomplete: "Incomplete: a gap wasn’t escalated",
  unsafe: "A critical error",
} as const;
export type EndingId = keyof typeof ENDINGS;
export const DEFENSIBLE: readonly EndingId[] = ["confirmed", "contingency", "escalated"];

export const OWNER_ROLES = {
  hospital: "Hospital discharge planner",
  ot: "Hospital occupational therapist",
  clinical: "Trilogy Care clinical lead",
  coordinator: "You, the care coordinator",
  nurse: "Nursing provider",
  participant: "The participant",
  family: "A family member",
} as const;
export type OwnerRole = keyof typeof OWNER_ROLES;

/**
  A condition, all of whose given parts must hold. `within` is about promptness: one of the actions taken within so
  many story minutes of an alert arriving.
*/
export type Cond = {
  taken?: string;
  notTaken?: string;
  released?: string;
  fact?: string;
  is?: FactStatus[];
  within?: { actions: string[]; of: string; minutes: number };
  answer?: string;
  in?: string[];
  /** Every essential gate's owner in the handover is one the gate accepts. */
  owners?: boolean;
  declared?: Declaration[];
};
export type Effect = { fact: string; status: FactStatus; text: string };
export type Fact = { id: string; group: string; label: string; status: FactStatus; text: string };
export type Alert = {
  id: string;
  /** Who it's from, as a role: never a real name, and never a new character. */
  from: string;
  reliability: Reliability;
  /** What the coordinator may do with it: who may be told. */
  access: string;
  /** Story minutes from the start, the earliest it can arrive. */
  at: number;
  /** It arrives only after these actions, `delay` minutes after the last of them. */
  after: string[];
  delay: number;
  /** In timed mode: only if it would arrive by this minute (`by`), or only from this minute (`from`). Untimed ignores `by` and never sends a `from` alert. */
  window: { by?: number; from?: number };
  /** Only in this retry variation; or not in these. */
  only: string;
  notIn: string[];
  body: string;
  effects: Effect[];
  /** It reports a service or approval confirmed (logged as service_confirmation_received). */
  confirms: boolean;
  source: string;
};
export type Verdict = "strong" | "okay" | "weak" | "unsafe";
export const VERDICTS: Record<Verdict, string> = {
  strong: "A strong move",
  okay: "Reasonable",
  weak: "Not the best use of time",
  unsafe: "Not safe or not your call",
};
export type Action = {
  id: string;
  lane: Lane;
  /** The intent, as the card says it. */
  label: string;
  owner: OwnerRole;
  /** What you'd need to have or say. */
  needs: string;
  /** In plain words, what this depends on. */
  dependency: string;
  /** Available once these alerts have arrived or actions been taken. */
  requires: string[];
  minutes: number;
  /** What might come of it, without giving the answer away. */
  consequence: string;
  /** The handover field whose state the card shows. */
  shows: string;
  effects: Effect[];
  codes: Code[];
  /** The codes don't apply if these facts are already so when it's taken (e.g. telling Fiona it's arranged, once it is). */
  unless: Cond[];
  /** A specialist event to log when it's taken. */
  signal: "" | "clinical_gap_identified" | "escalation_selected" | "funding_route_selected";
  /** One of the moves the debrief names if it was missed. */
  key: boolean;
  verdict: Verdict;
  feedback: string;
  source: string;
};
export type Gate = {
  id: string;
  label: string;
  essential: boolean;
  /** The handover fields it reads. */
  facts: string[];
  confirmed: Cond[];
  /** Any one of these makes it pending. */
  pending: Cond[];
  escalated: Cond[];
  contingency: Cond[];
  /** Who can own its next step. The first is the main owner. */
  owners: OwnerRole[];
  source: string;
};
export type Option = { id: string; text: string; feedback: string; codes: Code[]; unless: Cond[] };
export type Question = { id: string; prompt: string; options: Option[] };
export type Criterion = { id: string; text: string; when: Cond[] };
export type Variation = { id: string; label: string; text: string };
export type Path = {
  id: string;
  label: string;
  mode: "timed" | "untimed";
  variation: string;
  /** Action ids in order; "wait" waits 15 minutes. */
  steps: string[];
  declaration: Declaration;
  gates: Record<string, Stated>;
  answers: Record<string, string>;
  expect: EndingId;
};

export type DischargeData = {
  title: string;
  intro: string;
  scenarioVersion: string;
  mode: "formative" | "assessed";
  passMark: number;
  participant: { name: string; about: string };
  /** Who decides, and what a supporter is (registered or not). */
  decisionMaker: string;
  supporter: { name: string; relation: string; status: string };
  /** The story clock. Minute 0 is `startDay` at `startTime`. */
  clock: { startDay: string; startTime: string; discharge: number; dischargeText: string };
  facts: Fact[];
  alerts: Alert[];
  actions: Action[];
  gates: Gate[];
  questions: Question[];
  rubric: Record<Dim, Criterion[]>;
  endings: Record<EndingId, string>;
  /** The essential-service gap, for "time to recognise it" (in the simulation) and the debrief's note on order. */
  gap: { alert: string; actions: string[]; orderNote: string; followUp: string };
  variations: Variation[];
  paths: Path[];
  debrief: string;
  jobAid: { snippetId: string; why: string };
  /** Why this block (PRD section 2): the author accepts, edits or rejects it, versioned with the scenario. */
  rationale: {
    theme: string;
    themeId: string;
    themeOwner: string;
    behaviour: string;
    barrier: string;
    whyFit: string;
    evidence: string;
    measure: string;
    systemFix: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  /** The optional AI character dialogue: a disabled stub in this release (no paid call). */
  ai: { dialogue: false };
  approval: {
    owner: string;
    clinical: string;
    operations: string;
    policy: string;
    process: string;
    learning: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
    /** The scenario version the reviewers checked. A different one on the block means Review required. */
    scenarioReviewed: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state, and replaying it
// ---------------------------------------------------------------------------------------------

export type Handover = {
  declaration: Declaration | "";
  gates: Record<string, { status: Stated | ""; owner: OwnerRole | "" }>;
  answers: Record<string, string>;
};
export type PivotState = {
  mode: "timed" | "untimed";
  started: boolean;
  paused: boolean;
  clock: number;
  taken: { id: string; at: number }[];
  /** Waits, by the minute they started at. */
  waits: number[];
  inspected: string[];
  read: string[];
  stage: "desk" | "handover";
  variation: string;
  handover: Handover;
};
export const emptyHandover = (): Handover => ({ declaration: "", gates: {}, answers: {} });
export const emptyState = (variation = ""): PivotState => ({
  mode: "timed",
  started: false,
  paused: false,
  clock: 0,
  taken: [],
  waits: [],
  inspected: [],
  read: [],
  stage: "desk",
  variation,
  handover: emptyHandover(),
});
export const WAIT_MINUTES = 15;

/** The clock as a story time: "Wednesday 3:45 pm". */
export function timeLabel(d: Pick<DischargeData, "clock">, minute: number) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [h, m] = d.clock.startTime.split(":").map((x) => Number(x) || 0);
  const total = h * 60 + m + Math.max(0, Math.round(minute));
  const day = DAYS[(Math.max(0, DAYS.indexOf(d.clock.startDay)) + Math.floor(total / 1440)) % 7];
  const t = total % 1440;
  const hh = Math.floor(t / 60);
  return `${day} ${hh % 12 || 12}:${String(t % 60).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
}
export const minutesWords = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}`);

/** Sorting at the same story minute: a scheduled alert before the learner's actions, one an action brought after them. */
const alertOrder = (a: Alert) => (a.after.length ? 10_000 : -10_000);
const activeAlert = (a: Alert, variation: string) => (!a.only || a.only === variation) && !a.notIn.includes(variation);

export type Derived = {
  clock: number;
  released: { alert: Alert; at: number }[];
  taken: { action: Action; at: number; codes: Code[] }[];
  facts: Record<string, { status: FactStatus; text: string; changedAt: number | null }>;
  codes: { code: Code; action: string; at: number }[];
  gates: Record<string, { status: GateStatus; escalated: boolean; contingency: boolean }>;
  available: Action[];
  /** The proposed discharge time has come: the desk closes, and the handover is what's left. */
  closed: boolean;
};

type Ctx = {
  taken: Map<string, number>;
  released: Map<string, number>;
  facts: Derived["facts"];
  handover?: Handover;
  d: DischargeData;
};
export function holds(c: Cond, x: Ctx): boolean {
  if (c.taken !== undefined && !x.taken.has(c.taken)) return false;
  if (c.notTaken !== undefined && x.taken.has(c.notTaken)) return false;
  if (c.released !== undefined && !x.released.has(c.released)) return false;
  if (c.fact !== undefined && !(c.is ?? []).includes(x.facts[c.fact]?.status as FactStatus)) return false;
  if (c.within) {
    const r = x.released.get(c.within.of);
    if (r === undefined) return false;
    if (!c.within.actions.some((id) => (x.taken.get(id) ?? Infinity) <= r + c.within!.minutes)) return false;
  }
  if (c.answer !== undefined && !(c.in ?? []).includes(x.handover?.answers[c.answer] ?? "")) return false;
  if (c.owners && !x.d.gates.filter((g) => g.essential).every((g) => g.owners.includes(x.handover?.gates[g.id]?.owner as OwnerRole))) return false;
  if (c.declared && !c.declared.includes(x.handover?.declaration as Declaration)) return false;
  return true;
}
const all = (cs: Cond[], x: Ctx) => cs.every((c) => holds(c, x));

/** When an alert arrives, or null if it hasn't been earned (or the window has closed on it). */
function releaseAt(a: Alert, taken: Map<string, number>, mode: PivotState["mode"]): number | null {
  if (a.after.some((id) => !taken.has(id))) return null;
  const at = a.after.length ? Math.max(a.at, ...a.after.map((id) => taken.get(id)! + a.delay)) : a.at;
  if (mode === "untimed") return a.window.from !== undefined ? null : at;
  if (a.window.by !== undefined && at > a.window.by) return null;
  if (a.window.from !== undefined && at < a.window.from) return null;
  return at;
}

/** Replays the learner's choices against the scenario: what has arrived, the record, the codes, the gates, what can be done. */
export function derive(d: DischargeData, s: PivotState): Derived {
  const actions = new Map(d.actions.map((a) => [a.id, a]));
  const takenList = s.taken.filter((t) => actions.has(t.id));
  const taken = new Map(takenList.map((t) => [t.id, t.at]));
  const alerts = d.alerts.filter((a) => activeAlert(a, s.variation));
  const releasedList = alerts
    .map((a) => ({ alert: a, at: releaseAt(a, taken, s.mode) }))
    .filter((r): r is { alert: Alert; at: number } => r.at !== null && r.at <= s.clock)
    .sort((a, b) => a.at - b.at || d.alerts.indexOf(a.alert) - d.alerts.indexOf(b.alert));
  const released = new Map(releasedList.map((r) => [r.alert.id, r.at]));
  const facts: Derived["facts"] = Object.fromEntries(d.facts.map((f) => [f.id, { status: f.status, text: f.text, changedAt: null as number | null }]));
  const apply = (es: Effect[], at: number) => {
    for (const e of es) if (facts[e.fact]) facts[e.fact] = { status: e.status, text: e.text || facts[e.fact].text, changedAt: at };
  };
  // In story order. At the same minute, a scheduled alert comes before the learner's action, and what an action brings comes after it.
  type Ev = { at: number; order: number; act?: Action; alert?: Alert };
  const evs: Ev[] = [
    ...takenList.map((t, i) => ({ at: t.at, order: i, act: actions.get(t.id)! })),
    ...releasedList.map((r, i) => ({ at: r.at, order: alertOrder(r.alert) + i, alert: r.alert })),
  ].sort((a, b) => a.at - b.at || a.order - b.order);
  const codes: Derived["codes"] = [];
  const takenOut: Derived["taken"] = [];
  const soFarTaken = new Map<string, number>();
  const soFarReleased = new Map<string, number>();
  for (const e of evs) {
    if (e.act) {
      const x: Ctx = { taken: soFarTaken, released: soFarReleased, facts, d };
      const own = e.act.codes.length && !(e.act.unless.length && all(e.act.unless, x)) ? e.act.codes : [];
      for (const c of own) codes.push({ code: c, action: e.act.id, at: e.at });
      takenOut.push({ action: e.act, at: e.at, codes: own });
      soFarTaken.set(e.act.id, e.at);
      apply(e.act.effects, e.at);
    } else if (e.alert) {
      soFarReleased.set(e.alert.id, e.at);
      apply(e.alert.effects, e.at);
    }
  }
  const x: Ctx = { taken, released, facts, d };
  const gates: Derived["gates"] = {};
  for (const g of d.gates) {
    const known = g.facts.some((f) => s.inspected.includes(f) || facts[f]?.changedAt !== null);
    const confirmed = g.confirmed.length > 0 && all(g.confirmed, x);
    const pending = g.pending.some((c) => holds(c, x));
    gates[g.id] = {
      status: confirmed ? "confirmed" : !known ? "unknown" : pending ? "pending" : "unresolved",
      escalated: g.escalated.length > 0 && all(g.escalated, x),
      contingency: g.contingency.length > 0 && all(g.contingency, x),
    };
  }
  const closed = s.clock >= d.clock.discharge;
  const done = (id: string) => taken.has(id) || released.has(id);
  const available = s.stage === "desk" && !closed ? d.actions.filter((a) => !taken.has(a.id) && a.requires.every(done)) : [];
  return { clock: s.clock, released: releasedList, taken: takenOut, facts, codes, gates, available, closed };
}

/** Whether every essential gate is confirmed: the only way the panel says "ready". Never a count of cards. */
export const readyNow = (d: DischargeData, x: Derived) => d.gates.filter((g) => g.essential).every((g) => x.gates[g.id]?.status === "confirmed");

// ---------------------------------------------------------------------------------------------
// Moves: each one checked, and each one idempotent
// ---------------------------------------------------------------------------------------------

export type Move =
  | { do: "start"; mode: "timed" | "untimed" }
  | { do: "inspect"; fact: string }
  | { do: "read"; alert: string }
  | { do: "take"; action: string }
  | { do: "wait"; at: number }
  | { do: "pause" }
  | { do: "resume" }
  | { do: "handover" }
  | { do: "desk" }
  | { do: "record"; handover: unknown };

export class MoveError extends Error {}

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | "" => (list.includes(v as T) ? (v as T) : "");
/** A handover as sent: only known gates, statuses, owners, questions and options are kept. */
export function cleanHandover(d: DischargeData, raw: unknown): Handover {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const gs = (o.gates && typeof o.gates === "object" ? o.gates : {}) as Record<string, unknown>;
  const as = (o.answers && typeof o.answers === "object" ? o.answers : {}) as Record<string, unknown>;
  return {
    declaration: oneOf(o.declaration, Object.keys(DECLARATIONS) as Declaration[]),
    gates: Object.fromEntries(
      d.gates.map((g) => {
        const v = (gs[g.id] && typeof gs[g.id] === "object" ? gs[g.id] : {}) as Record<string, unknown>;
        return [g.id, { status: oneOf(v.status, Object.keys(STATED) as Stated[]), owner: oneOf(v.owner, Object.keys(OWNER_ROLES) as OwnerRole[]) }];
      }),
    ),
    answers: Object.fromEntries(d.questions.flatMap((q) => (q.options.some((op) => op.id === as[q.id]) ? [[q.id, as[q.id] as string]] : []))),
  };
}

/** The state as stored or sent, cleaned against the scenario: unknown ids dropped, nothing duplicated. */
export function cleanState(d: DischargeData, raw: unknown): PivotState {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = new Set(d.actions.map((a) => a.id));
  const seen = new Set<string>();
  const taken = (Array.isArray(o.taken) ? o.taken : []).flatMap((t) => {
    const r = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!ids.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, at: Math.max(0, Math.floor(Number(r.at) || 0)) }];
  });
  const list = (v: unknown, allowed: Set<string>) => [
    ...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && allowed.has(x))),
  ];
  return {
    mode: o.mode === "untimed" ? "untimed" : "timed",
    started: o.started === true,
    paused: o.paused === true,
    clock: Math.max(0, Math.floor(Number(o.clock) || 0)),
    taken,
    waits: (Array.isArray(o.waits) ? o.waits : []).map((w) => Math.max(0, Math.floor(Number(w) || 0))),
    inspected: list(o.inspected, new Set(d.facts.map((f) => f.id))),
    read: list(o.read, new Set(d.alerts.map((a) => a.id))),
    stage: o.stage === "handover" ? "handover" : "desk",
    variation: typeof o.variation === "string" && d.variations.some((v) => v.id === o.variation) ? o.variation : "",
    handover: cleanHandover(d, o.handover),
  };
}

/**
  Applies one move. A move that has already happened (an action already taken, a wait already waited) changes
  nothing, so a resent request never doubles anything. A move that isn't allowed now throws MoveError.
*/
export function applyMove(d: DischargeData, s: PivotState, m: Move): PivotState {
  if (m.do === "start") return s.started ? s : { ...s, started: true, mode: m.mode === "untimed" ? "untimed" : "timed" };
  if (!s.started) throw new MoveError("Choose how to play first: with the story clock, or untimed.");
  switch (m.do) {
    case "inspect":
      if (!d.facts.some((f) => f.id === m.fact)) throw new MoveError("That isn’t in the handover record.");
      return s.inspected.includes(m.fact) ? s : { ...s, inspected: [...s.inspected, m.fact] };
    case "read":
      if (!derive(d, s).released.some((r) => r.alert.id === m.alert)) throw new MoveError("That alert hasn’t arrived.");
      return s.read.includes(m.alert) ? s : { ...s, read: [...s.read, m.alert] };
    case "pause":
      return { ...s, paused: true };
    case "resume":
      return { ...s, paused: false };
    case "take": {
      if (s.taken.some((t) => t.id === m.action)) return s;
      if (s.paused) throw new MoveError("The desk is paused. Resume to carry on.");
      const x = derive(d, s);
      const a = x.available.find((y) => y.id === m.action);
      if (!a) throw new MoveError(x.closed ? "It’s the proposed discharge time: record your handover." : "That can’t be done yet.");
      return { ...s, taken: [...s.taken, { id: a.id, at: s.clock }], clock: s.clock + a.minutes };
    }
    case "wait": {
      // Idempotent by the minute it starts at: a resent wait for the same minute is the same wait.
      if (m.at !== s.clock) return s;
      if (s.paused) throw new MoveError("The desk is paused. Resume to carry on.");
      if (s.stage !== "desk" || s.clock >= d.clock.discharge) throw new MoveError("It’s the proposed discharge time: record your handover.");
      return { ...s, waits: [...s.waits, s.clock], clock: Math.min(d.clock.discharge, s.clock + WAIT_MINUTES) };
    }
    case "handover":
      if (!s.inspected.length) throw new MoveError("Open the handover record first: check at least one field.");
      if (!s.taken.length) throw new MoveError("Make at least one decision on the board first.");
      return { ...s, stage: "handover" };
    case "desk":
      return { ...s, stage: "desk" };
    case "record":
      return { ...s, handover: cleanHandover(d, m.handover) };
  }
}

export function parseMove(raw: unknown): Move | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : "");
  switch (o.do) {
    case "start":
      return { do: "start", mode: o.mode === "untimed" ? "untimed" : "timed" };
    case "inspect":
      return { do: "inspect", fact: str(o.fact) };
    case "read":
      return { do: "read", alert: str(o.alert) };
    case "take":
      return { do: "take", action: str(o.action) };
    case "wait":
      return { do: "wait", at: Math.floor(Number(o.at)) };
    case "pause":
    case "resume":
    case "handover":
    case "desk":
      return { do: o.do };
    case "record":
      return { do: "record", handover: o.handover };
    default:
      return null;
  }
}

/** What's still missing before the handover can be submitted. */
export function handoverProblems(d: DischargeData, s: PivotState): string[] {
  const out: string[] = [];
  if (s.stage !== "handover") out.push("Move to the handover first.");
  if (!s.handover.declaration) out.push("Say whether the handover is ready.");
  for (const g of d.gates) {
    const h = s.handover.gates[g.id];
    if (!h?.status || !h.owner) out.push(`Say where “${g.label}” stands and who owns its next step.`);
  }
  for (const q of d.questions) if (!s.handover.answers[q.id]) out.push(`Answer “${q.prompt}”`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The debrief: ending, critical errors, rubric, what was actually confirmed
// ---------------------------------------------------------------------------------------------

const RANK: Record<GateStatus | Stated, number> = { unknown: 0, unresolved: 0, pending: 1, confirmed: 2 };

export type Debrief = {
  ending: EndingId;
  endingLabel: string;
  endingText: string;
  defensible: boolean;
  critical: { code: Code; label: string; detail: string }[];
  codes: Code[];
  dims: { dim: Dim; label: string; level: Level; words: string; met: string[]; missed: string[]; capped: string }[];
  score: number;
  max: number;
  passMark: number;
  passed: boolean | null;
  mode: "formative" | "assessed";
  play: "timed" | "untimed";
  variation: { id: string; label: string; text: string } | null;
  confirmed: string[];
  uncertain: string[];
  contacted: string[];
  firstCheck: string;
  handover: {
    gate: string;
    label: string;
    stated: Stated | "";
    actual: GateStatus;
    escalated: boolean;
    owner: string;
    ownerOk: boolean;
    overstated: boolean;
  }[];
  declaration: Declaration | "";
  timeline: {
    at: string;
    minute: number;
    kind: "alert" | "action" | "wait";
    title: string;
    detail: string;
    verdict?: Verdict;
    feedback?: string;
    codes?: Code[];
  }[];
  missedKey: { label: string; feedback: string }[];
  answers: { prompt: string; chosen: string; feedback: string }[];
  /** Story minutes from the essential-service gap arriving to its first escalation: null if it didn't arrive, or wasn't escalated. */
  recognised: number | null;
  orderNote: string;
  matters: string;
  sources: { id: string; title: string; url: string; owner: string }[];
  versions: { pivot: string; rubric: string; engine: string; scenario: string };
  finishedAt: string;
};

export function buildDebrief(d: DischargeData, s: PivotState): Debrief {
  const x = derive(d, s);
  const ctx: Ctx = {
    taken: new Map(x.taken.map((t) => [t.action.id, t.at])),
    released: new Map(x.released.map((r) => [r.alert.id, r.at])),
    facts: x.facts,
    handover: s.handover,
    d,
  };
  const codes = new Set<Code>(x.codes.map((c) => c.code));
  const details: Partial<Record<Code, string[]>> = {};
  const note = (c: Code, t: string) => {
    codes.add(c);
    (details[c] ??= []).push(t);
  };
  for (const c of x.codes) note(c.code, `“${d.actions.find((a) => a.id === c.action)?.label ?? c.action}” (${timeLabel(d, c.at)}).`);
  // The handover as stated, against the gates as they actually stand.
  const handover = d.gates.map((g) => {
    const h = s.handover.gates[g.id] ?? { status: "" as const, owner: "" as const };
    const actual = x.gates[g.id];
    const overstated = h.status === "confirmed" ? actual.status !== "confirmed" : h.status === "pending" ? RANK[actual.status] < 1 && !actual.escalated : false;
    if (overstated && g.essential)
      note("hiddenGap", `You recorded “${g.label}” as ${STATED[h.status as Stated].toLowerCase()}; it was ${GATE_STATUS[actual.status].toLowerCase()}.`);
    return {
      gate: g.id,
      label: g.label,
      stated: h.status,
      actual: actual.status,
      escalated: actual.escalated,
      owner: h.owner ? OWNER_ROLES[h.owner] : "",
      ownerOk: Boolean(h.owner && g.owners.includes(h.owner)),
      overstated,
    };
  });
  const essential = d.gates.filter((g) => g.essential);
  const notConfirmed = essential.filter((g) => x.gates[g.id].status !== "confirmed");
  const decl = s.handover.declaration;
  if (decl === "ready" && notConfirmed.length)
    note(
      "hiddenGap",
      `You declared the handover ready while ${notConfirmed.map((g) => `“${g.label}”`).join(", ")} ${notConfirmed.length === 1 ? "wasn’t" : "weren’t"} confirmed.`,
    );
  if (decl === "contingency") {
    const bare = notConfirmed.filter((g) => !(x.gates[g.id].status === "pending" && x.gates[g.id].contingency));
    if (bare.length)
      note("hiddenGap", `You declared it ready with a contingency, but ${bare.map((g) => `“${g.label}”`).join(", ")} had no documented contingency.`);
  }
  if (decl === "incomplete") {
    const loose = notConfirmed.filter((g) => !x.gates[g.id].escalated);
    if (loose.length) note("unescalatedGap", `${loose.map((g) => `“${g.label}”`).join(", ")} wasn’t confirmed or escalated.`);
  }
  // The handover questions' codes, judged at the end.
  const answers = d.questions.map((q) => {
    const op = q.options.find((o) => o.id === s.handover.answers[q.id]);
    if (op && op.codes.length && !(op.unless.length && all(op.unless, ctx)))
      for (const c of op.codes) note(c, `You answered “${q.prompt}” with “${op.text.replace(/[.]$/, "")}”.`);
    return { prompt: q.prompt, chosen: op?.text ?? "", feedback: op?.feedback ?? "" };
  });
  const critical = CRITICAL.filter((c) => codes.has(c)).map((c) => ({ code: c, label: CODES[c], detail: (details[c] ?? []).join(" ") }));
  // The rubric: authored criteria, capped by the codes. Elapsed time is never an input.
  const dims = DIM_ORDER.map((dim) => {
    const met = d.rubric[dim].filter((c) => all(c.when, ctx));
    let level = Math.min(3, met.length) as Level;
    const caps = [...codes].flatMap((c) => (CODE_CAPS[c][dim] !== undefined ? [{ c, max: CODE_CAPS[c][dim]! }] : []));
    const cap = caps.length ? caps.reduce((a, b) => (b.max < a.max ? b : a)) : null;
    if (cap && cap.max < level) level = cap.max;
    return {
      dim,
      label: DIMENSIONS[dim],
      level,
      words: LEVELS[level],
      met: met.map((c) => c.text),
      missed: d.rubric[dim].filter((c) => !met.includes(c)).map((c) => c.text),
      capped: cap && cap.max < Math.min(3, met.length) ? CODES[cap.c] : "",
    };
  });
  const score = dims.reduce((n, x) => n + x.level, 0);
  const ending: EndingId = critical.length
    ? "unsafe"
    : decl === "ready"
      ? "confirmed"
      : decl === "contingency"
        ? "contingency"
        : decl === "incomplete" && !codes.has("unescalatedGap")
          ? "escalated"
          : "incomplete";
  const factLine = (id: string) => {
    const f = d.facts.find((y) => y.id === id)!;
    return `${f.label}: ${STATUSES[x.facts[id].status].toLowerCase()}. ${x.facts[id].text}`.trim();
  };
  const sure: FactStatus[] = ["confirmed", "approved", "booked", "delivered", "reviewed", "agreed", "recorded"];
  const gapAt = x.released.find((r) => r.alert.id === d.gap.alert)?.at;
  const firstEsc = x.taken.filter((t) => d.gap.actions.includes(t.action.id)).map((t) => t.at);
  const recognised = gapAt === undefined || !firstEsc.length ? null : Math.max(0, Math.min(...firstEsc) - gapAt);
  type Line = Omit<Debrief["timeline"][number], "at"> & { order: number };
  const lines: Line[] = [
    ...x.released.map((r) => ({ minute: r.at, order: alertOrder(r.alert), kind: "alert" as const, title: r.alert.from, detail: r.alert.body })),
    ...x.taken.map((t) => ({
      minute: t.at,
      order: 0,
      kind: "action" as const,
      title: t.action.label,
      detail: `${OWNER_ROLES[t.action.owner]} · ${LANES[t.action.lane]}`,
      verdict: t.codes.some((c) => CRITICAL.includes(c)) ? ("unsafe" as Verdict) : t.action.verdict,
      feedback: t.action.feedback,
      codes: t.codes,
    })),
    ...s.waits.map((w) => ({ minute: w, order: 0, kind: "wait" as const, title: `Waited ${WAIT_MINUTES} minutes for replies`, detail: "" })),
  ];
  const timeline: Debrief["timeline"] = lines
    .sort((a, b) => a.minute - b.minute || a.order - b.order)
    .map((r) => ({
      at: timeLabel(d, r.minute),
      minute: r.minute,
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      ...(r.verdict && { verdict: r.verdict, feedback: r.feedback, codes: r.codes }),
    }));
  const cited = [
    ...new Set([...x.taken.map((t) => t.action.source), ...d.gates.map((g) => g.source), ...x.released.map((r) => r.alert.source)].filter(Boolean)),
  ];
  const variation = d.variations.find((v) => v.id === s.variation) ?? null;
  return {
    ending,
    endingLabel: ENDINGS[ending],
    endingText: d.endings[ending],
    defensible: DEFENSIBLE.includes(ending),
    critical,
    codes: [...codes],
    dims,
    score,
    max: MAX_SCORE,
    passMark: d.passMark,
    passed: d.mode === "assessed" ? score >= d.passMark && !critical.length : null,
    mode: d.mode,
    play: s.mode,
    variation: variation ? { ...variation } : null,
    confirmed: d.facts.filter((f) => sure.includes(x.facts[f.id].status)).map((f) => factLine(f.id)),
    uncertain: d.facts.filter((f) => !sure.includes(x.facts[f.id].status)).map((f) => factLine(f.id)),
    contacted: [...new Set(x.taken.filter((t) => t.action.owner !== "coordinator").map((t) => OWNER_ROLES[t.action.owner]))],
    firstCheck: x.facts[d.gap.followUp]?.status === "recorded" ? x.facts[d.gap.followUp].text : "No first check after the return home was set.",
    handover,
    declaration: decl,
    timeline,
    missedKey: d.actions.filter((a) => a.key && !ctx.taken.has(a.id)).map((a) => ({ label: a.label, feedback: a.feedback })),
    answers,
    recognised,
    orderNote: recognised === null || recognised > 30 ? d.gap.orderNote : "",
    matters: d.debrief,
    sources: cited.map((id) => {
      const src = dischargeSource(id);
      return { id, title: src?.title ?? id, url: src?.url ?? "", owner: src?.owner ?? "" };
    }),
    versions: { pivot: PIVOT_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: d.scenarioVersion },
    finishedAt: timeLabel(d, s.clock),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner's page is sent
// ---------------------------------------------------------------------------------------------

export type DeskView = {
  play: "timed" | "untimed";
  started: boolean;
  paused: boolean;
  stage: "desk" | "handover";
  clock: { minute: number; label: string; discharge: string; dischargeText: string; left: number; closed: boolean };
  alerts: { id: string; from: string; reliability: Reliability; access: string; at: string; body: string; read: boolean }[];
  facts: { id: string; group: string; label: string; status: FactStatus; statusLabel: string; text: string; inspected: boolean }[];
  board: {
    id: string;
    lane: Lane;
    label: string;
    owner: string;
    needs: string;
    dependency: string;
    minutes: number;
    consequence: string;
    done: string;
    state: string;
  }[];
  gates: {
    id: string;
    label: string;
    essential: boolean;
    status: GateStatus;
    statusLabel: string;
    escalated: boolean;
    contingency: boolean;
    evidence: string[];
  }[];
  ready: boolean;
  questions: { id: string; prompt: string; options: { id: string; text: string }[] }[];
  handover: Handover;
  variation: { label: string; text: string } | null;
};

/** The desk as the learner sees it now: what has arrived, the record, the cards they can use, the gates. No feedback, codes or future alerts. */
export function deskView(d: DischargeData, s: PivotState): DeskView {
  const x = derive(d, s);
  const takenAt = new Map(x.taken.map((t) => [t.action.id, t.at]));
  const visible = d.actions.filter((a) => takenAt.has(a.id) || x.available.some((y) => y.id === a.id));
  const v = d.variations.find((y) => y.id === s.variation);
  return {
    play: s.mode,
    started: s.started,
    paused: s.paused,
    stage: s.stage,
    clock: {
      minute: s.clock,
      label: timeLabel(d, s.clock),
      discharge: timeLabel(d, d.clock.discharge),
      dischargeText: d.clock.dischargeText,
      left: Math.max(0, d.clock.discharge - s.clock),
      closed: x.closed,
    },
    alerts: [...x.released].reverse().map((r) => ({
      id: r.alert.id,
      from: r.alert.from,
      reliability: r.alert.reliability,
      access: r.alert.access,
      at: timeLabel(d, r.at),
      body: r.alert.body,
      read: s.read.includes(r.alert.id),
    })),
    facts: d.facts.map((f) => ({
      id: f.id,
      group: f.group,
      label: f.label,
      status: x.facts[f.id].status,
      statusLabel: STATUSES[x.facts[f.id].status],
      text: x.facts[f.id].text,
      inspected: s.inspected.includes(f.id),
    })),
    board: visible.map((a) => ({
      id: a.id,
      lane: a.lane,
      label: a.label,
      owner: OWNER_ROLES[a.owner],
      needs: a.needs,
      dependency: a.dependency,
      minutes: a.minutes,
      consequence: a.consequence,
      done: takenAt.has(a.id) ? timeLabel(d, takenAt.get(a.id)!) : "",
      state: a.shows && x.facts[a.shows] ? STATUSES[x.facts[a.shows].status] : "",
    })),
    gates: d.gates.map((g) => ({
      id: g.id,
      label: g.label,
      essential: g.essential,
      status: x.gates[g.id].status,
      statusLabel: GATE_STATUS[x.gates[g.id].status],
      escalated: x.gates[g.id].escalated,
      contingency: x.gates[g.id].contingency,
      evidence: g.facts.map((f) => {
        const fact = d.facts.find((y) => y.id === f);
        return fact ? `${fact.label}: ${STATUSES[x.facts[f].status].toLowerCase()}` : f;
      }),
    })),
    ready: readyNow(d, x),
    questions: d.questions.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options.map((o) => ({ id: o.id, text: o.text })) })),
    handover: s.handover,
    variation: v ? { label: v.label, text: v.text } : null,
  };
}

/** The variation for an attempt: none on the first, then each in turn, so a retry is never the identical case. */
export const variationFor = (d: Pick<DischargeData, "variations">, attemptNo: number) =>
  attemptNo > 1 && d.variations.length ? d.variations[(attemptNo - 2) % d.variations.length].id : "";

// ---------------------------------------------------------------------------------------------
// Authoring: the scenario check, playing every authored path, the sign-off, and the readers' copy
// ---------------------------------------------------------------------------------------------

/** Plays an authored path through the engine, as a learner would. */
export function playPath(d: DischargeData, p: Path) {
  let s = applyMove(d, emptyState(p.variation), { do: "start", mode: p.mode });
  const problems: string[] = [];
  for (const f of d.facts) s = applyMove(d, s, { do: "inspect", fact: f.id });
  for (const step of p.steps) {
    try {
      s = step === "wait" ? applyMove(d, s, { do: "wait", at: s.clock }) : applyMove(d, s, { do: "take", action: step });
      if (step !== "wait" && !s.taken.some((t) => t.id === step)) problems.push(`“${step}” couldn’t be taken.`);
    } catch (e) {
      problems.push(`“${step}”: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  s = applyMove(d, s, { do: "handover" });
  s = applyMove(d, s, {
    do: "record",
    handover: {
      declaration: p.declaration,
      gates: Object.fromEntries(d.gates.map((g) => [g.id, { status: p.gates[g.id] ?? "", owner: g.owners[0] }])),
      answers: p.answers,
    },
  });
  return { state: s, debrief: buildDebrief(d, s), problems };
}

const refsOf = (cs: Cond[]) =>
  cs.flatMap((c) => [c.taken, c.notTaken, c.released, c.fact, c.within?.of, ...(c.within?.actions ?? [])].filter((v): v is string => Boolean(v)));

/**
  What makes the scenario unusable as written: broken references, a confirmation a learner could make by clicking,
  an unreachable card or alert, a gate without an owner, and authored paths that don't end where they say. Every
  defensible path must end without a critical error; there must be at least two different defensible endings.
*/
export function scenarioProblems(d: DischargeData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "72-Hour Discharge Pivot"}”`;
  if (!d.title) out.push(`${where} needs a title.`);
  if (!d.scenarioVersion) out.push(`${where} needs its scenario version.`);
  if (!d.participant.name) out.push(`${where} needs the participant.`);
  if (!(d.clock.discharge > 0)) out.push(`${where} needs the proposed discharge time.`);
  const facts = new Set(d.facts.map((f) => f.id));
  const alerts = new Set(d.alerts.map((a) => a.id));
  const actions = new Set(d.actions.map((a) => a.id));
  const ids = [...d.facts.map((f) => f.id), ...d.alerts.map((a) => a.id), ...d.actions.map((a) => a.id), ...d.gates.map((g) => g.id)];
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push(`${where}: the id “${id}” is used twice.`);
  const known = (id: string) => facts.has(id) || alerts.has(id) || actions.has(id) || id === "wait";
  for (const a of d.alerts) {
    if (!a.from || !a.body) out.push(`${where}: alert “${a.id}” needs who it’s from and what it says.`);
    for (const r of a.after) if (!actions.has(r)) out.push(`${where}: alert “${a.id}” waits for “${r}”, which isn’t an action.`);
    for (const e of a.effects) {
      if (!facts.has(e.fact)) out.push(`${where}: alert “${a.id}” changes “${e.fact}”, which isn’t in the record.`);
      if (CONFIRMING.includes(e.status) && a.reliability !== "verified")
        out.push(`${where}: alert “${a.id}” confirms “${e.fact}”, but it isn’t from a verified source. Only a verified source can confirm.`);
    }
  }
  for (const a of d.actions) {
    const at = `${where}, card “${a.label || a.id}”`;
    if (!a.label || !a.owner) out.push(`${at}: needs its intent and owner.`);
    if (!a.feedback) out.push(`${at}: needs its feedback.`);
    if (!a.source) out.push(`${at}: needs the source its feedback rests on.`);
    if (a.minutes < 0 || a.minutes > 240) out.push(`${at}: its time cost should be between 0 and 240 minutes.`);
    for (const r of a.requires) if (!alerts.has(r) && !actions.has(r)) out.push(`${at}: depends on “${r}”, which isn’t an alert or a card.`);
    for (const e of a.effects) {
      if (!facts.has(e.fact)) out.push(`${at}: changes “${e.fact}”, which isn’t in the record.`);
      if (!ACTION_STATUSES.includes(e.status))
        out.push(
          `${at}: sets “${e.fact}” to ${STATUSES[e.status].toLowerCase()}. A learner’s own action can only request, record or agree; a confirmation has to come from a verified source.`,
        );
    }
    if (a.shows && !facts.has(a.shows)) out.push(`${at}: shows “${a.shows}”, which isn’t in the record.`);
    for (const r of refsOf(a.unless)) if (!known(r)) out.push(`${at}: its exception refers to “${r}”.`);
  }
  for (const g of d.gates) {
    const at = `${where}, gate “${g.label || g.id}”`;
    if (!g.label || !g.owners.length) out.push(`${at}: needs its plain-language label and an owner.`);
    if (!g.facts.length || g.facts.some((f) => !facts.has(f))) out.push(`${at}: needs the record fields it reads.`);
    if (!g.confirmed.length) out.push(`${at}: needs what confirms it.`);
    if (!g.source) out.push(`${at}: needs its source.`);
    for (const r of refsOf([...g.confirmed, ...g.pending, ...g.escalated, ...g.contingency])) if (!known(r)) out.push(`${at}: refers to “${r}”.`);
  }
  if (!d.gates.some((g) => g.essential)) out.push(`${where}: at least one gate must be essential.`);
  for (const dim of DIM_ORDER) {
    if (!d.rubric[dim].length) out.push(`${where}: the rubric needs criteria for ${DIMENSIONS[dim].toLowerCase()}.`);
    for (const c of d.rubric[dim]) for (const r of refsOf(c.when)) if (!known(r)) out.push(`${where}: rubric “${c.text}” refers to “${r}”.`);
  }
  for (const q of d.questions)
    if (q.options.length < 2 || q.options.some((o) => !o.text || !o.feedback))
      out.push(`${where}: the question “${q.prompt}” needs two or more options, each with feedback.`);
  for (const e of DEFENSIBLE) if (!d.endings[e]) out.push(`${where}: the ending “${ENDINGS[e]}” needs its feedback.`);
  if (!d.endings.unsafe || !d.endings.incomplete) out.push(`${where}: the unsafe and incomplete endings need their feedback.`);
  if (!alerts.has(d.gap.alert)) out.push(`${where}: name the alert that opens the essential-service gap.`);
  // Reachability, ignoring time: every card and alert can come up in some play.
  const taken = new Set<string>();
  const released = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const a of d.alerts)
      if (!released.has(a.id) && a.after.every((r) => taken.has(r))) {
        released.add(a.id);
        grew = true;
      }
    for (const a of d.actions)
      if (!taken.has(a.id) && a.requires.every((r) => taken.has(r) || released.has(r))) {
        taken.add(a.id);
        grew = true;
      }
  }
  for (const a of d.actions) if (!taken.has(a.id)) out.push(`${where}: the card “${a.label || a.id}” can never become available.`);
  for (const a of d.alerts) if (!released.has(a.id)) out.push(`${where}: the alert “${a.id}” can never arrive.`);
  // Every authored path plays to the ending it names; the defensible ones without a critical error.
  if (!out.length) {
    for (const p of d.paths) {
      try {
        const r = playPath(d, p);
        for (const pr of r.problems) out.push(`${where}, path “${p.label}”: ${pr}`);
        if (r.debrief.ending !== p.expect) out.push(`${where}, path “${p.label}” ends as “${ENDINGS[r.debrief.ending]}”, not “${ENDINGS[p.expect]}”.`);
        if (DEFENSIBLE.includes(p.expect) && r.debrief.critical.length)
          out.push(`${where}, path “${p.label}” has a critical error: ${r.debrief.critical[0].label}.`);
      } catch (e) {
        out.push(`${where}, path “${p.label}”: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (new Set(d.paths.filter((p) => DEFENSIBLE.includes(p.expect)).map((p) => p.expect)).size < 2)
      out.push(`${where} needs authored paths to at least two different defensible endings.`);
  }
  return [...new Set(out)];
}

/** Every source the block cites. */
export const sourcesOf = (d: DischargeData) => [
  ...new Set([...d.actions.map((a) => a.source), ...d.gates.map((g) => g.source), ...d.alerts.map((a) => a.source)].filter(Boolean)),
];

/** Sources that hold publishing: placeholders, unknown ids, and any under review or withdrawn. */
export function sourceProblems(d: DischargeData, today: string): string[] {
  const where = `“${d.title || "72-Hour Discharge Pivot"}”`;
  return sourcesOf(d).flatMap((id) => {
    const s = dischargeSource(id);
    if (!s) return [`${where} cites “${id}”, which isn’t in the source register.`];
    if (s.placeholder) return [`${where} cites “${s.title}”. Replace it with the current Trilogy Care procedure, and its owner’s contacts, before publishing.`];
    const st = dischargeSourceStatus(id, today);
    return st === "current" ? [] : [`${where} cites “${s.title}”, which is ${st.replace("-", " ")}.`];
  });
}

export const pivotApproved = (d: Pick<DischargeData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.clinical && a.operations && a.policy && a.process && a.learning && a.approvedOn);
};

/** What "Publish anyway" can't waive: the scenario check, the sources, the sign-off, its scenario version and review date. */
export function pivotHardProblems(d: DischargeData, today: string): string[] {
  const where = `“${d.title || "72-Hour Discharge Pivot"}”`;
  const out = [...scenarioProblems(d), ...sourceProblems(d, today)];
  if (!d.jobAid.snippetId) out.push(`${where}: link the Hospital-to-Home Handover Check Job Aid.`);
  if (d.mode === "assessed" && !(d.passMark >= 1 && d.passMark <= MAX_SCORE))
    out.push(`${where}: an assessed version needs a pass mark from 1 to ${MAX_SCORE}.`);
  if (!pivotApproved(d))
    out.push(
      `${where}: record the owner, clinical governance/Quality, Care Partner operations, the Support at Home policy owner, the discharge and escalation process owner, the learning reviewer (rubric and accessibility), and the date.`,
    );
  else if (d.approval.scenarioReviewed !== d.scenarioVersion)
    out.push(`${where}: Review required. The reviewers signed off ${d.approval.scenarioReviewed || "no scenario version"}, and this is ${d.scenarioVersion}.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`${where} was due for review on ${d.approval.reviewBy}.`);
  return [...new Set(out)];
}

/** Whether the block can take a new attempt today: a withdrawn source stops it; a source under review stops assessed attempts. */
export function pivotUsable(d: DischargeData, today: string): { ok: boolean; reason: string } {
  const st = sourcesOf(d).map((id) => dischargeSourceStatus(id, today));
  if (st.includes("withdrawn")) return { ok: false, reason: "This simulation has been withdrawn while a source it rests on is reviewed." };
  if (d.mode === "assessed" && st.includes("review-required"))
    return { ok: false, reason: "Review required: a source this assessed simulation rests on is being reviewed, so a new attempt can’t start yet." };
  return { ok: true, reason: "" };
}

/**
  The learner's copy: the frame only. The record, the alerts, the cards, the gates, the rubric, the endings and the
  debrief come from the attempt API as they arrive, so a reader can't see what's coming, or what scores well.
*/
export function dischargeForReaders<T extends DischargeData>(b: T): T {
  return {
    ...b,
    facts: [],
    alerts: [],
    actions: [],
    gates: [],
    questions: [],
    rubric: { clinical: [], continuity: [], voice: [], funding: [], coordination: [] },
    endings: { confirmed: "", contingency: "", escalated: "", incomplete: "", unsafe: "" },
    gap: { alert: "", actions: [], orderNote: "", followUp: "" },
    variations: [],
    paths: [],
    debrief: "",
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const id = (v: unknown, dflt: string) => (typeof v === "string" && ID.test(v) ? v : dflt);
const ids = (v: unknown, max = 12) => [...new Set(arr(v).filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, max);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.min(max, Math.max(min, Math.floor(Number(v)))) : dflt;
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const status = (v: unknown) => pick(v, STATUS_IDS, "unknown");
const codes = (v: unknown) => [...new Set(arr(v).filter((c): c is Code => typeof c === "string" && c in CODES))];
const effects = (v: unknown): Effect[] =>
  arr(v)
    .slice(0, 8)
    .map((x) => ({ fact: id(obj(x).fact, ""), status: status(obj(x).status), text: s(obj(x).text, 300) }))
    .filter((e) => e.fact);
export function parseCond(v: unknown): Cond {
  const o = obj(v);
  const w = obj(o.within);
  const out: Cond = {};
  if (typeof o.taken === "string") out.taken = id(o.taken, "");
  if (typeof o.notTaken === "string") out.notTaken = id(o.notTaken, "");
  if (typeof o.released === "string") out.released = id(o.released, "");
  if (typeof o.fact === "string") {
    out.fact = id(o.fact, "");
    out.is = arr(o.is).map(status);
  }
  if (o.within) out.within = { actions: ids(w.actions), of: id(w.of, ""), minutes: int(w.minutes, 0, 2000, 60) };
  if (typeof o.answer === "string") {
    out.answer = id(o.answer, "");
    out.in = ids(o.in);
  }
  if (o.owners === true) out.owners = true;
  if (Array.isArray(o.declared)) out.declared = arr(o.declared).filter((x): x is Declaration => typeof x === "string" && x in DECLARATIONS);
  return out;
}
const conds = (v: unknown) => arr(v).slice(0, 8).map(parseCond);
const LANE_IDS = Object.keys(LANES) as Lane[];
const OWNER_IDS = Object.keys(OWNER_ROLES) as OwnerRole[];
const ENDING_IDS = Object.keys(ENDINGS) as EndingId[];

export function parseDischarge(o: Raw, where: string, h: ParseHelpers): DischargeData {
  const { str, unfinished } = h;
  const p = obj(o.participant);
  const sup = obj(o.supporter);
  const cl = obj(o.clock);
  const ru = obj(o.rubric);
  const en = obj(o.endings);
  const gp = obj(o.gap);
  const ja = obj(o.jobAid);
  const ra = obj(o.rationale);
  const ap = obj(o.approval);
  const data: DischargeData = {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 800 }) ?? "",
    scenarioVersion: s(o.scenarioVersion, 60),
    mode: o.mode === "assessed" ? "assessed" : "formative",
    passMark: int(o.passMark, 0, MAX_SCORE, 10),
    participant: { name: s(p.name, 60), about: s(p.about, 800) },
    decisionMaker: s(o.decisionMaker, 600),
    supporter: { name: s(sup.name, 60), relation: s(sup.relation, 60), status: s(sup.status, 300) },
    clock: {
      startDay: s(cl.startDay, 12) || "Wednesday",
      startTime: typeof cl.startTime === "string" && /^\d{1,2}:\d{2}$/.test(cl.startTime) ? cl.startTime : "15:30",
      discharge: int(cl.discharge, 1, 10_080, 1170),
      dischargeText: s(cl.dischargeText, 300),
    },
    facts: arr(o.facts)
      .slice(0, 30)
      .map((x, k) => {
        const f = obj(x);
        return { id: id(f.id, `fact-${k + 1}`), group: s(f.group, 60), label: s(f.label, 120), status: status(f.status), text: s(f.text, 400) };
      }),
    alerts: arr(o.alerts)
      .slice(0, 30)
      .map((x, k) => {
        const a = obj(x);
        const w = obj(a.window);
        return {
          id: id(a.id, `alert-${k + 1}`),
          from: s(a.from, 120),
          reliability: pick(a.reliability, Object.keys(RELIABILITY) as Reliability[], "unverified"),
          access: s(a.access, 300),
          at: int(a.at, 0, 10_080, 0),
          after: ids(a.after),
          delay: int(a.delay, 0, 2000, 0),
          window: {
            ...(w.by !== undefined && w.by !== null && w.by !== "" ? { by: int(w.by, 0, 10_080, 0) } : {}),
            ...(w.from !== undefined && w.from !== null && w.from !== "" ? { from: int(w.from, 0, 10_080, 0) } : {}),
          },
          only: id(a.only, ""),
          notIn: ids(a.notIn),
          body: s(a.body, 1200),
          effects: effects(a.effects),
          confirms: a.confirms === true,
          source: id(a.source, ""),
        };
      }),
    actions: arr(o.actions)
      .slice(0, 40)
      .map((x, k) => {
        const a = obj(x);
        return {
          id: id(a.id, `action-${k + 1}`),
          lane: pick(a.lane, LANE_IDS, "verify"),
          label: s(a.label, 200),
          owner: pick(a.owner, OWNER_IDS, "coordinator"),
          needs: s(a.needs, 300),
          dependency: s(a.dependency, 200),
          requires: ids(a.requires),
          minutes: int(a.minutes, 0, 240, 15),
          consequence: s(a.consequence, 300),
          shows: id(a.shows, ""),
          effects: effects(a.effects),
          codes: codes(a.codes),
          unless: conds(a.unless),
          signal: pick(a.signal, ["", "clinical_gap_identified", "escalation_selected", "funding_route_selected"] as const, ""),
          key: a.key === true,
          verdict: pick(a.verdict, ["strong", "okay", "weak", "unsafe"] as const, "okay"),
          feedback: s(a.feedback, 1200),
          source: id(a.source, ""),
        };
      }),
    gates: arr(o.gates)
      .slice(0, 10)
      .map((x, k) => {
        const g = obj(x);
        return {
          id: id(g.id, `gate-${k + 1}`),
          label: s(g.label, 200),
          essential: g.essential !== false,
          facts: ids(g.facts),
          confirmed: conds(g.confirmed),
          pending: conds(g.pending),
          escalated: conds(g.escalated),
          contingency: conds(g.contingency),
          owners: [...new Set(arr(g.owners).filter((r): r is OwnerRole => typeof r === "string" && r in OWNER_ROLES))],
          source: id(g.source, ""),
        };
      }),
    questions: arr(o.questions)
      .slice(0, 6)
      .map((x, k) => {
        const q = obj(x);
        return {
          id: id(q.id, `question-${k + 1}`),
          prompt: s(q.prompt, 300),
          options: arr(q.options)
            .slice(0, 6)
            .map((y, j) => {
              const op = obj(y);
              return {
                id: id(op.id, `option-${j + 1}`),
                text: s(op.text, 400),
                feedback: s(op.feedback, 900),
                codes: codes(op.codes),
                unless: conds(op.unless),
              };
            }),
        };
      }),
    rubric: Object.fromEntries(
      DIM_ORDER.map((dim) => [
        dim,
        arr(ru[dim])
          .slice(0, 8)
          .map((x, k) => ({ id: id(obj(x).id, `${dim}-${k + 1}`), text: s(obj(x).text, 300), when: conds(obj(x).when) })),
      ]),
    ) as Record<Dim, Criterion[]>,
    endings: Object.fromEntries(ENDING_IDS.map((e) => [e, s(en[e], 1200)])) as Record<EndingId, string>,
    gap: { alert: id(gp.alert, ""), actions: ids(gp.actions), orderNote: s(gp.orderNote, 600), followUp: id(gp.followUp, "") },
    variations: arr(o.variations)
      .slice(0, 6)
      .map((x, k) => ({ id: id(obj(x).id, `variation-${k + 1}`), label: s(obj(x).label, 120), text: s(obj(x).text, 600) })),
    paths: arr(o.paths)
      .slice(0, 10)
      .map((x, k) => {
        const p2 = obj(x);
        const g = obj(p2.gates);
        const an = obj(p2.answers);
        return {
          id: id(p2.id, `path-${k + 1}`),
          label: s(p2.label, 160),
          mode: p2.mode === "untimed" ? "untimed" : "timed",
          variation: id(p2.variation, ""),
          steps: arr(p2.steps)
            .filter((y): y is string => typeof y === "string" && (y === "wait" || ID.test(y)))
            .slice(0, 60),
          declaration: pick(p2.declaration, Object.keys(DECLARATIONS) as Declaration[], "incomplete"),
          gates: Object.fromEntries(Object.entries(g).flatMap(([k2, v]) => (ID.test(k2) && typeof v === "string" && v in STATED ? [[k2, v as Stated]] : []))),
          answers: Object.fromEntries(Object.entries(an).flatMap(([k2, v]) => (ID.test(k2) && typeof v === "string" && ID.test(v) ? [[k2, v]] : []))),
          expect: pick(p2.expect, ENDING_IDS, "incomplete"),
        } satisfies Path;
      }),
    debrief: s(o.debrief, 1500),
    jobAid: { snippetId: s(ja.snippetId, 80), why: s(ja.why, 300) },
    rationale: {
      theme: s(ra.theme, 300),
      themeId: s(ra.themeId, 60),
      themeOwner: s(ra.themeOwner, 120),
      behaviour: s(ra.behaviour, 400),
      barrier: s(ra.barrier, 400),
      whyFit: s(ra.whyFit, 600),
      evidence: s(ra.evidence, 400),
      measure: s(ra.measure, 400),
      systemFix: s(ra.systemFix, 400),
      decision: pick(ra.decision, ["", "accepted", "edited", "rejected"] as const, ""),
    },
    ai: { dialogue: false },
    approval: {
      owner: s(ap.owner, 120),
      clinical: s(ap.clinical, 120),
      operations: s(ap.operations, 120),
      policy: s(ap.policy, 120),
      process: s(ap.process, 120),
      learning: s(ap.learning, 120),
      approvedOn: date(ap.approvedOn),
      effectiveFrom: date(ap.effectiveFrom),
      reviewBy: date(ap.reviewBy),
      scenarioReviewed: s(ap.scenarioReviewed, 60),
    },
  };
  if (!data.actions.length || !data.gates.length) unfinished(`${where} needs its scenario: the record, alerts, cards and readiness gates.`);
  return data;
}
