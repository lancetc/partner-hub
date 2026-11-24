import type { AuditDoc, Decision, EvidenceItem, ParseHelpers } from "./auditor";

/*
  The Contractor Vetting Card (docs/document-auditor.md, "The Contractor Vetting Card"): the Document Auditor's
  vetting mode, extended from the PRD "Contractor Compliance and Rate-Benchmarking Checker" (21 November 2026).

  A participant has chosen a worker they trust. The learner checks the business and the actual worker separately,
  the accepted screening route, Trilogy Care's insurance policy, the scope of the job, and the price (supplier cost,
  the permitted self-managed overhead, the participant-facing price and whether the participant has agreed it), then
  recommends one of four proportionate outcomes and explains it to the participant.

  - Deterministic and authored. Each check (an "axis") has a reviewed state; the outcome is computed from them, never
    generated. An active ABN alone can never make a pack ready: the worker, screening, insurance, scope, price and
    agreement checks all have to be resolved too.
  - A benchmark is context, never a cap. Supplier and participant prices are separate numbers.
  - Training status only: nothing here approves a contractor, checks a real register or agrees a price.

  This module imports only types from lib/auditor, so lib/auditor can use it without a cycle.
*/

// ---------------------------------------------------------------------------------------------
// Field states, the checks behind an outcome, and the four outcomes' rules
// ---------------------------------------------------------------------------------------------

/** The rules engine's state for a field or a check (PRD section 10). */
export const FIELD_STATES = {
  verified: "Verified",
  needs_verification: "Needs verification",
  material_gap: "Material gap",
  different_rule: "A different rule applies",
  price_review: "Price review",
  not_applicable: "Not applicable",
  needs_owner_review: "Needs owner review",
} as const;
export type FieldState = keyof typeof FIELD_STATES;
export const FIELD_STATE_ORDER = Object.keys(FIELD_STATES) as FieldState[];
/** States that leave nothing open. "A different rule applies" is resolved: an accepted alternative route is met. */
export const RESOLVED_STATES: readonly FieldState[] = ["verified", "different_rule", "not_applicable"];
export const isResolved = (s: FieldState) => RESOLVED_STATES.includes(s);

/** An older answer key's status, as a field state. */
export const stateFromStatus = (status: string): FieldState =>
  status === "verified" ? "verified" : status === "ambiguous" ? "needs_verification" : "material_gap";
/** A field state as the scoring status: resolved states are harmless differences; a gap on a checklist row is "missing". */
export const statusFromState = (s: FieldState, missingRow: boolean): "verified" | "missing" | "ambiguous" | "failed" =>
  isResolved(s) ? "verified" : s === "material_gap" ? (missingRow ? "missing" : "failed") : "ambiguous";
/** A finding's state: authored, or read from an older key's status. */
export const stateOf = (e: Pick<EvidenceItem, "status" | "state">): FieldState => e.state ?? stateFromStatus(e.status);

/** The separate checks behind the simple outcome (PRD section 5). They're never flattened into one score. */
export const AXES = {
  participant_choice: "Participant choice",
  service_scope: "Service scope",
  entity_identity: "Business identity (ABN and entity)",
  worker_identity: "Worker identity",
  screening_route: "Screening route",
  screening_status: "Screening status",
  service_credential: "Service-specific credential",
  insurance_rule: "Insurance rule (Trilogy Care policy)",
  insurance_status: "Insurance evidence",
  rate_breakdown: "Rate breakdown",
  benchmark_context: "Benchmark context",
  supplier_cost: "Supplier cost",
  provider_overhead: "Provider overhead",
  participant_price: "Participant-facing price",
  price_agreement: "Price agreement",
  provider_oversight: "Provider oversight",
  review_owner: "Review owner",
  source_confidence: "Source confidence",
} as const;
export type Axis = keyof typeof AXES;
export const AXIS_ORDER = Object.keys(AXES) as Axis[];

/** Which part of the pack a check belongs to: the business is checked apart from the person who does the work. */
export const AXIS_SIDE: Record<Axis, "participant" | "business" | "worker" | "contract" | "price" | "process"> = {
  participant_choice: "participant",
  service_scope: "participant",
  entity_identity: "business",
  worker_identity: "worker",
  screening_route: "worker",
  screening_status: "worker",
  service_credential: "worker",
  insurance_rule: "contract",
  insurance_status: "contract",
  provider_oversight: "contract",
  rate_breakdown: "price",
  benchmark_context: "price",
  supplier_cost: "price",
  provider_overhead: "price",
  participant_price: "price",
  price_agreement: "price",
  review_owner: "process",
  source_confidence: "process",
};
/** The rubric's five dimensions (PRD section 8), each reported on its own. */
export const VET_DIMS = {
  choice: "Participant choice and service fit",
  identity: "Entity and worker verification",
  safety: "Contract and safety evidence",
  price: "Price reasoning",
  decision: "Proportionate decision and explanation",
} as const;
export type VetDim = keyof typeof VET_DIMS;
export const AXIS_DIM: Record<Axis, VetDim> = {
  participant_choice: "choice",
  service_scope: "choice",
  entity_identity: "identity",
  worker_identity: "identity",
  screening_route: "identity",
  screening_status: "identity",
  service_credential: "safety",
  insurance_rule: "safety",
  insurance_status: "safety",
  provider_oversight: "safety",
  rate_breakdown: "price",
  benchmark_context: "price",
  supplier_cost: "price",
  provider_overhead: "price",
  participant_price: "price",
  price_agreement: "price",
  review_owner: "decision",
  source_confidence: "decision",
};
export const SIDES = {
  participant: "The participant’s request",
  business: "The business",
  worker: "The worker",
  contract: "Insurance and oversight",
  price: "The price",
  process: "Review",
} as const;

/** What has to be checked and resolved before a pack can be ready for engagement review. A missing check is never assumed to pass. */
export const READY_NEEDS: readonly Axis[] = [
  "participant_choice",
  "service_scope",
  "entity_identity",
  "worker_identity",
  "screening_route",
  "screening_status",
  "insurance_status",
  "rate_breakdown",
  "participant_price",
  "price_agreement",
  "provider_oversight",
];

export type AxisState = { state: FieldState; note: string; owner: string; barrier: boolean };
export type Axes = Partial<Record<Axis, AxisState>>;

export type VettingOutcome = {
  outcome: Decision;
  /** A delegated price or owner decision is needed as well, alongside the request for evidence. */
  escalateToo: boolean;
  /** Every check that isn't resolved, with why. A required check that isn't in the case needs owner review. */
  open: ({ axis: Axis } & AxisState)[];
};

/**
  The outcome from the checks, deterministically:
  - a confirmed barrier (a material gap the author marked as one this proposal can't resolve): cannot engage as proposed;
  - anything still to verify, or a correctable gap: request evidence or clarification;
  - only a price review or an owner's decision left: escalate for decision;
  - every required check resolved: ready for engagement review. That still isn't an approval.
*/
export function vettingOutcome(axes: Axes): VettingOutcome {
  const open: VettingOutcome["open"] = [];
  for (const k of AXIS_ORDER) {
    const a = axes[k];
    if (a && !isResolved(a.state)) open.push({ axis: k, ...a });
    else if (!a && READY_NEEDS.includes(k))
      open.push({ axis: k, state: "needs_owner_review", note: "No reviewed check for this in the case.", owner: "", barrier: false });
  }
  const has = (...s: FieldState[]) => open.some((x) => s.includes(x.state));
  const outcome: Decision = open.some((x) => x.barrier && x.state === "material_gap")
    ? "cannot_engage"
    : has("needs_verification", "material_gap")
      ? "request_evidence"
      : has("price_review", "needs_owner_review")
        ? "escalate"
        : "ready";
  return { outcome, escalateToo: outcome === "request_evidence" && has("price_review", "needs_owner_review"), open };
}

// ---------------------------------------------------------------------------------------------
// The price: supplier cost, the permitted overhead, the participant price and the agreement
// ---------------------------------------------------------------------------------------------

export const LINE_KINDS = { service: "Service", travel: "Travel", admin: "Booking or admin", other: "Other" } as const;
export type LineKind = keyof typeof LINE_KINDS;
export type PriceLine = { id: string; label: string; qty: number; unit: string; rateCents: number; kind: LineKind; note: string };
export const COMPARABILITY = {
  like_for_like: "Like for like",
  partial: "Partly comparable",
  insufficient: "Insufficient comparison evidence",
} as const;
export type Comparability = keyof typeof COMPARABILITY;
export type Benchmark = {
  label: string;
  source: string;
  url: string;
  asAt: string;
  region: string;
  category: string;
  /** What the comparison actually measures. */
  measures: string;
  rateCents: number | null;
  unit: string;
  comparable: Comparability;
  notes: string;
};
export const AGREEMENT = {
  none: "No agreement with the participant yet",
  discussed: "Discussed with the participant, not agreed in writing",
  agreed_in_writing: "Agreed with the participant in writing",
} as const;
export type AgreementState = keyof typeof AGREEMENT;
export type VettingPrice = {
  /** The supplier's quote to Trilogy Care, line by line. */
  lines: PriceLine[];
  /** An eligible self-managed third-party arrangement, where a provider overhead of up to 10% applies. */
  selfManaged: boolean;
  /** The provider overhead proposed, as a percentage of the supplier cost, or null if none is proposed yet. */
  overheadPercent: number | null;
  /** The final price agreed with and charged to the participant, or null if it isn't set yet. Never the supplier's figure. */
  participantPriceCents: number | null;
  participantUnit: string;
  agreement: AgreementState;
  /** Contribution context, where relevant. */
  contribution: string;
  benchmark: Benchmark | null;
};
/** The self-managed third-party overhead cap: 10% of the actual third-party service cost (PRD section 4). */
export const MAX_OVERHEAD_PERCENT = 10;

const cash = (cents: number) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const unitOf = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .replace(/^(an?|per|each)\s+/, "")
    .replace(/s$/, "");

/** The price panel's numbers, worked out the same way everywhere. A benchmark gives a percentage and a sentence, never a verdict. */
export function priceView(p: VettingPrice) {
  const lines = p.lines.map((l) => ({ ...l, totalCents: Math.round(l.qty * l.rateCents) }));
  const supplierCostCents = lines.reduce((n, l) => n + l.totalCents, 0);
  const overheadMaxCents = p.selfManaged ? Math.floor((supplierCostCents * MAX_OVERHEAD_PERCENT) / 100) : null;
  const overheadCents = p.selfManaged && p.overheadPercent !== null ? Math.round((supplierCostCents * p.overheadPercent) / 100) : null;
  const ceilingCents = overheadMaxCents === null ? null : supplierCostCents + overheadMaxCents;
  const service = lines.find((l) => l.kind === "service") ?? null;
  const b = p.benchmark;
  const comparable = Boolean(b && b.rateCents && service && b.comparable !== "insufficient" && unitOf(b.unit) === unitOf(service.unit));
  const benchmarkPercent = comparable && b && service ? Math.round(((service.rateCents - b.rateCents!) / b.rateCents!) * 1000) / 10 : null;
  const benchmarkText = !b
    ? "No benchmark in this case."
    : benchmarkPercent === null
      ? "Insufficient comparison evidence: this benchmark can’t be compared like for like with the quote, so it can’t support a price conclusion."
      : `The ${service!.label.toLowerCase()} rate (${cash(service!.rateCents)}) is ${Math.abs(benchmarkPercent)}% ${benchmarkPercent >= 0 ? "above" : "below"} the ${b.label} (${cash(b.rateCents!)}). A review cue, not a cap${b.comparable === "partial" ? ": and it’s only partly comparable" : ""}.`;
  return {
    lines,
    supplierCostCents,
    overheadMaxCents,
    overheadCents,
    ceilingCents,
    participantPriceCents: p.participantPriceCents,
    /** Whether the participant price is within the supplier cost plus the permitted overhead (self-managed only). */
    withinCeiling: ceilingCents === null || p.participantPriceCents === null ? null : p.participantPriceCents <= ceilingCents,
    agreement: p.agreement,
    benchmarkPercent,
    benchmarkText,
    /** Supplier lines to Trilogy Care that aren't the service itself: questions to ask, not separate participant fees. */
    passThrough: lines.filter((l) => l.kind === "travel" || l.kind === "admin"),
  };
}

// ---------------------------------------------------------------------------------------------
// The rest of the card: workers, evidence requests, the explanation, the corrected pack and renewal
// ---------------------------------------------------------------------------------------------

/** What a document field shows, so the case's own checks can run on it. */
export const FIELD_TAGS = {
  "": "Nothing special",
  abn: "ABN or entity",
  business_name: "Trading or business name",
  worker: "The worker",
  police: "Police certificate",
  ndis: "NDIS worker screening clearance",
  insurance: "Insurance",
  credential: "Licence or credential",
  scope: "Scope of service",
  rate: "Supplier rate",
  benchmark: "Benchmark",
  price: "Participant price",
  agreement: "Participant agreement",
} as const;
export type FieldTag = keyof typeof FIELD_TAGS;

/** What a rule rests on (PRD rule_source_type): a public rule, Trilogy Care policy, a supplier contract or a price benchmark. */
export const SOURCE_TYPES = {
  public_rule: "Public rule",
  internal_policy: "Trilogy Care policy",
  supplier_contract: "Supplier contract",
  price_benchmark: "Price benchmark: context only",
} as const;
export type SourceType = keyof typeof SOURCE_TYPES;

export type Worker = { id: string; label: string; role: string; fieldIds: string[] };
export type EvidenceRequest = {
  id: string;
  label: string;
  /** Who provides or checks it. */
  owner: string;
  needed: boolean;
  why: string;
  /** A misconception code, when it's asked for but not needed (for example, both screening routes). */
  code: string;
  tag: "" | "police";
};
export type FollowUp = {
  title: string;
  intro: string;
  /** Its own pack version, so a later attempt never inherits an older outcome. */
  version: string;
  /** What was checked before (renewal). */
  previously: string[];
  changes: string[];
  /** The checks that change; the rest stay as in the first pack. */
  axes: Axes;
  price: VettingPrice | null;
  decision: Decision;
  why: string;
  /** Renewal: what has to be renewed now. */
  renew: { id: string; label: string; needed: boolean; why: string }[];
  /** Renewal: whether a new price agreement is needed before the change, or null if not asked. */
  newAgreement: boolean | null;
  newAgreementWhy: string;
};
export const EXPLANATION_ELEMENTS = {
  checked: "What has been checked",
  outstanding: "What’s still outstanding",
  start: "Whether the worker can start yet",
  owner: "Who owns the next step, and when you’ll be back in touch",
  choice: "How their choice of worker is being respected",
} as const;
export type ExplanationElement = keyof typeof EXPLANATION_ELEMENTS;
export const RATIONALE_DECISIONS = { "": "Not decided", accepted: "Accepted", edited: "Accepted with edits", rejected: "Rejected" } as const;
export const REVIEW_DECISIONS = { "": "Not decided", keep: "Keep", revise: "Revise", retarget: "Retarget", withdraw: "Withdraw" } as const;
export type VettingRationale = {
  theme: string;
  themeId: string;
  behaviour: string;
  barrier: string;
  whyBlock: string;
  otherResponse: string;
  measure: string;
  owner: string;
  decision: keyof typeof RATIONALE_DECISIONS;
  review: keyof typeof REVIEW_DECISIONS;
};

export type VettingData = {
  packVersion: string;
  mode: "formative" | "assessed";
  participant: { name: string; goal: string; preferredWorker: string; desiredStart: string; approvedService: string; arrangement: string };
  workers: Worker[];
  axes: Axes;
  price: VettingPrice;
  requests: EvidenceRequest[];
  explanation: { model: string };
  /** The consequence of each wrong direction, for the debrief: unsafe progression and unnecessary rejection. */
  consequences: { unsafe: string; unnecessary: string };
  corrected: FollowUp | null;
  renewal: FollowUp | null;
  jobAid: { snippetId: string; why: string };
  rationale: VettingRationale;
};

/** Misconception and error codes (PRD section 8). Authored codes on findings and requests use these where they fit. */
export const VET_CODES: Record<string, string> = {
  ready_with_open_gap: "Marked the pack ready while a required check was still open",
  promised_start: "Told the participant the worker could start before the checks and the price agreement",
  unnecessary_rejection: "Said it can’t go ahead when the gaps can be corrected",
  screening_both_required: "Asked for a police certificate as well as a valid NDIS clearance",
  clearance_accepted_unverified: "Accepted a clearance without verifying it by the approved method",
  abn_as_clearance: "Treated an active ABN as proof about the worker",
  name_mismatch_as_fraud: "Treated a trading-name difference as a confirmed problem",
  median_as_cap: "Treated an above-median rate as a breach",
  supplier_fee_as_participant_fee: "Treated a supplier’s line to Trilogy Care as a separate participant fee",
  scope_silently_accepted: "Accepted an extra task as part of the approved service",
  agreement_skipped: "Missed that the participant hasn’t agreed the price",
  unneeded_document: "Asked for a document this supplier doesn’t need",
};
/** Codes that are critical errors: no pass in assessed mode. */
export const CRITICAL_CODES = ["ready_with_open_gap", "promised_start"] as const;
export const codeLabel = (c: string) => VET_CODES[c] ?? c.replace(/_/g, " ");

// ---------------------------------------------------------------------------------------------
// Reading it from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const centsOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
const LOCAL_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
const texts = (v: unknown, max: number, len = 300) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .slice(0, max)
        .map((x) => x.trim().slice(0, len))
    : [];
const DECISION_CODES = ["ready", "request_evidence", "escalate", "cannot_engage"] as const;

function parseAxes(v: unknown, where: string, h: ParseHelpers): Axes {
  const o = obj(v);
  const out: Axes = {};
  for (const k of AXIS_ORDER) {
    if (!(k in o)) continue;
    const a = obj(o[k]);
    out[k] = {
      state: oneOf(a.state, FIELD_STATE_ORDER, "needs_owner_review"),
      note: h.str(a.note, `${where}: the note on “${AXES[k]}”`, { max: 400 }) ?? "",
      owner: h.str(a.owner, `${where}: who owns “${AXES[k]}”`, { max: 160 }) ?? "",
      barrier: a.barrier === true,
    };
  }
  return out;
}

function parsePrice(v: unknown, where: string, h: ParseHelpers): VettingPrice {
  const o = obj(v);
  const seen = new Set<string>();
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 12).map((x, i): PriceLine => {
    const l = obj(x);
    const w = `${where} price line ${i + 1}`;
    let id = typeof l.id === "string" && LOCAL_ID.test(l.id) ? l.id : `line-${i + 1}`;
    if (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return {
      id,
      label: h.str(l.label, `${w} label`, { required: true, max: 160 }) ?? "",
      qty: num(l.qty),
      unit: h.str(l.unit, `${w} unit`, { max: 30 }) ?? "",
      rateCents: Math.round(num(l.rateCents)),
      kind: oneOf(l.kind, Object.keys(LINE_KINDS) as LineKind[], "other"),
      note: h.str(l.note, `${w} note`, { max: 300 }) ?? "",
    };
  });
  const b = o.benchmark && typeof o.benchmark === "object" ? obj(o.benchmark) : null;
  return {
    lines,
    selfManaged: o.selfManaged === true,
    overheadPercent: o.overheadPercent === null || o.overheadPercent === undefined || o.overheadPercent === "" ? null : num(o.overheadPercent),
    participantPriceCents: centsOrNull(o.participantPriceCents),
    participantUnit: h.str(o.participantUnit, `${where}: the participant price’s unit`, { max: 40 }) ?? "",
    agreement: oneOf(o.agreement, Object.keys(AGREEMENT) as AgreementState[], "none"),
    contribution: h.str(o.contribution, `${where}: contribution context`, { max: 400 }) ?? "",
    benchmark: b
      ? {
          label: h.str(b.label, `${where} benchmark label`, { required: true, max: 160 }) ?? "",
          source: h.str(b.source, `${where} benchmark source`, { required: true, max: 240 }) ?? "",
          url: typeof b.url === "string" && /^https:\/\//.test(b.url) ? b.url.slice(0, 400) : "",
          asAt: h.str(b.asAt, `${where} benchmark date`, { required: true, max: 40 }) ?? "",
          region: h.str(b.region, `${where} benchmark region`, { max: 160 }) ?? "",
          category: h.str(b.category, `${where} benchmark service category`, { max: 160 }) ?? "",
          measures: h.str(b.measures, `${where}: what the benchmark measures`, { required: true, max: 300 }) ?? "",
          rateCents: centsOrNull(b.rateCents),
          unit: h.str(b.unit, `${where} benchmark unit`, { max: 30 }) ?? "",
          comparable: oneOf(b.comparable, Object.keys(COMPARABILITY) as Comparability[], "insufficient"),
          notes: h.str(b.notes, `${where} benchmark notes`, { max: 400 }) ?? "",
        }
      : null,
  };
}

function parseFollowUp(v: unknown, where: string, h: ParseHelpers): FollowUp | null {
  if (!v || typeof v !== "object") return null;
  const o = obj(v);
  const seen = new Set<string>();
  return {
    title: h.str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: h.str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    version: h.str(o.version, `${where} version`, { required: true, max: 60 }) ?? "",
    previously: texts(o.previously, 10),
    changes: texts(o.changes, 10),
    axes: parseAxes(o.axes, where, h),
    price: o.price && typeof o.price === "object" ? parsePrice(o.price, where, h) : null,
    decision: oneOf(o.decision, DECISION_CODES, "request_evidence"),
    why: h.str(o.why, `${where}: why that’s the outcome`, { required: true, max: 800 }) ?? "",
    renew: (Array.isArray(o.renew) ? o.renew : []).slice(0, 8).flatMap((x, i) => {
      const r = obj(x);
      const id = typeof r.id === "string" && LOCAL_ID.test(r.id) && !seen.has(r.id) ? r.id : `renew-${i + 1}`;
      seen.add(id);
      return [
        {
          id,
          label: h.str(r.label, `${where} renewal item ${i + 1}`, { required: true, max: 200 }) ?? "",
          needed: r.needed === true,
          why: h.str(r.why, `${where} renewal item ${i + 1}: why`, { required: true, max: 400 }) ?? "",
        },
      ];
    }),
    newAgreement: typeof o.newAgreement === "boolean" ? o.newAgreement : null,
    newAgreementWhy: h.str(o.newAgreementWhy, `${where}: why a new agreement is or isn’t needed`, { max: 400 }) ?? "",
  };
}

/** The card's own fields, read from stored JSON. Its consistency checks are separate (vettingProblems), so a draft can be saved half-written. */
export function parseVetting(v: unknown, where: string, h: ParseHelpers, docFieldIds: Set<string>): VettingData | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = obj(v);
  const w = `${where} (vetting card)`;
  const p = obj(o.participant);
  const seenWorkers = new Set<string>();
  const seenRequests = new Set<string>();
  const ra = obj(o.rationale);
  const ja = obj(o.jobAid);
  const cq = obj(o.consequences);
  return {
    packVersion: h.str(o.packVersion, `${w}: the pack version`, { required: true, max: 60 }) ?? "",
    mode: o.mode === "assessed" ? "assessed" : "formative",
    participant: {
      name: h.str(p.name, `${w}: the participant`, { required: true, max: 80 }) ?? "",
      goal: h.str(p.goal, `${w}: the participant’s goal`, { required: true, max: 400 }) ?? "",
      preferredWorker: h.str(p.preferredWorker, `${w}: the preferred worker`, { required: true, max: 300 }) ?? "",
      desiredStart: h.str(p.desiredStart, `${w}: the desired start`, { max: 160 }) ?? "",
      approvedService: h.str(p.approvedService, `${w}: the approved service`, { required: true, max: 300 }) ?? "",
      arrangement: h.str(p.arrangement, `${w}: the self-management arrangement`, { max: 400 }) ?? "",
    },
    workers: (Array.isArray(o.workers) ? o.workers : []).slice(0, 6).map((x, i): Worker => {
      const r = obj(x);
      const id = typeof r.id === "string" && LOCAL_ID.test(r.id) && !seenWorkers.has(r.id) ? r.id : `worker-${i + 1}`;
      seenWorkers.add(id);
      return {
        id,
        label: h.str(r.label, `${w} worker ${i + 1}`, { required: true, max: 160 }) ?? "",
        role: h.str(r.role, `${w} worker ${i + 1}: their role`, { required: true, max: 200 }) ?? "",
        fieldIds: (Array.isArray(r.fieldIds) ? r.fieldIds : []).filter((f): f is string => typeof f === "string" && docFieldIds.has(f)).slice(0, 12),
      };
    }),
    axes: parseAxes(o.axes, w, h),
    price: parsePrice(o.price, w, h),
    requests: (Array.isArray(o.requests) ? o.requests : []).slice(0, 12).map((x, i): EvidenceRequest => {
      const r = obj(x);
      const id = typeof r.id === "string" && LOCAL_ID.test(r.id) && !seenRequests.has(r.id) ? r.id : `request-${i + 1}`;
      seenRequests.add(id);
      return {
        id,
        label: h.str(r.label, `${w} evidence request ${i + 1}`, { required: true, max: 240 }) ?? "",
        owner: h.str(r.owner, `${w} evidence request ${i + 1}: who`, { max: 160 }) ?? "",
        needed: r.needed === true,
        why: h.str(r.why, `${w} evidence request ${i + 1}: why`, { required: true, max: 400 }) ?? "",
        code: typeof r.code === "string" && /^[a-z_]{1,40}$/.test(r.code) ? r.code : "",
        tag: r.tag === "police" ? "police" : "",
      };
    }),
    explanation: { model: h.str(obj(o.explanation).model, `${w}: the model explanation to the participant`, { required: true, max: 1200 }) ?? "" },
    consequences: {
      unsafe: h.str(cq.unsafe, `${w}: the consequence of unsafe progression`, { required: true, max: 600 }) ?? "",
      unnecessary: h.str(cq.unnecessary, `${w}: the consequence of an unnecessary rejection`, { required: true, max: 600 }) ?? "",
    },
    corrected: parseFollowUp(o.corrected, `${w} corrected pack`, h),
    renewal: parseFollowUp(o.renewal, `${w} renewal`, h),
    jobAid: {
      snippetId: typeof ja.snippetId === "string" && /^[a-z0-9-]{1,80}$/.test(ja.snippetId) ? ja.snippetId : "",
      why: h.str(ja.why, `${w}: why the Job Aid belongs here`, { max: 300 }) ?? "",
    },
    rationale: {
      theme: h.str(ra.theme, `${w}: problem evidence`, { max: 600 }) ?? "",
      themeId: h.str(ra.themeId, `${w}: the theme id`, { max: 80 }) ?? "",
      behaviour: h.str(ra.behaviour, `${w}: intended behaviour`, { max: 600 }) ?? "",
      barrier: h.str(ra.barrier, `${w}: hypothesised barrier`, { max: 600 }) ?? "",
      whyBlock: h.str(ra.whyBlock, `${w}: why an interactive pack`, { max: 600 }) ?? "",
      otherResponse: h.str(ra.otherResponse, `${w}: other response`, { max: 600 }) ?? "",
      measure: h.str(ra.measure, `${w}: the work measure`, { max: 600 }) ?? "",
      owner: h.str(ra.owner, `${w}: the case owner`, { max: 160 }) ?? "",
      decision: oneOf(ra.decision, Object.keys(RATIONALE_DECISIONS) as VettingRationale["decision"][], ""),
      review: oneOf(ra.review, Object.keys(REVIEW_DECISIONS) as VettingRationale["review"][], ""),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The case's own checks: what the PRD (section 9) says must block publication
// ---------------------------------------------------------------------------------------------

type CaseShape = {
  title: string;
  docs: AuditDoc[];
  rules: { id: string; family: string; title: string; sourceType?: SourceType }[];
  findings: EvidenceItem[];
  decisions: Record<Decision, { credit: "full" | "partial" | "none"; offered?: boolean }>;
  vetting?: VettingData;
};
/** A rule's source type: authored, or the family's usual one (insurance and verification are Trilogy Care policy). */
export const sourceTypeOf = (r: { family: string; sourceType?: SourceType }): SourceType =>
  r.sourceType ?? (r.family === "insurance" || r.family === "verification" ? "internal_policy" : r.family === "benchmark" ? "price_benchmark" : "public_rule");

/**
  What makes a vetting case contradict itself, never waived (not even by a demo sign-off): a worker with no identity
  or role; a median presented as a cap; supplier and participant prices conflated or an overhead over 10%; a known
  blocker that could still reach Ready; the old police certificate treated as decisive beside a verified NDIS
  clearance; an insurance finding resting on anything but Trilogy Care policy or contract; a follow-up whose outcome
  doesn't follow from its checks. Every document field is in the accessible table by construction.
*/
export function vettingProblems(b: CaseShape): string[] {
  const v = b.vetting;
  if (!v) return [];
  const out: string[] = [];
  const t = `“${b.title}”`;
  const fields = new Map(b.docs.filter((d) => d.kind === "document").flatMap((d) => d.fields.map((f) => [f.id, f] as const)));
  const tagOf = (fieldId: string) => fields.get(fieldId)?.tag ?? "";
  const ruleOf = (id: string) => b.rules.find((r) => r.id === id);

  if (!v.workers.length) out.push(`${t}: name at least one worker (a fictional label and their role), linked to the documents about them.`);
  for (const w of v.workers)
    if (!w.label || !w.role || !w.fieldIds.length) out.push(`${t}: the worker “${w.label || w.id}” needs a role and the documents that identify them.`);

  // A benchmark is context, never a cap.
  for (const e of b.findings) {
    const s = stateOf(e);
    if ((e.axis === "benchmark_context" || tagOf(e.fieldId) === "benchmark") && (s === "material_gap" || e.categories.includes("material_gap")))
      out.push(`${t}: an above-benchmark price is a question for review, never a confirmed gap. A median isn’t a cap.`);
  }
  if (v.axes.benchmark_context?.state === "material_gap" || v.axes.benchmark_context?.barrier)
    out.push(`${t}: the benchmark check can’t be a material gap or a barrier. A median isn’t a cap.`);

  // Supplier and participant prices stay separate.
  const pv = priceView(v.price);
  if (v.price.overheadPercent !== null && (v.price.overheadPercent < 0 || v.price.overheadPercent > MAX_OVERHEAD_PERCENT))
    out.push(`${t}: the self-managed overhead must be between 0% and ${MAX_OVERHEAD_PERCENT}% of the supplier cost.`);
  if (v.price.overheadPercent !== null && !v.price.selfManaged) out.push(`${t}: a provider overhead applies only to a self-managed third-party arrangement.`);
  if (v.price.agreement === "agreed_in_writing" && v.price.participantPriceCents === null)
    out.push(`${t}: an agreement with the participant needs the participant price it agreed. Don’t let the supplier’s quote stand in for it.`);
  if (pv.withinCeiling === false) out.push(`${t}: the participant price is more than the supplier cost plus the permitted ${MAX_OVERHEAD_PERCENT}% overhead.`);
  if (v.axes.participant_price && isResolved(v.axes.participant_price.state) && v.price.participantPriceCents === null)
    out.push(`${t}: the participant price check is resolved, but no participant price is set.`);
  if (v.axes.price_agreement && isResolved(v.axes.price_agreement.state) && v.price.agreement !== "agreed_in_writing")
    out.push(`${t}: the price agreement check is resolved, but the participant hasn’t agreed in writing.`);

  // The outcome follows from the checks, and a known blocker can never reach Ready.
  const base = vettingOutcome(v.axes);
  if (base.outcome !== "ready" && b.decisions.ready.credit !== "none")
    out.push(`${t}: a check is still open (${base.open.map((x) => AXES[x.axis]).join(", ")}), so “Ready for engagement review” can’t earn credit.`);
  if (b.decisions[base.outcome].credit !== "full" || b.decisions[base.outcome].offered === false)
    out.push(`${t}: the checks lead to “${base.outcome.replace(/_/g, " ")}”, so that outcome must be offered and get full credit.`);
  for (const [k, f] of [
    ["corrected pack", v.corrected],
    ["renewal", v.renewal],
  ] as const) {
    if (!f) continue;
    const merged = { ...v.axes, ...f.axes };
    const o = vettingOutcome(merged);
    if (o.outcome !== f.decision) out.push(`${t}: the ${k}’s checks lead to “${o.outcome.replace(/_/g, " ")}”, not “${f.decision.replace(/_/g, " ")}”.`);
    if (f.version && f.version === v.packVersion) out.push(`${t}: the ${k} needs its own version, not the first pack’s.`);
    if (f.price && f.price.overheadPercent !== null && f.price.overheadPercent > MAX_OVERHEAD_PERCENT)
      out.push(`${t}: the ${k}’s overhead is more than ${MAX_OVERHEAD_PERCENT}%.`);
    if (f.price && priceView(f.price).withinCeiling === false)
      out.push(`${t}: the ${k}’s participant price is more than the supplier cost plus the permitted overhead.`);
  }

  // The accepted alternative: a valid NDIS clearance means the old police certificate isn't decisive.
  const ndisOk =
    v.axes.screening_route?.state === "different_rule" ||
    b.findings.some((e) => tagOf(e.fieldId) === "ndis" && isResolved(stateOf(e))) ||
    (v.corrected?.axes.screening_status && isResolved(v.corrected.axes.screening_status.state));
  if (ndisOk) {
    for (const e of b.findings)
      if (tagOf(e.fieldId) === "police" && (stateOf(e) === "material_gap" || e.categories.includes("material_gap")))
        out.push(`${t}: the old police certificate is treated as a gap, but a valid NDIS clearance is an accepted alternative route.`);
    for (const r of v.requests)
      if (r.tag === "police" && r.needed) out.push(`${t}: a new police certificate is marked as needed beside a valid NDIS clearance. Don’t demand both.`);
  }

  // Insurance rests on Trilogy Care policy or the contract, never presented as statute.
  for (const e of b.findings) {
    if (tagOf(e.fieldId) !== "insurance" && e.axis !== "insurance_status" && e.axis !== "insurance_rule") continue;
    const r = ruleOf(e.ruleId);
    if (r && !["internal_policy", "supplier_contract"].includes(sourceTypeOf(r)))
      out.push(
        `${t}: the insurance finding rests on “${r.title}”, which isn’t a Trilogy Care policy or contract source. Don’t present an internal threshold as statute.`,
      );
  }
  // Every red flag rests on a reviewed rule.
  for (const e of b.findings) if (!isResolved(stateOf(e)) && !ruleOf(e.ruleId)) out.push(`${t}: a finding has no reviewed rule or internal policy.`);
  return [...new Set(out)];
}
