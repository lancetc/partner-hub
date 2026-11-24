import {
  calculate,
  cleanInputs,
  dateLabel,
  isFresh,
  SERVICES,
  SUPPLY_STATES,
  TAXONOMY_VERSION,
  validateInputs,
  windowLabel,
  type CoverageInputs,
  type CoverageResult,
  type Service,
  type SupplyRow,
} from "./suburbCoverage";
import { AXES, FIELD_STATES, vettingOutcome, type Axes, type Axis, type AxisState, type FieldState } from "./auditorVetting";

/*
  Build Your Local Bench: the Contractor Network Builder's fictional block and the rules its Work Tool shares
  (docs/network-builder.md). From the PRD "Contractor Network Builder and Quality Scorecard" (21 November 2026).

  Nothing new is invented where the Hub already has it:
  - Demand, supply and coverage arithmetic are Local Coverage's (lib/suburbCoverage, `network-taxonomy-1`): a service
    need slot is a DemandCell, a contractor is a SupplyRow, and `calculate` decides what counts. Interest, evidence in
    progress and provider verification are never capacity there, and neither is availability older than the owner's
    freshness rule.
  - Evidence and screening use the Contractor Vetting Card's field states, checks and outcome rule (lib/auditorVetting):
    an ABN and an insurance certificate can't make anyone ready, because every required check has to be resolved.
  - Service reliability is the Service Reliability Calculator's (the "reliability" block): linked, not copied.

  What this file adds:
  - The pipeline: candidate → contacted → evidence in progress → provider verification → provider approved for scope →
    availability confirmed → booked. A stage can't be skipped, and only its owner moves a card into it: the Care
    Partner records interest, opens the role checklist and submits to onboarding; the provider approves; scheduling
    confirms availability and bookings. Paused, restricted and expired are holds beside the stages, not stages.
  - Role-specific requirement profiles: a gardener's and a nurse's checklists are different reviewed profiles.
  - The quality scorecard: six dimensions, each with its numerator, denominator, period, source and last review, and no
    total. Under five observations, a rate isn't shown: "limited evidence", which isn't a poor rating. Allegations stay
    in the authorised Quality workflow; a Care Partner sees a neutral status and the next step.
  - Outreach drafts from a reviewed template: locked claims and short editable local fields, checked for participant
    details, guarantees and rates before they can be copied. Copying is never sending.
  - The simulation: the North Brisbane early-morning gap, a deterministic diagnosis, decisions, a second reveal, a
    quality review and a seven-dimension rubric (0–3 each) with critical flags no total can cancel.

  Deterministic throughout, and no AI: any AI drafting is a disabled stub (`ai.drafting: false`).
*/

export const BENCH_VERSION = "network-bench-1";
export const RUBRIC_VERSION = "network-rubric-1";
export const RULES_VERSION = "network-rules-1";
export { TAXONOMY_VERSION };

// ---------------------------------------------------------------------------------------------
// The pipeline: stages, holds and who moves a card
// ---------------------------------------------------------------------------------------------

export const STAGES = {
  candidate: "Identified candidate",
  interested: "Contacted / interested",
  evidence: SUPPLY_STATES.evidence,
  verification: SUPPLY_STATES.verification,
  approved: "Provider approved for scope",
  available: "Availability confirmed",
  booked: "Booked / active",
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_ORDER = Object.keys(STAGES) as Stage[];
export const STAGE_HINTS: Record<Stage, string> = {
  candidate: "A possible provider or worker from a lawful contact source. Not ready supply.",
  interested: "They’ve said they’re interested, perhaps with a rate or an area. Interest isn’t approval. Not ready supply.",
  evidence: "Their evidence is being gathered on the right role checklist. Not ready supply.",
  verification: "The provider’s authorised owner is checking the evidence and the arrangement. Not ready supply.",
  approved: "Approved for a named service and period. Potential supply only: a shift still needs confirmed availability and a booking.",
  available: "They’ve recently confirmed a place, a time window and hours. Counts for planning, subject to reconfirmation and the participant’s agreement.",
  booked: "Confirmed through the scheduling process. Counts as booked delivery, not spare capacity.",
};
/** Who may move a card into each stage. A Care Partner never approves, confirms availability or books. */
export const STAGE_OWNER: Record<Stage, Actor> = {
  candidate: "partner",
  interested: "partner",
  evidence: "partner",
  verification: "partner",
  approved: "provider",
  available: "scheduling",
  booked: "scheduling",
};
export const ACTORS = {
  partner: "The Care Partner",
  provider: "The provider’s authorised onboarding owner",
  scheduling: "The provider’s scheduling process",
} as const;
export type Actor = keyof typeof ACTORS;

/** Beside the stages: something stops matching until the accountable owner changes it. */
export const HOLDS = {
  paused: "Paused",
  restricted: "Restricted by authorised owner",
  expired: "Approval or required check expired",
} as const;
export type Hold = keyof typeof HOLDS;

/** The plain status a card shows, in words and an icon, never colour alone. */
export const CALM = { confirmed: "Confirmed", verify: "Verify", unavailable: "Not available", restricted: "Restricted by owner" } as const;
export type Calm = keyof typeof CALM;

/** A pipeline stage from a Local Coverage supply row: its state, plus whether its availability is confirmed and fresh. */
export function stageOf(row: SupplyRow, asOf: string, freshDays: number | null): { stage: Stage; hold: Hold | ""; staleAvailability: boolean } {
  if (row.state === "paused" || row.state === "restricted" || row.state === "expired") return { stage: "approved", hold: row.state, staleAvailability: false };
  if (row.state !== "approved") return { stage: row.state, hold: "", staleAvailability: false };
  const confirmed = row.slots.some((s) => s.status === "confirmed");
  const booked = row.slots.length > 0 && row.slots.every((s) => s.status === "booked");
  if (booked) return { stage: "booked", hold: "", staleAvailability: false };
  if (!confirmed) return { stage: "approved", hold: "", staleAvailability: false };
  const fresh = isFresh(row.verifiedOn, asOf, freshDays);
  // Stale availability reverts to unconfirmed; the approval stays as it was.
  return { stage: fresh ? "available" : "approved", hold: "", staleAvailability: !fresh };
}

export const calmOf = (s: { stage: Stage; hold: Hold | "" }): Calm =>
  s.hold === "restricted" || s.hold === "expired"
    ? "restricted"
    : s.hold === "paused"
      ? "unavailable"
      : s.stage === "available" || s.stage === "booked"
        ? "confirmed"
        : "verify";

/** The evidence every role sends before verification can start, whatever else its profile adds. Nothing sent is never assumed. */
export const CORE_EVIDENCE: readonly Axis[] = ["entity_identity", "worker_identity", "screening_route", "screening_status", "insurance_status"];

/** What a card's evidence says, in the Vetting Card's words: its outcome and what's still open. */
export function evidenceOf(axes: Axes, required: readonly Axis[] = CORE_EVIDENCE) {
  const v = vettingOutcome(axes);
  const missing = v.open.filter((x) => x.state === "material_gap" && !x.barrier);
  const barrier = v.open.some((x) => x.state === "material_gap" && x.barrier);
  const unsent = required.filter((k) => !axes[k]);
  return {
    outcome: v.outcome,
    /** Everything the checklist asks for has been sent: nothing missing, nothing a correctable gap. Verification can start. */
    submitted: missing.length === 0 && unsent.length === 0 && !barrier,
    /** Every required check is resolved. Still not an approval: the provider decides. */
    resolved: v.outcome === "ready",
    barrier,
    open: v.open,
  };
}

export type Advance = { ok: true } | { ok: false; reason: string };

/**
  Whether a card may move to `to`, by `actor`. One stage at a time, never backwards here, never on hold, and only by
  the stage's owner. Into verification, every checklist item must have been sent; into approval, every required check
  must be resolved and the scope and period named; into availability, a dated, fresh window.
*/
export function canAdvance(
  card: { stage: Stage; hold: Hold | ""; evidence: Axes; scope: Service[]; approvedUntil: string; availabilityVerifiedOn: string },
  to: Stage,
  actor: Actor,
  asOf: string,
  freshDays: number | null,
): Advance {
  const from = STAGE_ORDER.indexOf(card.stage);
  const at = STAGE_ORDER.indexOf(to);
  if (card.hold) return { ok: false, reason: `${HOLDS[card.hold]}: only the accountable owner can change that.` };
  if (at <= from) return { ok: false, reason: `Already at “${STAGES[card.stage]}”.` };
  if (at !== from + 1) return { ok: false, reason: `Stages can’t be skipped: “${STAGES[STAGE_ORDER[from + 1]]}” comes before “${STAGES[to]}”.` };
  if (STAGE_OWNER[to] !== actor) return { ok: false, reason: `Only ${ACTORS[STAGE_OWNER[to]].toLowerCase()} can move a card to “${STAGES[to]}”.` };
  const ev = evidenceOf(card.evidence);
  if (to === "verification" && !ev.submitted)
    return {
      ok: false,
      reason: ev.barrier
        ? "A required check can’t be met as proposed. It goes to the provider’s owner to decide, not into verification."
        : "Something on the role checklist hasn’t been sent yet. Verification starts when every item is in.",
    };
  if (to === "approved") {
    if (!ev.resolved)
      return { ok: false, reason: "A required check isn’t resolved yet. An ABN or an insurance certificate on its own never makes anyone approved." };
    if (!card.scope.length) return { ok: false, reason: "An approval names the services it covers." };
    if (!card.approvedUntil || card.approvedUntil < asOf) return { ok: false, reason: "An approval needs a current end date." };
  }
  if (to === "available" && !isFresh(card.availabilityVerifiedOn, asOf, freshDays))
    return { ok: false, reason: "Availability needs a recent, dated confirmation of the place, window and hours." };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Role-specific requirement profiles (the checklist)
// ---------------------------------------------------------------------------------------------

export const REQUIREMENTS = {
  required: "Required",
  conditional: "Conditional",
  na: "Not applicable",
  owner: "Needs owner review",
} as const;
export type Requirement = keyof typeof REQUIREMENTS;
export type ProfileItem = { axis: Axis; label: string; requirement: Requirement; why: string; source: string };
export type Profile = {
  id: string;
  label: string;
  service: Service;
  /** The kind of arrangement: sole trader, a business, an agency's worker. */
  arrangement: string;
  items: ProfileItem[];
  owner: string;
  version: string;
  /** When the profile's owner last reviewed it; "" not yet. */
  reviewedOn: string;
};

/** The checklist a profile gives: each item's requirement, with its source, and anything still for the owner to decide. */
export function checklistOf(p: Profile) {
  return {
    rows: p.items.map((i) => ({ ...i, axisLabel: AXES[i.axis], requirementLabel: REQUIREMENTS[i.requirement] })),
    ownerReview: p.items.filter((i) => i.requirement === "owner").map((i) => i.label),
    unreviewed: !p.reviewedOn,
  };
}

// ---------------------------------------------------------------------------------------------
// The quality scorecard: no single score
// ---------------------------------------------------------------------------------------------

export const QUALITY_DIMS = {
  reliability: "Reliability",
  fit: "Service fit",
  experience: "Experience and communication",
  billing: "Billing accuracy",
  safety: "Safety and quality follow-up",
  continuity: "Continuity",
} as const;
export type QualityDim = keyof typeof QUALITY_DIMS;
export const QUALITY_ORDER = Object.keys(QUALITY_DIMS) as QualityDim[];

export const SCORE_STATUS = {
  current: "Current and observed",
  limited: "Limited evidence",
  reviewDue: "Review due",
  actionOpen: "Quality action open",
  restricted: "Restricted by authorised owner",
  unavailable: "Unavailable",
  expired: "Expired check",
} as const;
export type ScoreStatus = keyof typeof SCORE_STATUS;

/** Under this many observations, a rate could mislead or point to one person: it isn't shown. */
export const SMALL_N = 5;

export type Metric = {
  id: string;
  dim: QualityDim;
  label: string;
  /** null: not counted (a fact in words instead). */
  numerator: number | null;
  denominator: number | null;
  period: string;
  source: string;
  lastReview: string;
  /** What's missing or excluded, in words: e.g. participant-requested cancellations aren't counted against the worker. */
  missing: string;
  note: string;
};
export type Scorecard = {
  worker: string;
  role: string;
  reviewOwner: string;
  metrics: Metric[];
  strengths: string[];
  concerns: string[];
  /** The contractor's own response or clarification. */
  response: string;
  /** A provider-owned restriction or open Quality action: the neutral reason a Care Partner sees. */
  restriction: { active: boolean; owner: string; neutral: string };
  qualityAction: { open: boolean; ref: string };
  checksValidUntil: string;
  reviewBy: string;
  available: boolean;
  /** Quality detail that stays in the authorised Quality workflow: never sent to a Care Partner. */
  qualityDetail?: string;
};

export type MetricView = Metric & { rate: number | null; suppressed: boolean; text: string };

/** One metric for display: a rate only from five observations up, always with its counts, period and source. */
export function metricView(m: Metric): MetricView {
  const counted = m.numerator !== null && m.denominator !== null;
  const suppressed = counted && m.denominator! < SMALL_N;
  const rate = counted && !suppressed && m.denominator! > 0 ? Math.round((m.numerator! / m.denominator!) * 100) : null;
  const text = !counted
    ? m.note || "Not counted: see the note."
    : suppressed
      ? `Limited evidence: fewer than ${SMALL_N} observations (${m.denominator}), so no rate is shown.`
      : `${m.numerator} of ${m.denominator}${rate !== null ? ` (${rate}%)` : ""}`;
  return { ...m, rate, suppressed, text };
}

export type ScorecardView = {
  worker: string;
  role: string;
  reviewOwner: string;
  statuses: ScoreStatus[];
  dims: { dim: QualityDim; label: string; metrics: MetricView[] }[];
  strengths: string[];
  concerns: string[];
  response: string;
  restriction: string;
  checksValidUntil: string;
  reviewBy: string;
};

/**
  The scorecard a viewer may see. There is no total, average or rank anywhere in it. A Care Partner (and a learner)
  sees a provider-owned restriction only as its neutral reason and next step; the Quality detail never leaves the
  Quality workflow.
*/
export function scorecardView(s: Scorecard, asOf: string): ScorecardView {
  const metrics = s.metrics.map(metricView);
  const statuses: ScoreStatus[] = [];
  if (s.restriction.active) statuses.push("restricted");
  if (s.qualityAction.open) statuses.push("actionOpen");
  if (s.checksValidUntil && s.checksValidUntil < asOf) statuses.push("expired");
  if (!s.available) statuses.push("unavailable");
  if (s.reviewBy && s.reviewBy < asOf) statuses.push("reviewDue");
  if (metrics.some((m) => m.suppressed) || !metrics.some((m) => m.numerator !== null)) statuses.push("limited");
  if (metrics.some((m) => m.numerator !== null && !m.suppressed) && !statuses.includes("restricted") && !statuses.includes("expired"))
    statuses.unshift("current");
  return {
    worker: s.worker,
    role: s.role,
    reviewOwner: s.reviewOwner,
    statuses,
    dims: QUALITY_ORDER.map((dim) => ({ dim, label: QUALITY_DIMS[dim], metrics: metrics.filter((m) => m.dim === dim) })).filter((d) => d.metrics.length),
    strengths: s.strengths,
    concerns: s.concerns,
    response: s.response,
    restriction: s.restriction.active ? `${s.restriction.neutral} (owner: ${s.restriction.owner || "the provider"})` : "",
    checksValidUntil: s.checksValidUntil,
    reviewBy: s.reviewBy,
  };
}

// ---------------------------------------------------------------------------------------------
// Outreach: a reviewed template, locked claims and short local fields
// ---------------------------------------------------------------------------------------------

export type OutreachField = { id: string; label: string; hint: string; max: number };
export type OutreachTemplate = {
  id: string;
  version: string;
  /** Locked: Marketing/Partnerships approve the brand and recruitment language. */
  subject: string;
  intro: string;
  callGuide: string[];
  followUp: string;
  /** Claims that can't be edited: eligibility, approval, volume and pay. */
  locked: { id: string; text: string }[];
  fields: OutreachField[];
  approvalState: "draft" | "approved";
  owner: string;
};
export type OutreachInput = { profile: string; fields: Record<string, string> };

/** Words a general outreach draft can't hold: a guarantee, a rate, a start promise, or contact and identity details. */
const GUARANTEE =
  /\b(guarantee[sd]?|promise[sd]?|start (?:on )?(?:mon|tues|wednes|thurs|fri|satur|sun)day|start (?:tomorrow|today|immediately|straight away)|definitely|assured)\b/i;
const RATE = /\$\s*\d|\b\d+(?:\.\d+)?\s*(?:dollars|per hour|an hour|\/\s*h(?:ou)?r)\b/i;
const HOURS_PROMISE = /\b\d+\s*(?:hours?|hrs?)\s*(?:a|per)\s*week\b/i;
const CONTACT =
  /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?61|0)[2-478](?:[ -]?\d){8}|\b\d{1,4}\s+\w+\s+(?:street|st|road|rd|avenue|ave|court|ct|drive|dr|place|pl|lane)\b/i;
const TITLED = /\b(?:[Mm]rs?|[Mm]s|[Mm]iss|[Dd]r)\.?\s+[A-Z][a-z]+/;

/** What stops a draft being copied, in words. `people` are the case's participant labels and anything else identifying. */
export function outreachProblems(t: OutreachTemplate, input: OutreachInput, profiles: Profile[], people: string[] = []): string[] {
  const out: string[] = [];
  const p = profiles.find((x) => x.id === input.profile);
  if (!p) out.push("Choose the role this brief is for: the checklist comes from that role’s reviewed profile.");
  for (const f of t.fields) {
    const v = (input.fields[f.id] ?? "").trim();
    if (!v) out.push(`Fill in “${f.label}”.`);
    else if (v.length > f.max) out.push(`“${f.label}” is longer than ${f.max} characters.`);
  }
  const all = Object.values(input.fields).join("\n");
  if (CONTACT.test(all)) out.push("Take out the contact or address details: general outreach never carries anyone’s address, phone or email.");
  if (TITLED.test(all) || people.some((n) => n && all.toLowerCase().includes(n.toLowerCase())))
    out.push("Take out the participant’s details: general outreach never names or describes a participant.");
  if (GUARANTEE.test(all)) out.push("Take out the promise: the draft can’t guarantee work, a start date or an approval.");
  if (RATE.test(all)) out.push("Take out the rate: pay and price are agreed through the provider’s process, not in outreach.");
  if (HOURS_PROMISE.test(all)) out.push("Take out the weekly hours: an unverified work volume isn’t something outreach can offer.");
  return out;
}

/** The three drafts (introduction, call guide, follow-up), with the locked claims and the role checklist. Always a draft. */
export function outreachDraft(t: OutreachTemplate, input: OutreachInput, profiles: Profile[]) {
  const fill = (s: string) => s.replace(/\[(\w+)\]/g, (_, k: string) => (input.fields[k] ?? "").trim() || `[${k}]`);
  const p = profiles.find((x) => x.id === input.profile);
  return {
    watermark: "DRAFT for review. Not sent: copying it doesn’t send it.",
    subject: fill(t.subject),
    intro: [fill(t.intro), ...t.locked.map((l) => l.text)].join("\n\n"),
    callGuide: t.callGuide.map(fill),
    followUp: fill(t.followUp),
    checklist: p ? checklistOf(p) : null,
    profile: p?.label ?? "",
    templateVersion: t.version,
    approvalState: t.approvalState,
  };
}

// ---------------------------------------------------------------------------------------------
// The simulation: data
// ---------------------------------------------------------------------------------------------

export const DIMS = {
  diagnosis: "Gap diagnosis",
  supply: "Supply reasoning",
  honesty: "Participant choice and honesty",
  safeguards: "Provider safeguards",
  outreach: "Outreach precision",
  quality: "Quality judgement",
  followThrough: "Follow-through",
} as const;
export type Dim = keyof typeof DIMS;
export const DIM_ORDER = Object.keys(DIMS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong" };
export const MAX_SCORE = DIM_ORDER.length * 3;

/** The PRD's critical flags (section 17) first: in any mode, no total cancels one. */
export const CODES = {
  unverifiedStart: "Suggested an unverified worker start straight away",
  readyFromClaim: "Counted a candidate’s own statement as ready supply",
  ignoredChoice: "Set aside the participant’s chosen worker without review",
  promisedStart: "Promised a start without confirmed availability and the provider’s process",
  outOfScope: "Counted or used a worker outside their approved scope",
  identityInOutreach: "Put participant details in general outreach",
  hidRestriction: "Hid a quality restriction",
  blacklist: "Treated one uninvestigated concern as a public blacklist",
  countedDaytime: "Counted daytime-only availability against an early-morning gap",
  classificationAsDemand: "Measured the gap by funding classification or contractor count, not service slots",
  priceShortcut: "Settled the price without the price owner or the participant’s agreement",
  genericOutreach: "Used a generic “we need everyone” brief instead of the actual gap",
  overreactRating: "Read one report or rating as the whole quality record",
  greenMap: "Aimed to fill the map green rather than meet the need",
} as const;
export type Code = keyof typeof CODES;
export const CRITICAL: readonly Code[] = [
  "unverifiedStart",
  "readyFromClaim",
  "ignoredChoice",
  "promisedStart",
  "outOfScope",
  "identityInOutreach",
  "hidRestriction",
  "blacklist",
];
/** How far a code caps a dimension, whatever else was done: one table a reviewer reads. */
export const CODE_CAPS: Record<Code, Partial<Record<Dim, Level>>> = {
  unverifiedStart: { safeguards: 0 },
  readyFromClaim: { supply: 0, safeguards: 1 },
  ignoredChoice: { honesty: 0 },
  promisedStart: { honesty: 0 },
  outOfScope: { supply: 0 },
  identityInOutreach: { outreach: 0 },
  hidRestriction: { quality: 0, honesty: 1 },
  blacklist: { quality: 0 },
  countedDaytime: { supply: 1 },
  classificationAsDemand: { diagnosis: 1 },
  priceShortcut: { safeguards: 1 },
  genericOutreach: { outreach: 1 },
  overreactRating: { quality: 1 },
  greenMap: { followThrough: 1 },
};

export const ENDINGS = {
  phased: "A phased start with honestly confirmed visits",
  central: "A request for central supply support, with an honest update",
  chosen: "The participant’s chosen worker, approved by the provider",
  cannot: "The chosen arrangement can’t proceed: explained respectfully, with options",
  green: "Not valid: the map filled green, the need not met",
  unsafe: "A critical error",
} as const;
export type EndingId = keyof typeof ENDINGS;
export const VALID_ENDINGS: readonly EndingId[] = ["phased", "central", "chosen", "cannot"];

export const MEASURES = {
  slots: "Approved service hours by service, place and time window",
  classification: "Participants at funding classifications 3 and 4",
  count: "Contractors listed nearby",
} as const;
export type Measure = keyof typeof MEASURES;

/** What a supply card adds to its Local Coverage row: its evidence, profile and what they've said. Never a name or contact. */
export type BenchCard = {
  /** The SupplyRow id. */
  id: string;
  /** "Sole trader", "Agency-supplied worker", "Gardening business". */
  arrangement: string;
  profile: string;
  evidence: Axes;
  /** Services the provider has approved them for, and until when; empty: not approved. */
  scope: Service[];
  approvedUntil: string;
  /** What they've said themselves, in a line: a claim, not a fact. */
  claim: string;
  /** Travel, setup and other commitments, in words. */
  travel: string;
};

export type Option = { id: string; text: string; feedback: string; levels: Partial<Record<Dim, Level>>; codes: Code[]; ending?: EndingId; only?: string };
export const SIGNALS = ["", "participant_choice_branch_selected", "contingency_selected", "quality_evidence_reviewed"] as const;
export type Signal = (typeof SIGNALS)[number];
export type Step = { id: string; phase: "before" | "after" | "quality"; title: string; prompt: string; signal: Signal; options: Option[] };
/** A change to the case: a supply row's state, areas, availability or verified date, or a new row. */
export type Patch = { row: SupplyRow; card?: BenchCard };
export type Variation = { id: string; label: string; text: string; reveal: Patch[]; scorecard?: Scorecard };

export type NetworkData = {
  title: string;
  intro: string;
  scenarioVersion: string;
  mode: "formative" | "assessed";
  passMark: number;
  story: { character: string; role: string; situation: string; dilemma: string };
  /** How the case refers to its participants ("Participant 1"): words general outreach must never carry. */
  people: string[];
  /** The fictional case, as Local Coverage inputs: the areas, the need slots and the supply rows. */
  inputs: CoverageInputs;
  cards: BenchCard[];
  /** The misleading headline the map starts with ("five contractors nearby"). */
  headline: string;
  steps: Step[];
  /** The second reveal: its date, the date the schedule was re-confirmed (demand doesn't change), and the supply changes. */
  later: { asOf: string; demandVerifiedOn: string; text: string; patches: Patch[] };
  profiles: Profile[];
  /** The profile a brief for this gap should use. */
  gapProfile: string;
  /** Words the outreach fields must mention: the gap's area and its time window. */
  gapWords: { area: string[]; window: string[] };
  outreach: OutreachTemplate;
  scorecard: Scorecard;
  variations: Variation[];
  endings: Record<EndingId, string>;
  debrief: string;
  jobAid: { snippetId: string; why: string };
  related: { label: string; href: string; why: string }[];
  /** Why this block (the AI Learning Designer's recommendation card), versioned with the scenario. */
  rationale: {
    signal: string;
    behaviour: string;
    evidence: string;
    whyFit: string;
    existing: string;
    systemFix: string;
    owner: string;
    measure: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  /** AI drafting and narration: a disabled stub in this release (no paid call). */
  ai: { drafting: false };
  approval: {
    owner: string;
    operations: string;
    onboarding: string;
    quality: string;
    partnerships: string;
    finance: string;
    privacy: string;
    learning: string;
    approvedOn: string;
    reviewBy: string;
    scenarioReviewed: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state, and its moves
// ---------------------------------------------------------------------------------------------

export type Diagnosis = {
  measure: Measure | "";
  planned: number | null;
  booked: number | null;
  unfilled: number | null;
  ready: number | null;
  counted: string[];
};
export type BenchState = {
  variation: string;
  opened: string[];
  diagnosis: Diagnosis | null;
  answers: Record<string, string>;
  outreach: (OutreachInput & { copied: boolean }) | null;
  revealed: boolean;
};
export const emptyState = (variation = ""): BenchState => ({ variation, opened: [], diagnosis: null, answers: {}, outreach: null, revealed: false });

export type Move =
  | { do: "open"; card: string }
  | { do: "diagnose"; diagnosis: Diagnosis }
  | { do: "answer"; step: string; option: string }
  | { do: "outreach"; outreach: OutreachInput }
  | { do: "copy" }
  | { do: "reveal" };
export class MoveError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(500, Math.round(v * 10) / 10)) : null);
const ids = (v: unknown, max = 12) =>
  [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)))].slice(0, max);

export function cleanDiagnosis(v: unknown): Diagnosis {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    measure: typeof o.measure === "string" && o.measure in MEASURES ? (o.measure as Measure) : "",
    planned: numOrNull(o.planned),
    booked: numOrNull(o.booked),
    unfilled: numOrNull(o.unfilled),
    ready: numOrNull(o.ready),
    counted: ids(o.counted),
  };
}
export function cleanOutreach(v: unknown, t: Pick<OutreachTemplate, "fields">): OutreachInput {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const f = (o.fields && typeof o.fields === "object" ? o.fields : {}) as Record<string, unknown>;
  return {
    profile: typeof o.profile === "string" ? o.profile.slice(0, 40) : "",
    fields: Object.fromEntries(t.fields.map((x) => [x.id, typeof f[x.id] === "string" ? (f[x.id] as string).slice(0, x.max + 40) : ""])),
  };
}

export function parseMove(raw: unknown): Move | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && /^[a-z0-9-]{1,48}$/.test(v) ? v : "");
  switch (o.do) {
    case "open":
      return id(o.card) ? { do: "open", card: id(o.card) } : null;
    case "diagnose":
      return { do: "diagnose", diagnosis: cleanDiagnosis(o.diagnosis) };
    case "answer":
      return id(o.step) && id(o.option) ? { do: "answer", step: id(o.step), option: id(o.option) } : null;
    case "outreach":
      return o.outreach && typeof o.outreach === "object" ? { do: "outreach", outreach: o.outreach as OutreachInput } : null;
    case "copy":
      return { do: "copy" };
    case "reveal":
      return { do: "reveal" };
    default:
      return null;
  }
}

export const stepsIn = (d: Pick<NetworkData, "steps">, phase: Step["phase"]) => d.steps.filter((s) => s.phase === phase);
export const optionsFor = (s: Step, variation: string) => s.options.filter((o) => !o.only || o.only === variation);
const answered = (d: NetworkData, s: BenchState, phase: Step["phase"]) => stepsIn(d, phase).every((x) => s.answers[x.id]);
const peopleOf = (d: Pick<NetworkData, "people">) => d.people;

/** Where the attempt is: what the learner can do next. */
export function phaseOf(d: NetworkData, s: BenchState): "map" | "before" | "outreach" | "reveal" | "after" | "quality" | "submit" {
  if (!s.diagnosis) return "map";
  if (!answered(d, s, "before")) return "before";
  if (!s.outreach || outreachProblems(d.outreach, s.outreach, d.profiles, peopleOf(d)).length) return "outreach";
  if (!s.revealed) return "reveal";
  if (!answered(d, s, "after")) return "after";
  if (!answered(d, s, "quality")) return "quality";
  return "submit";
}

/**
  One move. The order is the PRD's decision sequence: open cards and diagnose, decide (protect, the chosen worker, the
  offer), draft the brief, see the second reveal, plan the rest, then review quality. An answer, once given, stands;
  sending it again changes nothing, so a retried request never duplicates a choice.
*/
export function applyMove(d: NetworkData, s: BenchState, m: Move): BenchState {
  const phase = phaseOf(d, s);
  switch (m.do) {
    case "open":
      if (!d.inputs.supply.some((r) => r.id === m.card) && !revealRows(d, s).some((r) => r.id === m.card)) throw new MoveError("That card isn’t on the map.");
      return s.opened.includes(m.card) ? s : { ...s, opened: [...s.opened, m.card] };
    case "diagnose": {
      const x = cleanDiagnosis(m.diagnosis);
      // A resent diagnosis changes nothing, whenever it arrives.
      if (s.diagnosis && JSON.stringify(x) === JSON.stringify(s.diagnosis)) return s;
      if (s.revealed) throw new MoveError("The diagnosis is set: the case has moved on.");
      if (!s.opened.length) throw new MoveError("Open at least one contractor card first: the label on the map isn’t the whole story.");
      if (!x.measure || x.planned === null || x.booked === null || x.unfilled === null || x.ready === null)
        throw new MoveError("Choose the measure and enter all four figures (0 is a figure).");
      if (stepsIn(d, "before").some((st) => s.answers[st.id])) throw new MoveError("The diagnosis is set: you’ve started deciding on it.");
      return { ...s, diagnosis: x };
    }
    case "answer": {
      const step = d.steps.find((x) => x.id === m.step);
      if (!step) throw new MoveError("That decision isn’t in this case.");
      if (!optionsFor(step, s.variation).some((o) => o.id === m.option)) throw new MoveError("That isn’t one of the choices.");
      if (s.answers[step.id]) {
        if (s.answers[step.id] === m.option) return s;
        throw new MoveError("You’ve already decided this one. The debrief shows how it went.");
      }
      const open = step.phase === "before" ? phase === "before" : step.phase === "after" ? phase === "after" : phase === "quality";
      if (!open)
        throw new MoveError(
          step.phase === "before"
            ? "Diagnose the gap first."
            : step.phase === "after"
              ? "That comes after the reveal."
              : "That comes after you’ve planned the rest of the gap.",
        );
      return { ...s, answers: { ...s.answers, [step.id]: m.option } };
    }
    case "outreach": {
      const o = cleanOutreach(m.outreach, d.outreach);
      // A resent draft changes nothing, whenever it arrives.
      if (s.outreach && JSON.stringify({ profile: s.outreach.profile, fields: s.outreach.fields }) === JSON.stringify(o)) return s;
      if (phase === "map" || phase === "before") throw new MoveError("Decide the first steps before drafting outreach.");
      if (s.revealed) throw new MoveError("The brief went out before the reveal: it’s kept as it was.");
      return { ...s, outreach: { ...o, copied: false } };
    }
    case "copy": {
      if (!s.outreach) throw new MoveError("Draft the brief first.");
      const problems = outreachProblems(d.outreach, s.outreach, d.profiles, peopleOf(d));
      if (problems.length) throw new MoveError(`Not yet. ${problems[0]}`);
      return s.outreach.copied ? s : { ...s, outreach: { ...s.outreach, copied: true } };
    }
    case "reveal":
      if (s.revealed) return s;
      if (phase !== "reveal")
        throw new MoveError(
          phase === "outreach"
            ? "Finish the brief first: it needs every field, and nothing it can’t say."
            : "Diagnose the gap, make the first decisions and draft the brief first.",
        );
      return { ...s, revealed: true };
  }
}

// ---------------------------------------------------------------------------------------------
// Replaying the case
// ---------------------------------------------------------------------------------------------

const variationOf = (d: Pick<NetworkData, "variations">, id: string) => d.variations.find((v) => v.id === id);
/** The retry variation for an attempt: the first attempt plays the case as written, then each variation in turn. */
export const variationFor = (d: Pick<NetworkData, "variations">, attemptNo: number) =>
  attemptNo <= 1 || !d.variations.length ? "" : d.variations[(attemptNo - 2) % d.variations.length].id;

/** The reveal's changes for this attempt: the case's own, with the variation's replacing any for the same row. */
function patchesOf(d: NetworkData, s: Pick<BenchState, "variation">): Patch[] {
  const v = variationOf(d, s.variation);
  return [...d.later.patches.filter((p) => !v?.reveal.some((q) => q.row.id === p.row.id)), ...(v?.reveal ?? [])];
}
const revealRows = (d: NetworkData, s: Pick<BenchState, "variation">) => patchesOf(d, s).map((p) => p.row);

/** The case's inputs: as it starts, or after the reveal (with the attempt's variation). */
export function inputsAt(d: NetworkData, s: Pick<BenchState, "variation">, after: boolean): CoverageInputs {
  if (!after) return d.inputs;
  const rows = revealRows(d, s);
  const supply = [...d.inputs.supply.map((r) => rows.find((x) => x.id === r.id) ?? r), ...rows.filter((x) => !d.inputs.supply.some((r) => r.id === x.id))];
  const demand = d.later.demandVerifiedOn ? d.inputs.demand.map((c) => ({ ...c, verifiedOn: d.later.demandVerifiedOn })) : d.inputs.demand;
  return { ...d.inputs, asOf: d.later.asOf || d.inputs.asOf, demand, supply };
}
export function cardsAt(d: NetworkData, s: Pick<BenchState, "variation">, after: boolean): BenchCard[] {
  if (!after) return d.cards;
  const changed = patchesOf(d, s).flatMap((p) => (p.card ? [p.card] : []));
  return [...d.cards.map((c) => changed.find((x) => x.id === c.id) ?? c), ...changed.filter((x) => !d.cards.some((c) => c.id === x.id))];
}
export const scorecardFor = (d: NetworkData, s: Pick<BenchState, "variation">) => variationOf(d, s.variation)?.scorecard ?? d.scorecard;

/** The gap, in total and in early-morning hours: the map and the list read this same result. */
export function totals(r: CoverageResult) {
  const hours = r.cells.filter((c) => c.unit === "hours");
  const sum = (f: (c: (typeof hours)[number]) => number) => Math.round(hours.reduce((t, c) => t + f(c), 0) * 100) / 100;
  return { planned: sum((c) => c.planned), booked: sum((c) => c.booked), unfilled: sum((c) => c.unfilled), ready: sum((c) => c.spare), gap: sum((c) => c.gap) };
}

/** Cards that count as ready capacity for the gap (approved, suitable, fresh, confirmed and counted by the model), and the rest. */
export function readySupply(r: CoverageResult) {
  const ready = new Set<string>();
  for (const c of r.cells) for (const x of c.supply) if (x.use === "usable" && x.hours > 0) ready.add(x.id);
  return [...ready];
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type Debrief = {
  dims: { dim: Dim; label: string; level: Level; why: string }[];
  score: number;
  max: number;
  critical: { code: Code; text: string; correction: string }[];
  codes: Code[];
  ending: EndingId;
  endingText: string;
  valid: boolean;
  passed: boolean | null;
  diagnosis: { expected: ReturnType<typeof totals>; given: Diagnosis | null; readyCards: string[] };
  after: ReturnType<typeof totals>;
  choices: { step: string; title: string; chosen: string; feedback: string }[];
  outreach: { profile: string; problems: string[]; copied: boolean };
  summary: string;
  versions: { bench: string; rubric: string; rules: string; taxonomy: string; scenario: string };
};

const CORRECTIONS: Record<Code, string> = {
  unverifiedStart: "A worker starts only once the provider has verified them and the start process is complete. Until then, plan honest interim cover.",
  readyFromClaim: "Count only provider-approved workers with recently confirmed, uncommitted availability in the window. A candidate’s word is a lead.",
  ignoredChoice: "Route the participant’s chosen worker for provider assessment, and ask what would work if it can’t go ahead as proposed.",
  promisedStart:
    "Say which visits are confirmed and which aren’t yet. A start date follows approval, availability, the agreement and the provider’s start process.",
  outOfScope: "Workers aren’t interchangeable: a gardener can’t cover personal care, whatever their hours.",
  identityInOutreach: "General outreach names the service, area and window, never a participant or their details.",
  hidRestriction: "A provider-owned restriction is shown as a neutral status with the next step, never hidden.",
  blacklist: "One concern goes through the agreed pathway, with the contractor’s response. It isn’t a public rating.",
  countedDaytime: "Availability after 10 am doesn’t cover a 7 am visit.",
  classificationAsDemand: "A classification describes funding, not a roster: measure approved service hours by place and time.",
  priceShortcut: "A rate goes to the price owner; the participant agrees their price before services are confirmed.",
  genericOutreach: "A brief targets the actual gap: the service, the area and the early-morning window.",
  overreactRating: "Read reliability and feedback with their denominators and context, and the contractor’s response.",
  greenMap: "More names don’t fill a 7 am gap. Plan the remaining hours, and keep the promise honest.",
};

const capOf = (codes: Code[], dim: Dim): Level => Math.min(3, ...codes.map((c) => CODE_CAPS[c][dim] ?? 3)) as Level;

/** The diagnosis against the model, deterministically: the measure, the figures and which cards were counted as ready. */
export function scoreDiagnosis(d: NetworkData, g: Diagnosis | null) {
  const r = calculate(d.inputs);
  const t = totals(r);
  const ready = readySupply(r);
  const codes: Code[] = [];
  if (!g) return { diagnosis: 0 as Level, supply: 0 as Level, codes, t, ready };
  if (g.measure !== "slots") codes.push(g.measure === "count" ? "greenMap" : "classificationAsDemand");
  const near = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.05;
  const figures = near(g.planned, t.planned) && near(g.booked, t.booked);
  const diagnosis: Level = figures && near(g.unfilled, t.unfilled) ? (g.measure === "slots" ? 3 : 2) : figures ? 1 : 0;
  const rows = d.inputs.supply;
  const wrong = g.counted.filter((id) => !ready.includes(id));
  for (const id of wrong) {
    const row = rows.find((x) => x.id === id);
    if (!row) continue;
    const gapService = d.inputs.demand[0]?.service;
    if (gapService && row.service !== gapService) codes.push("outOfScope");
    else if (row.state !== "approved") codes.push("readyFromClaim");
    else codes.push("countedDaytime");
  }
  const supply: Level = wrong.length ? (codes.some((c) => c === "outOfScope" || c === "readyFromClaim") ? 0 : 1) : near(g.ready, t.ready) ? 3 : 2;
  return { diagnosis, supply, codes: [...new Set(codes)], t, ready };
}

/** The outreach brief, deterministically: the right role profile, the gap's area and window, and nothing it can't say. */
export function scoreOutreach(d: NetworkData, o: BenchState["outreach"]) {
  if (!o) return { level: 0 as Level, codes: [] as Code[], problems: ["No brief was drafted."] };
  const problems = outreachProblems(d.outreach, o, d.profiles, peopleOf(d));
  const codes: Code[] = [];
  const all = Object.values(o.fields).join(" ").toLowerCase();
  if (problems.some((p) => /participant/.test(p))) codes.push("identityInOutreach");
  const profile = d.profiles.find((p) => p.id === o.profile);
  if (!profile || o.profile !== d.gapProfile) codes.push("genericOutreach");
  const hasArea = d.gapWords.area.some((w) => all.includes(w.toLowerCase()));
  const hasWindow = d.gapWords.window.some((w) => all.includes(w.toLowerCase()));
  const level: Level = problems.length ? (codes.includes("identityInOutreach") ? 0 : 1) : codes.length ? 1 : hasArea && hasWindow ? 3 : 2;
  return { level, codes, problems };
}

export function buildDebrief(d: NetworkData, s: BenchState): Debrief {
  const dg = scoreDiagnosis(d, s.diagnosis);
  const or = scoreOutreach(d, s.outreach);
  const chosen = d.steps.map((st) => ({ st, o: st.options.find((x) => x.id === s.answers[st.id]) }));
  const codes = [...new Set<Code>([...dg.codes, ...or.codes, ...chosen.flatMap((c) => c.o?.codes ?? [])])];
  const from = (dim: Dim) => chosen.flatMap((c) => (c.o && c.o.levels[dim] !== undefined ? [c.o.levels[dim]!] : []));
  const base: Record<Dim, Level> = {
    diagnosis: dg.diagnosis,
    supply: dg.supply,
    outreach: or.level,
    honesty: Math.min(3, ...from("honesty")) as Level,
    safeguards: Math.min(3, ...from("safeguards")) as Level,
    quality: Math.min(3, ...from("quality")) as Level,
    followThrough: Math.min(3, ...from("followThrough")) as Level,
  };
  for (const k of ["honesty", "safeguards", "quality", "followThrough"] as Dim[]) if (!from(k).length) base[k] = 0;
  const why: Record<Dim, string> = {
    diagnosis:
      dg.diagnosis === 3
        ? `You measured approved service hours by place and time, and found the ${dg.t.unfilled} unfilled early-morning hours.`
        : `The gap is ${dg.t.planned} planned hours less ${dg.t.booked} booked: ${dg.t.unfilled} unfilled hours before 9 am, measured by service, place and time.`,
    supply:
      dg.supply === 3
        ? "You counted nobody as ready capacity who wasn’t: no candidate’s word, no daytime hours and no other service."
        : `Ready capacity for the gap was ${dg.t.ready} hours: ${dg.ready.length ? "only the approved, available workers the model counted" : "nobody on the map was approved, suitable and confirmed free before 9 am"}.`,
    honesty: "Whether the participants heard exactly what’s confirmed and what isn’t, and whether the chosen worker stayed in view.",
    safeguards: "Whether verification, approval and the price went through the people who own them.",
    outreach:
      or.level === 3
        ? "The brief named the role, the area and the early-morning window, with nothing it can’t promise."
        : "A brief works when it targets the actual gap on the right role checklist, and promises nothing it can’t.",
    quality: "Whether the quality evidence was read with its denominators, period, context and the contractor’s response.",
    followThrough: "Whether the remaining gap after the reveal was planned honestly, instead of being made to look covered.",
  };
  const dims = DIM_ORDER.map((dim) => ({ dim, label: DIMS[dim], level: Math.min(base[dim], capOf(codes, dim)) as Level, why: why[dim] }));
  const score = dims.reduce((t, x) => t + x.level, 0);
  const critical = codes.filter((c) => CRITICAL.includes(c)).map((code) => ({ code, text: CODES[code], correction: CORRECTIONS[code] }));
  const picked = chosen.find((c) => c.o?.ending)?.o?.ending ?? "green";
  const ending: EndingId = critical.length ? "unsafe" : picked;
  const after = totals(calculate(inputsAt(d, s, true)));
  return {
    dims,
    score,
    max: MAX_SCORE,
    critical,
    codes,
    ending,
    endingText: d.endings[ending] || ENDINGS[ending],
    valid: VALID_ENDINGS.includes(ending),
    passed: d.mode === "assessed" ? !critical.length && score >= d.passMark : null,
    diagnosis: { expected: dg.t, given: s.diagnosis, readyCards: dg.ready },
    after,
    choices: chosen.map(({ st, o }) => ({ step: st.id, title: st.title, chosen: o?.text ?? "", feedback: o?.feedback ?? "" })),
    outreach: { profile: d.profiles.find((p) => p.id === s.outreach?.profile)?.label ?? "", problems: or.problems, copied: Boolean(s.outreach?.copied) },
    summary: d.debrief,
    versions: { bench: BENCH_VERSION, rubric: RUBRIC_VERSION, rules: RULES_VERSION, taxonomy: TAXONOMY_VERSION, scenario: d.scenarioVersion },
  };
}

export function submitProblems(d: NetworkData, s: BenchState): string[] {
  const phase = phaseOf(d, s);
  return phase === "submit" ? [] : [`Finish the case first (${phase === "map" ? "diagnose the gap" : phase}).`];
}

// ---------------------------------------------------------------------------------------------
// What the learner's page holds
// ---------------------------------------------------------------------------------------------

export type CardView = {
  id: string;
  label: string;
  service: string;
  areas: string[];
  windows: string[];
  availability: string;
  verifiedOn: string;
  arrangement: string;
  stage: Stage;
  stageLabel: string;
  hold: string;
  calm: Calm;
  staleAvailability: boolean;
  evidence: { axis: string; state: string }[];
  evidenceOutcome: string;
  scope: string;
  claim: string;
  travel: string;
  preferred: boolean;
};

const AVAIL_WORDS = { confirmed: "confirmed", provisional: "offered, not confirmed", booked: "already committed" } as const;
export function cardView(i: CoverageInputs, row: SupplyRow, card: BenchCard | undefined): CardView {
  const st = stageOf(row, i.asOf, i.freshness.days);
  const ev = card ? evidenceOf(card.evidence) : null;
  return {
    id: row.id,
    label: row.label,
    service: SERVICES[row.service],
    areas: row.areas.map((a) => i.areas.find((x) => x.id === a)?.name ?? a),
    windows: row.slots.map((a) => `${windowLabel(a)}, ${a.hours ?? "?"} h a week (${AVAIL_WORDS[a.status]})`),
    availability: row.verifiedOn ? `Availability last confirmed ${dateLabel(row.verifiedOn)}` : "Availability never confirmed",
    verifiedOn: row.verifiedOn,
    arrangement: card?.arrangement ?? "",
    stage: st.stage,
    stageLabel: STAGES[st.stage],
    hold: st.hold ? HOLDS[st.hold] : "",
    calm: calmOf(st),
    staleAvailability: st.staleAvailability,
    evidence: card
      ? (Object.entries(card.evidence) as [Axis, AxisState][]).map(([k, a]) => ({ axis: AXES[k], state: FIELD_STATES[a.state as FieldState] }))
      : [],
    evidenceOutcome: ev
      ? ev.resolved
        ? "Every required check resolved (still the provider’s decision)"
        : ev.barrier
          ? "A check can’t be met as proposed"
          : ev.submitted
            ? "Evidence sent: the provider is checking"
            : "Evidence still to come"
      : "",
    scope: card?.scope.length
      ? `Approved for ${card.scope.map((x) => SERVICES[x].toLowerCase()).join(", ")}${card.approvedUntil ? ` until ${dateLabel(card.approvedUntil)}` : ""}`
      : "No provider approval",
    claim: card?.claim ?? "",
    travel: card?.travel ?? "",
    preferred: Boolean(row.preferredFor),
  };
}
export const cardsView = (d: NetworkData, s: Pick<BenchState, "variation">, after: boolean) => {
  const i = inputsAt(d, s, after);
  const cards = cardsAt(d, s, after);
  return i.supply.map((r) =>
    cardView(
      i,
      r,
      cards.find((c) => c.id === r.id),
    ),
  );
};

/** The case without anything that gives the answers away: needs, cards and areas, never the model's result. */
export function mapView(d: NetworkData) {
  const i = d.inputs;
  return {
    asOf: i.asOf,
    freshness: i.freshness,
    areas: i.areas.map((a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, listed: i.supply.filter((r) => r.areas.includes(a.id)).length })),
    needs: i.demand.map((c) => ({
      id: c.id,
      service: SERVICES[c.service],
      area: i.areas.find((a) => a.id === c.area)?.name ?? "",
      window: windowLabel(c.window),
      planned: c.planned,
      booked: c.booked,
      forecast: c.forecast,
      unit: c.unit,
      source: c.source,
      verifiedOn: c.verifiedOn,
      preference: c.preference,
      note: c.note ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Checks an author can't waive
// ---------------------------------------------------------------------------------------------

const REAL_ID = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?61|0)[2-478](?:[ -]?\d){8}|\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/;

/** The structural check: a case that holds together, whatever its sign-off. Run before the demo sign-off wrapper. */
export function caseProblems(d: NetworkData): string[] {
  const where = `“${d.title || "Build Your Local Bench"}”`;
  const out: string[] = [];
  const errs = validateInputs(d.inputs);
  if (errs.length) out.push(`${where}: the case’s figures don’t validate (${errs[0].message})`);
  if (!errs.length) {
    const t = totals(calculate(d.inputs));
    if (t.gap <= 0) out.push(`${where}: the case has no gap to find.`);
    const after = calculate(inputsAt(d, { variation: "" }, true));
    if (after.cells.some((c) => c.planned !== calculate(d.inputs).cells.find((x) => x.id === c.id)?.planned))
      out.push(`${where}: the reveal changes the planned demand. It should change supply only.`);
  }
  for (const r of d.inputs.supply) {
    const c = d.cards.find((x) => x.id === r.id);
    if (!c) {
      out.push(`${where}: ${r.label || r.id} has no card.`);
      continue;
    }
    if (r.state === "approved" && !evidenceOf(c.evidence).resolved) out.push(`${where}: ${r.label} is approved with a check still open.`);
    if (r.state === "approved" && !c.scope.includes(r.service)) out.push(`${where}: ${r.label} is approved, but not for the service they’re listed for.`);
    if (r.state === "verification" && !evidenceOf(c.evidence).submitted) out.push(`${where}: ${r.label} is in verification with evidence still to send.`);
    if (/\b(?:mr|mrs|ms|dr)\b/i.test(r.label)) out.push(`${where}: supply labels are anonymous (“Worker A”), never a person’s name.`);
  }
  for (const st of d.steps) {
    if (st.options.length < 2) out.push(`${where}: “${st.title}” needs at least two choices.`);
    if (!st.options.some((o) => !o.codes.some((c) => CRITICAL.includes(c)))) out.push(`${where}: “${st.title}” has no safe choice.`);
  }
  for (const ph of ["before", "after", "quality"] as const)
    if (!stepsIn(d, ph).length) out.push(`${where}: it needs a decision in the ${ph === "before" ? "first" : ph === "after" ? "reveal" : "quality"} phase.`);
  const endings = new Set(d.steps.flatMap((st) => st.options.filter((o) => !o.only && o.ending && VALID_ENDINGS.includes(o.ending)).map((o) => o.ending)));
  if (!endings.size) out.push(`${where}: no defensible ending can be reached.`);
  const gp = d.profiles.find((p) => p.id === d.gapProfile);
  if (!gp) out.push(`${where}: the gap’s role profile isn’t in the case.`);
  const services = d.profiles.map((p) => p.service);
  if (new Set(services).size !== services.length) out.push(`${where}: each role needs its own reviewed profile.`);
  if (!d.outreach.locked.length) out.push(`${where}: the outreach template needs its locked claims.`);
  const lockedText = [d.outreach.subject, d.outreach.intro, d.outreach.followUp, ...d.outreach.callGuide, ...d.outreach.locked.map((l) => l.text)].join("\n");
  if (GUARANTEE.test(lockedText) || RATE.test(lockedText) || HOURS_PROMISE.test(lockedText))
    out.push(`${where}: the outreach template promises work, a start, a rate or hours.`);
  for (const m of [...d.scorecard.metrics, ...d.variations.flatMap((v) => v.scorecard?.metrics ?? [])])
    if (m.numerator !== null && m.denominator !== null && m.numerator > m.denominator) out.push(`${where}: “${m.label}” counts more than its denominator.`);
  if (REAL_ID.test(JSON.stringify({ ...d, approval: {} })))
    out.push(`${where} looks like it holds a real email, phone number or ABN. Use fictional details only.`);
  if (d.ai.drafting !== false) out.push(`${where}: AI drafting is off in this release.`);
  return [...new Set(out)];
}

export const benchApproved = (d: Pick<NetworkData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.onboarding && a.quality && a.partnerships && a.finance && a.privacy && a.learning && a.approvedOn);
};

/** What "Publish anyway" can't waive: the sign-off, its scenario version, the review date and the Job Aid. */
export function benchSignOffProblems(d: NetworkData, today: string): string[] {
  const where = `“${d.title || "Build Your Local Bench"}”`;
  const out: string[] = [];
  if (!d.jobAid.snippetId) out.push(`${where}: link the Choosing and Checking Your Contractor Job Aid.`);
  if (d.mode === "assessed" && !(d.passMark >= 1 && d.passMark <= MAX_SCORE))
    out.push(`${where}: an assessed version needs a pass mark from 1 to ${MAX_SCORE}.`);
  if (!benchApproved(d))
    out.push(
      `${where}: record the owner, Operations, supplier onboarding, Quality and worker screening (with clinical governance for regulated roles), Partnerships, Finance/procurement, privacy/security and the learning reviewer, and the date.`,
    );
  else if (d.approval.scenarioReviewed !== d.scenarioVersion)
    out.push(`${where}: Review required. The reviewers signed off ${d.approval.scenarioReviewed || "no scenario version"}, and this is ${d.scenarioVersion}.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`${where} was due for review on ${d.approval.reviewBy}.`);
  for (const p of d.profiles) if (!p.reviewedOn) out.push(`${where}: the “${p.label}” checklist profile hasn’t been reviewed by its owner.`);
  if (d.outreach.approvalState !== "approved") out.push(`${where}: the outreach template isn’t approved yet.`);
  return out;
}

/**
  The learner's copy of the block: the frame only. The cards, steps, reveal, scorecard, endings and debrief come from
  the attempt API as they arrive, so a reader can't see what's coming or what scores well.
*/
export function networkForReaders<T extends NetworkData>(b: T): T {
  return {
    ...b,
    inputs: { ...b.inputs, areas: [], demand: [], supply: [] },
    cards: [],
    steps: [],
    later: { asOf: "", demandVerifiedOn: "", text: "", patches: [] },
    profiles: [],
    gapWords: { area: [], window: [] },
    scorecard: { ...b.scorecard, metrics: [], strengths: [], concerns: [], response: "", qualityDetail: undefined },
    variations: [],
    endings: { phased: "", central: "", chosen: "", cannot: "", green: "", unsafe: "" },
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
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : "");
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const SERVICE_IDS = Object.keys(SERVICES) as Service[];
const AXIS_IDS = Object.keys(AXES) as Axis[];
const STATE_IDS = Object.keys(FIELD_STATES) as FieldState[];
const level = (v: unknown): Level | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const codes = (v: unknown) => [...new Set(arr(v).filter((c): c is Code => typeof c === "string" && c in CODES))];

function parseAxes(v: unknown): Axes {
  const o = obj(v);
  const out: Axes = {};
  for (const k of AXIS_IDS)
    if (o[k]) {
      const a = obj(o[k]);
      out[k] = { state: pick(a.state, STATE_IDS, "needs_owner_review"), note: s(a.note, 300), owner: s(a.owner, 120), barrier: a.barrier === true };
    }
  return out;
}
function parseCard(v: unknown, k: number): BenchCard {
  const c = obj(v);
  return {
    id: id(c.id, `card-${k + 1}`),
    arrangement: s(c.arrangement, 120),
    profile: id(c.profile, ""),
    evidence: parseAxes(c.evidence),
    scope: SERVICE_IDS.filter((x) => arr(c.scope).includes(x)),
    approvedUntil: date(c.approvedUntil),
    claim: s(c.claim, 300),
    travel: s(c.travel, 300),
  };
}
function parsePatch(v: unknown, k: number): Patch {
  const p = obj(v);
  const row = cleanInputs({ supply: [p.row] }).supply[0] ?? cleanInputs({ supply: [{}] }).supply[0];
  return { row: { ...row, id: row.id || `row-${k + 1}` }, ...(p.card ? { card: parseCard(p.card, k) } : {}) };
}
function parseMetric(v: unknown, k: number): Metric {
  const m = obj(v);
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);
  return {
    id: id(m.id, `metric-${k + 1}`),
    dim: pick(m.dim, QUALITY_ORDER, "reliability"),
    label: s(m.label, 160),
    numerator: n(m.numerator),
    denominator: n(m.denominator),
    period: s(m.period, 80),
    source: s(m.source, 160),
    lastReview: date(m.lastReview),
    missing: s(m.missing, 300),
    note: s(m.note, 300),
  };
}
export function parseScorecard(v: unknown): Scorecard {
  const c = obj(v);
  const r = obj(c.restriction);
  const q = obj(c.qualityAction);
  return {
    worker: s(c.worker, 60),
    role: s(c.role, 120),
    reviewOwner: s(c.reviewOwner, 120),
    metrics: arr(c.metrics).slice(0, 20).map(parseMetric),
    strengths: arr(c.strengths)
      .slice(0, 6)
      .map((x) => s(x, 300)),
    concerns: arr(c.concerns)
      .slice(0, 6)
      .map((x) => s(x, 300)),
    response: s(c.response, 400),
    restriction: { active: r.active === true, owner: s(r.owner, 120), neutral: s(r.neutral, 300) },
    qualityAction: { open: q.open === true, ref: s(q.ref, 40) },
    checksValidUntil: date(c.checksValidUntil),
    reviewBy: date(c.reviewBy),
    available: c.available !== false,
    ...(typeof c.qualityDetail === "string" ? { qualityDetail: s(c.qualityDetail, 600) } : {}),
  };
}

export function parseNetwork(o: Raw, where: string, h: ParseHelpers): NetworkData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const rv = obj(o.later);
  const ot = obj(o.outreach);
  const en = obj(o.endings);
  const ja = obj(o.jobAid);
  const ra = obj(o.rationale);
  const ap = obj(o.approval);
  const gw = obj(o.gapWords);
  const data: NetworkData = {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 800 }) ?? "",
    scenarioVersion: s(o.scenarioVersion, 60),
    mode: o.mode === "assessed" ? "assessed" : "formative",
    passMark: typeof o.passMark === "number" && Number.isInteger(o.passMark) ? Math.max(0, Math.min(MAX_SCORE, o.passMark)) : 14,
    story: { character: s(st.character, 80), role: s(st.role, 200), situation: s(st.situation, 1200), dilemma: s(st.dilemma, 300) },
    people: arr(o.people)
      .slice(0, 12)
      .map((x) => s(x, 60))
      .filter(Boolean),
    inputs: cleanInputs(o.inputs),
    cards: arr(o.cards).slice(0, 30).map(parseCard),
    headline: s(o.headline, 120),
    steps: arr(o.steps)
      .slice(0, 12)
      .map((x, k) => {
        const p = obj(x);
        return {
          id: id(p.id, `step-${k + 1}`),
          phase: pick(p.phase, ["before", "after", "quality"] as const, "before"),
          title: s(p.title, 120),
          prompt: s(p.prompt, 800),
          signal: pick(p.signal, SIGNALS, ""),
          options: arr(p.options)
            .slice(0, 8)
            .map((y, j) => {
              const op = obj(y);
              const lv = obj(op.levels);
              const levels: Partial<Record<Dim, Level>> = {};
              for (const dim of DIM_ORDER) if (level(lv[dim]) !== undefined) levels[dim] = level(lv[dim]);
              return {
                id: id(op.id, `option-${j + 1}`),
                text: s(op.text, 400),
                feedback: s(op.feedback, 900),
                levels,
                codes: codes(op.codes),
                ...(typeof op.ending === "string" && op.ending in ENDINGS ? { ending: op.ending as EndingId } : {}),
                ...(typeof op.only === "string" && ID.test(op.only) ? { only: op.only } : {}),
              };
            }),
        };
      }),
    later: { asOf: date(rv.asOf), demandVerifiedOn: date(rv.demandVerifiedOn), text: s(rv.text, 1200), patches: arr(rv.patches).slice(0, 12).map(parsePatch) },
    profiles: arr(o.profiles)
      .slice(0, 8)
      .map((x, k) => {
        const p = obj(x);
        return {
          id: id(p.id, `profile-${k + 1}`),
          label: s(p.label, 120),
          service: pick(p.service, SERVICE_IDS, "personalCare"),
          arrangement: s(p.arrangement, 120),
          items: arr(p.items)
            .slice(0, 20)
            .map((y) => {
              const i = obj(y);
              return {
                axis: pick(i.axis, AXIS_IDS, "entity_identity"),
                label: s(i.label, 200),
                requirement: pick(i.requirement, Object.keys(REQUIREMENTS) as Requirement[], "owner"),
                why: s(i.why, 300),
                source: s(i.source, 160),
              };
            }),
          owner: s(p.owner, 120),
          version: s(p.version, 40),
          reviewedOn: date(p.reviewedOn),
        };
      }),
    gapProfile: id(o.gapProfile, ""),
    gapWords: {
      area: arr(gw.area)
        .slice(0, 6)
        .map((x) => s(x, 40))
        .filter(Boolean),
      window: arr(gw.window)
        .slice(0, 6)
        .map((x) => s(x, 40))
        .filter(Boolean),
    },
    outreach: {
      id: id(ot.id, "outreach"),
      version: s(ot.version, 40),
      subject: s(ot.subject, 160),
      intro: s(ot.intro, 1200),
      callGuide: arr(ot.callGuide)
        .slice(0, 10)
        .map((x) => s(x, 300)),
      followUp: s(ot.followUp, 800),
      locked: arr(ot.locked)
        .slice(0, 8)
        .map((x, k) => ({ id: id(obj(x).id, `claim-${k + 1}`), text: s(obj(x).text, 400) })),
      fields: arr(ot.fields)
        .slice(0, 6)
        .map((x, k) => {
          const f = obj(x);
          return {
            id: typeof f.id === "string" && /^\w{1,20}$/.test(f.id) ? f.id : `field${k + 1}`,
            label: s(f.label, 80),
            hint: s(f.hint, 200),
            max: Math.max(10, Math.min(300, Number(f.max) || 120)),
          };
        }),
      approvalState: ot.approvalState === "approved" ? "approved" : "draft",
      owner: s(ot.owner, 120),
    },
    scorecard: parseScorecard(o.scorecard),
    variations: arr(o.variations)
      .slice(0, 8)
      .map((x, k) => {
        const v = obj(x);
        return {
          id: id(v.id, `variation-${k + 1}`),
          label: s(v.label, 120),
          text: s(v.text, 600),
          reveal: arr(v.reveal).slice(0, 8).map(parsePatch),
          ...(v.scorecard ? { scorecard: parseScorecard(v.scorecard) } : {}),
        };
      }),
    endings: Object.fromEntries((Object.keys(ENDINGS) as EndingId[]).map((e) => [e, s(en[e], 900)])) as Record<EndingId, string>,
    debrief: s(o.debrief, 1500),
    jobAid: { snippetId: s(ja.snippetId, 80), why: s(ja.why, 300) },
    related: arr(o.related)
      .slice(0, 6)
      .map((x) => ({
        label: s(obj(x).label, 120),
        href: typeof obj(x).href === "string" && /^\/[\w\-/?=&]*$/.test(obj(x).href as string) ? (obj(x).href as string) : "",
        why: s(obj(x).why, 300),
      }))
      .filter((x) => x.label && x.href),
    rationale: {
      signal: s(ra.signal, 400),
      behaviour: s(ra.behaviour, 400),
      evidence: s(ra.evidence, 400),
      whyFit: s(ra.whyFit, 600),
      existing: s(ra.existing, 400),
      systemFix: s(ra.systemFix, 400),
      owner: s(ra.owner, 120),
      measure: s(ra.measure, 400),
      decision: pick(ra.decision, ["", "accepted", "edited", "rejected"] as const, ""),
    },
    ai: { drafting: false },
    approval: {
      owner: s(ap.owner, 120),
      operations: s(ap.operations, 120),
      onboarding: s(ap.onboarding, 120),
      quality: s(ap.quality, 120),
      partnerships: s(ap.partnerships, 120),
      finance: s(ap.finance, 120),
      privacy: s(ap.privacy, 120),
      learning: s(ap.learning, 120),
      approvedOn: date(ap.approvedOn),
      reviewBy: date(ap.reviewBy),
      scenarioReviewed: s(ap.scenarioReviewed, 60),
    },
  };
  if (!data.inputs.demand.length || !data.steps.length) unfinished(`${where} needs its case: the need slots, the contractor cards and the decisions.`);
  return data;
}

// ---------------------------------------------------------------------------------------------
// The page's view of an attempt: what's open now, and nothing that's still to come
// ---------------------------------------------------------------------------------------------

const PHASES = ["map", "before", "outreach", "reveal", "after", "quality", "submit"] as const;
const reached = (phase: ReturnType<typeof phaseOf>, at: (typeof PHASES)[number]) => PHASES.indexOf(phase) >= PHASES.indexOf(at);

/** The date the scorecard is read at: its latest review. */
const qualityAsOf = (c: Scorecard, fallback: string) => c.metrics.map((m) => m.lastReview).reduce((a, b) => (b > a ? b : a), "") || fallback;

/**
  What the learner's page holds for an attempt, built the same way on the server and in the editor's preview. The
  model's result comes only after the learner's own diagnosis; the reveal, its decision and the scorecard only when
  their turn comes. Step feedback, levels, codes and endings never leave the server before the debrief.
*/
export function benchView(d: NetworkData, s: BenchState) {
  const phase = phaseOf(d, s);
  const v = variationOf(d, s.variation);
  const steps = d.steps
    .filter(
      (st) =>
        (st.phase === "before" && reached(phase, "before")) ||
        (st.phase === "after" && reached(phase, "after")) ||
        (st.phase === "quality" && reached(phase, "quality")),
    )
    .map((st) => ({
      id: st.id,
      phase: st.phase,
      title: st.title,
      prompt: st.prompt,
      options: optionsFor(st, s.variation).map((o) => ({ id: o.id, text: o.text })),
      chosen: s.answers[st.id] ?? "",
    }));
  const card = scorecardFor(d, s);
  return {
    phase,
    headline: d.headline,
    people: d.people,
    map: mapView(d),
    cards: cardsView(d, s, s.revealed),
    before: s.diagnosis ? calculate(d.inputs) : null,
    after: s.revealed ? calculate(inputsAt(d, s, true)) : null,
    revealText: s.revealed ? (v?.text ?? d.later.text) : "",
    diagnosis: s.diagnosis,
    opened: s.opened,
    steps,
    outreach: reached(phase, "outreach")
      ? {
          template: d.outreach,
          profiles: d.profiles,
          input: s.outreach,
          copied: Boolean(s.outreach?.copied),
          problems: s.outreach ? outreachProblems(d.outreach, s.outreach, d.profiles, d.people) : [],
          draft: s.outreach ? outreachDraft(d.outreach, s.outreach, d.profiles) : null,
          locked: s.revealed,
        }
      : null,
    scorecard: reached(phase, "quality") ? scorecardView(card, qualityAsOf(card, d.later.asOf)) : null,
  };
}
export type BenchView = ReturnType<typeof benchView>;
