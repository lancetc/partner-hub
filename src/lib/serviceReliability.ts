import { CATEGORIES, CAUSES, type Category, type Cause, type Duration, type Num } from "./workloadLens";
import { daysBetween, INSUFFICIENT, median, rate, type Rate } from "./referralJourney";
import { SERVICES, type Service } from "./suburbCoverage";

/*
  The Service Reliability Calculator ("What does a missed service cost?", docs/service-reliability.md): a deterministic
  event and cost model for the services a Care Partner business arranges. It follows each agreed, scheduled visit to
  its actual outcome, keeps who started a failure apart from what it cost, measures recovery to the actual suitable
  restored service, counts each recovery task once, and compares a specific reliability action with a specific
  referral push over the same horizon.

  It's shared by the story (fictional occurrences, one row each) and "Review my service reliability" (a partner's own
  aggregate counts), the learner's page, the server and the editor. No AI calculates or classifies anything.

    scheduled_visits                  = count(distinct agreed scheduled occurrences)
    verified_supplier_failure_rate    = verified supplier/worker-initiated missed occurrences / eligible scheduled occurrences
    restored_within_window_rate       = missed occurrences restored by a suitable delivered visit within the window
                                        / missed occurrences eligible for recovery review
    recovery_hours                    = Σ duration of each unique recovery task
    observed_direct_extra_cost        = recovery_hours × entered loaded hourly cost (where entered)
                                        + documented replacement premiums, credits and other direct costs the business bears
    modelled_prevented_occurrences    = affected_occurrences × assumed_reduction_share
    modelled_recovery_hours_released  = modelled_prevented_occurrences × observed recovery hours per affected occurrence
    modelled_direct_cost_change       = modelled_avoided_extra_cost − intervention_cost

  Reused definitions, imported rather than copied:
  - the Workload Lens's work categories and cause tags (lib/workloadLens): a recovery task has one category, so its
    time counts once, and causes are an overlay that never adds time;
  - the Referral Journey's rate and median helpers (lib/referralJourney): every rate carries its numerator and
    denominator, and a zero denominator is "insufficient data", never 0 %;
  - Local Coverage's service types (lib/suburbCoverage), so "cleaning" means the same thing in both calculators.

  Rules it keeps:
  - A booking or an invoice never shows a visit was delivered. A replacement booked but not delivered leaves the
    visit unresolved.
  - A participant's own cancellation or no-show is a different event from a supplier failure, with different rules.
    Unverified supplier reports are shown, but kept out of the verified supplier numerator. An unknown or disputed
    outcome stays in the denominator and is named.
  - Time to recovery runs from the agreed start to the actual suitable restored service. A still-open case shows its
    age; it's never a zero-day recovery, and never quietly dropped. Telling the participant is tracked separately.
  - Care, workload and money are separate results. Harm, dignity and trust are never given a dollar value; there's no
    lifetime client value and no "churn risk" score. A cost the business doesn't bear, or whose bearer isn't known, is
    shown apart, labelled "not assessed". A contractual fee effect needs a verified agreement and is never added in.
  - An intervention only reduces the affected subset it names, by the owner's own editable assumption. Every modelled
    figure is a forecast, never a realised result. Hours freed are either a labour cost or onboarding capacity, never both.
  - Blank, unknown and zero are three different things: a blank is an error to fix; "unknown" is kept out of the
    arithmetic and named; zero is zero.
  - Nothing here ranks options by money alone: the comparison answers four questions and gives no verdict.
*/

export const MODEL_VERSION = "service-reliability-1";
export const DEFINITIONS_VERSION = "reliability-definitions-1";

export const OUTCOMES = {
  delivered: "Delivered as agreed",
  late: "Delivered late",
  replaced: "Suitable replacement on the day",
  missed: "Not delivered",
  unknown: "Status unknown",
} as const;
export type Outcome = keyof typeof OUTCOMES;
export const OUTCOME_ORDER = Object.keys(OUTCOMES) as Outcome[];
export const OUTCOME_HINTS: Record<Outcome, string> = {
  delivered:
    "The agreed visit happened at the agreed time, shown by the supplier’s record or the participant. A booking or an invoice alone doesn’t show this.",
  late: "It happened, outside the agreed time window. Delivered, and shown so a pattern of lateness is visible.",
  replaced:
    "Another suitable, approved worker delivered it within the agreed window, with the participant’s agreement. Not a missed visit; the reason it needed replacing is still recorded.",
  missed: "It didn’t happen. Recovery is measured to the actual suitable restored service, never to a call or a booking.",
  unknown: "Nobody can yet say whether it happened (a disputed visit, a missing record). Kept in the denominator and named, never assumed either way.",
};

/** Who or what started it. Kept separate from the outcome, and not settled until it's verified. */
export const REASONS = {
  supplier: "Supplier or worker cancellation or no-show",
  booking: "Provider booking or handoff error",
  participant: "Participant’s own cancellation or no-show",
  pause: "Agreed pause",
  health: "Illness or hospital",
  access: "Weather or access",
  unknown: "Unknown or disputed",
} as const;
export type Reason = keyof typeof REASONS;
export const REASON_ORDER = Object.keys(REASONS) as Reason[];
export const REASON_HINTS: Record<Reason, string> = {
  supplier:
    "The supplier or worker cancelled or didn’t arrive. Counted in the supplier failure rate only once verified, and never a reason to penalise a worker on an uninvestigated report.",
  booking: "The provider’s own booking, roster change or handoff went wrong. The business’s process to fix, not the supplier’s failure.",
  participant: "The participant cancelled late or wasn’t home. Different rules apply under Support at Home; never a supplier failure.",
  pause: "A pause the participant agreed (a holiday, a family visit). Not a failure of anyone’s.",
  health: "The participant was unwell or in hospital. Not a service failure; their changed needs may need a review.",
  access: "Weather, a road closure or no way in. Still needs recovery if the person needs the service.",
  unknown: "Not yet known, or disputed (the supplier says the visit happened; the participant says it didn’t). Stays visible until it’s resolved.",
};
/** Misses that need a recovery review: the person still needed the service and didn't choose to go without it. */
export const RECOVERY_REASONS: readonly Reason[] = ["supplier", "booking", "access", "unknown"];

export const TIME_WINDOWS = {
  early: "Early (before 9 am)",
  morning: "Morning (9 am to noon)",
  afternoon: "Afternoon (noon to 5 pm)",
  evening: "Evening (after 5 pm)",
} as const;
export type Window = keyof typeof TIME_WINDOWS;
export const WINDOW_ORDER = Object.keys(TIME_WINDOWS) as Window[];

/** Restoration time, in grouped bands (aggregate entry). Bands never produce an exact median. */
export const RESTORE_BANDS = { d0: "Same day", d1_2: "1–2 days", d3_7: "3–7 days", d8: "Over 7 days" } as const;
export type RestoreBand = keyof typeof RESTORE_BANDS;
export const BAND_ORDER = Object.keys(RESTORE_BANDS) as RestoreBand[];
export const bandOf = (days: number): RestoreBand => (days <= 0 ? "d0" : days <= 2 ? "d1_2" : days <= 7 ? "d3_7" : "d8");
/** The restoration windows an owner can choose: each lines up with the bands, so aggregate and exact counts agree. */
export const RESTORE_WINDOWS = [0, 2, 7] as const;
export const windowLabel = (d: number) => (d === 0 ? "the same day" : `${d} days`);

export const EVIDENCE_SOURCES = {
  fictional: "Fictional",
  estimate: "Entered estimate",
  verified: "Verified operational",
  unknown: "Unknown",
} as const;
export type EvidenceSource = keyof typeof EVIDENCE_SOURCES;

export const COST_KINDS = {
  premium: "Replacement premium",
  credit: "Credit or refund",
  direct: "Other direct cost (travel, cover)",
  fee: "Contractual partner fee effect",
} as const;
export type CostKind = keyof typeof COST_KINDS;
export const COST_ORDER = Object.keys(COST_KINDS) as CostKind[];

export const BEARS = { yes: "Paid by the business", no: "Not a cost to the business", unknown: "Not yet known" } as const;
export type Bears = keyof typeof BEARS;

export const INTERVENTION_KINDS = {
  backup: "A verified backup arrangement",
  confirmation: "Earlier confirmation of supplier availability",
  handoff: "A booking or handoff fix",
  supplier: "A supplier correction plan",
  other: "Another specific action",
} as const;
export type InterventionKind = keyof typeof INTERVENTION_KINDS;

export type Amount = number | null | "unknown";
export type { Num, Duration };

/** One agreed, scheduled visit and its actual outcome (the fictional story: one row each, opaque ids). */
export type Occurrence = {
  id: string;
  /** The agreed scheduled start, YYYY-MM-DD. */
  date: string;
  service: Service;
  window: Window;
  /** Essential support under reviewed rules (personal care, meals, medication prompts). */
  essential: boolean;
  outcome: Outcome;
  /** "" when it was delivered as agreed and nothing started a problem. */
  reason: Reason | "";
  /** Whether the reason has been verified. A supplier reason counts in the supplier rate only once verified. */
  verified: boolean;
  /** The service issue group it belongs to ("" none): one recurring problem, not one "save" per call. */
  issue: string;
  /** Recovery dates, YYYY-MM-DD or "". A booking isn't a restored service. */
  contacted: string;
  booked: string;
  restored: string;
  /** When the participant was told what's happening: tracked apart from restoration. */
  updated: string;
  owner: string;
  /** The participant's own preferred response, in a few words. */
  preference: string;
  /** Fictional cases only: who it was for. Real-mode entries are aggregate and never name anyone. */
  who: string;
  evidence: string;
  evidenceOn: string;
  source: EvidenceSource;
};

/** Grouped counts for one service and time window (the story's routine visits, or a partner's whole period). */
export type CountRow = {
  id: string;
  /** A private label the owner will recognise. Never a participant or worker. */
  label: string;
  service: Service;
  window: Window;
  /** 0-based week of the period, or null for the whole period. */
  week: number | null;
  delivered: Num;
  late: Num;
  replaced: Num;
  unknown: Num;
  missed: Record<Reason, Num>;
  /** How many of missed.supplier aren't verified yet. */
  unverified: Num;
  /** Recovery of the misses that need it: restored by band, booked but not delivered, or nothing yet. */
  restored: Record<RestoreBand, Num>;
  booked: Num;
  unresolved: Num;
  /** Of those still open, how many are essential support. */
  essentialOpen: Num;
  /** Recurring issue groups seen in this row. */
  repeatIssues: Num;
  source: EvidenceSource;
};

export type Issue = { id: string; label: string; note: string };

/** One unique piece of recovery work. Its time counts once; causes are an overlay. */
export type RecoveryTask = {
  id: string;
  label: string;
  category: Category;
  causes: Cause[];
  /** The occurrence it served (story), or "". */
  occurrence: string;
  issue: string;
  /** Aggregate entry: the reason of the misses it served, when there's no occurrence. */
  reason: Reason | "";
  week: number | null;
  count: Num;
  minutes: Duration;
};

export type CostItem = {
  id: string;
  label: string;
  kind: CostKind;
  amount: Amount;
  bears: Bears;
  occurrence: string;
  issue: string;
  reason: Reason | "";
  source: EvidenceSource;
};

export type Intervention = {
  id: string;
  label: string;
  kind: InterventionKind;
  /** The subset it can affect: a reason and/or an issue group. Never every visit. */
  reason: Reason | "";
  issue: string;
  /** How many of that subset's misses it's aimed at. Story: blank uses the subset; aggregate: required. */
  affected: Num;
  /** The share it's assumed to prevent, 0 to 1: the owner's own, evidence-based assumption. */
  reduction: Num;
  oneOff: Num;
  /** Recurring cost per four weeks. */
  recurring: Num;
  /** Coordinator hours the action itself takes per four weeks. */
  hours: Num;
  starts: string;
  owner: string;
  evidence: string;
  active: boolean;
};

/** "More leads": a specific referral push, from the Referral Journey and Next 10 Clients tools, entered by hand. */
export type Leads = {
  active: boolean;
  label: string;
  /** Relationship and planning effort, hours over the horizon. */
  effortHours: Num;
  cost: Num;
  enquiries: Num;
  /** Expected starts: an assumption, with its source. */
  starts: Num;
  /** Weeks until the first of those starts. */
  firstStartWeeks: Num;
  onboardingPerStart: Num;
  source: EvidenceSource;
  note: string;
};

export type ReliabilityInputs = {
  period: { start: string; weeks: Num; asOf: string };
  /** What's in scope: "Cleaning and personal-care visits arranged by the business". */
  scope: string;
  /** The restoration window, in days: 0, 2 or 7. */
  windowDays: Num;
  /** Loaded hourly cost of recovery work. "unknown" means not assessed. */
  hourly: Amount;
  occurrences: Occurrence[];
  rows: CountRow[];
  issues: Issue[];
  tasks: RecoveryTask[];
  costs: CostItem[];
  interventions: Intervention[];
  /** Whether hours an intervention frees are read as a labour cost avoided, or as onboarding capacity. Never both. */
  freedHours: "labour" | "onboarding";
  /** The comparison horizon, in weeks. */
  horizonWeeks: Num;
  leads: Leads;
  /** Guardrails: spare onboarding hours over the horizon, and the target days to tell a participant. */
  onboardingHours: Num;
  updateTarget: Num;
  /** The previous period, for a trend. Blank label: none. */
  comparison: { label: string; scheduled: Num; supplierMissed: Num };
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: Num | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;
export const addDays = (iso: string, k: number) => new Date(Date.parse(iso) + k * DAY).toISOString().slice(0, 10);
export const dateLabel = (iso: string) =>
  DATE.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "no date";
/** "$290", "$217.50", "−$17.50". */
export const money = (v: number) => {
  const a = Math.abs(round2(v));
  const s = Number.isInteger(a) ? a.toLocaleString("en-AU") : a.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}$${s}`;
};
export const hrs = (v: number) => `${round1(v)} h`;
export const NOT_ASSESSED = "not assessed";
export const taskHours = (t: Pick<RecoveryTask, "count" | "minutes">): number | null => (typeof t.minutes === "number" ? (n(t.count) * t.minutes) / 60 : null);
const zeroBy = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
export const missedTotal = (r: Pick<CountRow, "missed">) => REASON_ORDER.reduce((a, k) => a + n(r.missed[k]), 0);
export const rowScheduled = (r: CountRow) => n(r.delivered) + n(r.late) + n(r.replaced) + n(r.unknown) + missedTotal(r);
const recoveryEligibleOf = (r: CountRow) => RECOVERY_REASONS.reduce((a, k) => a + n(r.missed[k]), 0);
export const periodEnd = (i: Pick<ReliabilityInputs, "period">) => (DATE.test(i.period.start) ? addDays(i.period.start, n(i.period.weeks) * 7 - 1) : "");
export const weekOf = (i: Pick<ReliabilityInputs, "period">, date: string) => Math.floor(daysBetween(i.period.start, date) / 7);
/** A miss counted in the verified supplier numerator. */
export const isVerifiedSupplierMiss = (o: Pick<Occurrence, "outcome" | "reason" | "verified">) =>
  o.outcome === "missed" && o.reason === "supplier" && o.verified;
const reasonOf = (o: Pick<Occurrence, "reason">): Reason => o.reason || "unknown";
const needsRecovery = (o: Occurrence) => o.outcome === "missed" && RECOVERY_REASONS.includes(reasonOf(o));

// ---------------------------------------------------------------------------------------------
// Validation: blank is not zero
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

export function validateInputs(i: ReliabilityInputs): InputError[] {
  const out: InputError[] = [];
  const need = (v: Num | undefined, field: string, label: string, { min = 0, max = 100000 } = {}) => {
    if (v === null || v === undefined || Number.isNaN(v)) out.push({ field, message: `${label} is blank. Enter a number (0 if there’s none).` });
    else if (v < min || v > max) out.push({ field, message: `${label} must be between ${min} and ${max}.` });
  };
  const amount = (v: Amount, field: string, label: string) => {
    if (v === null || (typeof v === "number" && Number.isNaN(v))) out.push({ field, message: `${label} is blank. Enter it, or mark it not assessed.` });
    else if (typeof v === "number" && (v < 0 || v > 1_000_000)) out.push({ field, message: `${label} must be between 0 and 1,000,000.` });
  };
  if (!DATE.test(i.period.start)) out.push({ field: "period.start", message: "Choose the first day of the period." });
  if (i.period.weeks !== 4 && i.period.weeks !== 8) out.push({ field: "period.weeks", message: "The period is four or eight weeks." });
  if (!DATE.test(i.period.asOf)) out.push({ field: "period.asOf", message: "Choose the date the figures are as of." });
  const end = periodEnd(i);
  if (end && DATE.test(i.period.asOf) && i.period.asOf < end)
    out.push({ field: "period.asOf", message: "The figures need to be as of the period’s end or later." });
  if (!RESTORE_WINDOWS.includes(i.windowDays as 0 | 2 | 7))
    out.push({ field: "windowDays", message: "Choose a restoration window: the same day, 2 days or 7 days." });
  amount(i.hourly, "hourly", "The loaded hourly cost of recovery work");
  if (!i.occurrences.length && !i.rows.length) out.push({ field: "rows", message: "Add the period’s scheduled visits." });
  const ids = new Set<string>();
  for (const o of i.occurrences) {
    const name = `Visit ${o.id}`;
    if (ids.has(o.id)) out.push({ field: `occ.${o.id}`, message: `${name} appears twice: one scheduled visit is one row.` });
    ids.add(o.id);
    if (!DATE.test(o.date) || (end && (o.date < i.period.start || o.date > end)))
      out.push({ field: `occ.${o.id}.date`, message: `${name}: its date is outside the period.` });
    if (o.outcome === "missed" && !o.reason)
      out.push({ field: `occ.${o.id}.reason`, message: `${name}: a missed visit needs a reason (“unknown or disputed” is a valid one).` });
    for (const k of ["contacted", "booked", "restored", "updated"] as const) {
      const d = o[k];
      if (!d) continue;
      if (!DATE.test(d) || d < o.date) out.push({ field: `occ.${o.id}.${k}`, message: `${name}: the ${k} date is before the visit.` });
      else if (DATE.test(i.period.asOf) && d > i.period.asOf)
        out.push({ field: `occ.${o.id}.${k}`, message: `${name}: the ${k} date is after the figures’ date.` });
    }
    if (o.restored && o.outcome !== "missed") out.push({ field: `occ.${o.id}.restored`, message: `${name}: only a missed visit is restored later.` });
  }
  for (const r of i.rows) {
    const name = r.label || `${SERVICES[r.service]}, ${TIME_WINDOWS[r.window].toLowerCase()}`;
    for (const k of ["delivered", "late", "replaced", "unknown"] as const) need(r[k], `row.${r.id}.${k}`, `${name}: ${OUTCOMES[k].toLowerCase()}`);
    for (const k of REASON_ORDER) need(r.missed[k], `row.${r.id}.missed.${k}`, `${name}: missed (${REASONS[k].toLowerCase()})`);
    need(r.unverified, `row.${r.id}.unverified`, `${name}: supplier misses not yet verified`);
    if (n(r.unverified) > n(r.missed.supplier))
      out.push({ field: `row.${r.id}.unverified`, message: `${name}: more unverified supplier misses than supplier misses.` });
    for (const b of BAND_ORDER) need(r.restored[b], `row.${r.id}.restored.${b}`, `${name}: restored (${RESTORE_BANDS[b].toLowerCase()})`);
    need(r.booked, `row.${r.id}.booked`, `${name}: replacement booked, not delivered`);
    need(r.unresolved, `row.${r.id}.unresolved`, `${name}: still unresolved`);
    need(r.essentialOpen, `row.${r.id}.essentialOpen`, `${name}: essential visits still open`);
    need(r.repeatIssues, `row.${r.id}.repeatIssues`, `${name}: recurring issue groups`);
    const eligible = recoveryEligibleOf(r);
    const accounted = BAND_ORDER.reduce((a, b) => a + n(r.restored[b]), 0) + n(r.booked) + n(r.unresolved);
    if (accounted !== eligible)
      out.push({
        field: `row.${r.id}.unresolved`,
        message: `${name}: ${eligible} ${eligible === 1 ? "miss needs" : "misses need"} recovery, but restored, booked and unresolved add to ${accounted}. Account for each one.`,
      });
    if (n(r.essentialOpen) > n(r.booked) + n(r.unresolved))
      out.push({ field: `row.${r.id}.essentialOpen`, message: `${name}: more essential visits open than visits open.` });
  }
  for (const t of i.tasks) {
    const tl = `Recovery task “${t.label || t.id}”`;
    need(t.count, `task.${t.id}.count`, `${tl}: how many`, { max: 500 });
    if (t.minutes === null || (typeof t.minutes === "number" && Number.isNaN(t.minutes)))
      out.push({ field: `task.${t.id}.minutes`, message: `${tl}: minutes are blank. Enter them, or mark them “not measured”.` });
    else if (typeof t.minutes === "number" && (t.minutes < 0 || t.minutes > 600))
      out.push({ field: `task.${t.id}.minutes`, message: `${tl}: minutes must be between 0 and 600.` });
    if (t.occurrence && !ids.has(t.occurrence)) out.push({ field: `task.${t.id}.occurrence`, message: `${tl} names a visit that isn’t here.` });
  }
  for (const c of i.costs) {
    const cl = `Cost “${c.label || c.id}”`;
    amount(c.amount, `cost.${c.id}.amount`, `${cl}: amount`);
    if (c.kind === "fee" && c.source !== "verified")
      out.push({
        field: `cost.${c.id}.source`,
        message: `${cl}: a fee effect is entered only from an approved agreement or finance record. Otherwise leave it out.`,
      });
    if (c.occurrence && !ids.has(c.occurrence)) out.push({ field: `cost.${c.id}.occurrence`, message: `${cl} names a visit that isn’t here.` });
  }
  for (const x of i.interventions.filter((y) => y.active)) {
    const xl = `“${x.label || "The action"}”`;
    if (!x.reason && !x.issue) out.push({ field: `x.${x.id}.reason`, message: `${xl}: name the reason or issue group it’s aimed at, not every visit.` });
    need(x.reduction, `x.${x.id}.reduction`, `${xl}: the share it’s assumed to prevent`, { max: 1 });
    need(x.oneOff, `x.${x.id}.oneOff`, `${xl}: one-off cost`);
    need(x.recurring, `x.${x.id}.recurring`, `${xl}: recurring cost`);
    need(x.hours, `x.${x.id}.hours`, `${xl}: hours it takes`, { max: 400 });
    const subset = subsetCount(i, x);
    if (!i.occurrences.length) need(x.affected, `x.${x.id}.affected`, `${xl}: how many misses it’s aimed at`);
    if (x.affected !== null && n(x.affected) > subset)
      out.push({ field: `x.${x.id}.affected`, message: `${xl}: aimed at ${n(x.affected)} misses, but only ${subset} are in that group.` });
  }
  need(i.horizonWeeks, "horizonWeeks", "The comparison horizon", { min: 1, max: 52 });
  if (i.leads.active) {
    const L = "The referral push";
    need(i.leads.effortHours, "leads.effortHours", `${L}: effort hours`, { max: 400 });
    need(i.leads.cost, "leads.cost", `${L}: direct cost`);
    need(i.leads.enquiries, "leads.enquiries", `${L}: expected enquiries`, { max: 500 });
    need(i.leads.starts, "leads.starts", `${L}: expected starts`, { max: 500 });
    need(i.leads.firstStartWeeks, "leads.firstStartWeeks", `${L}: weeks to the first start`, { max: 104 });
    need(i.leads.onboardingPerStart, "leads.onboardingPerStart", `${L}: onboarding hours per start`, { max: 100 });
    if (n(i.leads.starts) > n(i.leads.enquiries)) out.push({ field: "leads.starts", message: `${L}: more starts than enquiries.` });
    need(i.onboardingHours, "onboardingHours", "Spare onboarding hours over the horizon", { max: 2000 });
  }
  if (i.comparison.label) {
    need(i.comparison.scheduled, "comparison.scheduled", "The comparison period’s scheduled visits");
    need(i.comparison.supplierMissed, "comparison.supplierMissed", "The comparison period’s verified supplier misses");
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------------------------

export type RecoveryCase = {
  id: string;
  who: string;
  date: string;
  service: Service;
  essential: boolean;
  issue: string;
  status: "restored" | "booked" | "unresolved";
  /** Restored: days from the agreed start to the restored service. Open: its age at the figures' date. */
  days: number;
  within: boolean;
  updateDays: number | null;
};

export type PatternRow = { service: Service; window: Window; scheduled: number; supplier: number; missed: number; per100: number | null };

export type InterventionResult = {
  id: string;
  label: string;
  kind: InterventionKind;
  subset: number;
  affected: number;
  reduction: number;
  /** Observed, on the subset: recovery hours and the business's direct costs per affected miss. */
  perHours: number | null;
  perCost: number | null;
  perItems: number | null;
  prevented: number;
  hoursReleased: number;
  ownHours: number;
  netHours: number;
  /** null: not assessed (no loaded hourly cost, and nothing else to avoid). */
  avoided: number | null;
  labourAssessed: boolean;
  cost: number;
  change: number | null;
  /** Always true: a modelled figure, never a realised result. */
  forecast: true;
  trail: string[];
};

export type LeadsResult = {
  label: string;
  effortHours: number;
  cost: number;
  enquiries: number;
  starts: number;
  firstStartWeeks: number;
  onboardingNeeded: number;
  onboardingSpare: number;
  shortfall: number;
  beyondHorizon: boolean;
  warnings: string[];
};

export type ReliabilityResult = {
  modelVersion: string;
  definitionsVersion: string;
  period: { start: string; end: string; weeks: number; asOf: string };
  scheduled: number;
  outcomes: Record<Outcome, number>;
  missedBy: Record<Reason, number>;
  supplierVerified: number;
  supplierUnverified: number;
  supplierRate: Rate;
  reasonRates: Record<Reason, Rate>;
  pattern: PatternRow[];
  weeks: { week: number; scheduled: number; delivered: number; late: number; replaced: number; missed: number; unknown: number }[];
  recovery: {
    windowDays: number;
    eligible: number;
    withinWindow: Rate;
    restored: number;
    booked: number;
    unresolved: number;
    openBeyondWindow: number;
    essentialOpen: number;
    /** Exact days for restored cases with dates; the median comes from these only. */
    exact: number[];
    median: number | null;
    bands: Record<RestoreBand, number>;
    cases: RecoveryCase[];
    updateMedian: number | null;
    notUpdated: number;
  };
  repeat: {
    issues: { id: string; label: string; visits: number; weeks: number[] }[];
    repeatVisits: number;
    oneOff: number;
    affectedVisits: number;
    rowGroups: number;
  };
  effort: {
    hours: number;
    tasks: number;
    unmeasured: number;
    byCategory: Record<Category, number>;
    byCause: Record<Cause, number>;
    byWeek: { week: number | null; hours: number }[];
    byReason: Record<Reason | "unlinked", number>;
    visitsWithTasks: number;
    partitionOk: boolean;
  };
  cost: {
    hourly: Amount;
    labour: number | null;
    borne: Record<Exclude<CostKind, "fee">, number>;
    notBorne: { label: string; amount: number }[];
    notAssessed: { label: string; why: string }[];
    fee: { label: string; amount: Amount }[];
    observedDirect: number;
    labourAssessed: boolean;
    trail: string;
  };
  interventions: InterventionResult[];
  horizon: number;
  freedHours: "labour" | "onboarding";
  leads: LeadsResult | null;
  trend: { label: string; rate: Rate } | null;
  findings: string[];
};

/** How many verified misses fall in an action's subset. */
export function subsetCount(i: ReliabilityInputs, x: Pick<Intervention, "reason" | "issue">): number {
  if (i.occurrences.length) return subsetOccurrences(i, x).length;
  if (!x.reason) return 0;
  return i.rows.reduce((a, r) => a + n(r.missed[x.reason as Reason]) - (x.reason === "supplier" ? n(r.unverified) : 0), 0);
}
function subsetOccurrences(i: ReliabilityInputs, x: Pick<Intervention, "reason" | "issue">) {
  if (!x.reason && !x.issue) return [];
  return i.occurrences.filter(
    (o) =>
      o.outcome === "missed" &&
      (!x.reason || reasonOf(o) === x.reason) &&
      (!x.issue || o.issue === x.issue) &&
      // A supplier failure is targeted only once it's verified.
      (reasonOf(o) !== "supplier" || o.verified),
  );
}

export function calculate(i: ReliabilityInputs): ReliabilityResult {
  const W = n(i.period.weeks);
  const windowDays = n(i.windowDays);
  const outcomes = zeroBy(OUTCOME_ORDER);
  const missedBy = zeroBy(REASON_ORDER);
  let supplierVerified = 0;
  let supplierUnverified = 0;
  const pattern = new Map<string, PatternRow>();
  const pat = (service: Service, window: Window) => {
    const k = `${service}/${window}`;
    const p = pattern.get(k) ?? { service, window, scheduled: 0, supplier: 0, missed: 0, per100: null };
    pattern.set(k, p);
    return p;
  };
  const weeks = Array.from({ length: Math.max(0, W) }, (_, week) => ({ week, scheduled: 0, delivered: 0, late: 0, replaced: 0, missed: 0, unknown: 0 }));
  const wk = (w: number | null) => (w !== null && w >= 0 && w < weeks.length ? weeks[w] : null);

  // Occurrences, one row each.
  for (const o of i.occurrences) {
    outcomes[o.outcome] += 1;
    const p = pat(o.service, o.window);
    p.scheduled += 1;
    const w = wk(weekOf(i, o.date));
    if (w) {
      w.scheduled += 1;
      w[o.outcome] += 1;
    }
    if (o.outcome === "missed") {
      missedBy[reasonOf(o)] += 1;
      p.missed += 1;
      if (reasonOf(o) === "supplier") {
        if (o.verified) {
          supplierVerified += 1;
          p.supplier += 1;
        } else supplierUnverified += 1;
      }
    }
  }
  // Grouped counts.
  const bands = zeroBy(BAND_ORDER);
  let rowBooked = 0;
  let rowUnresolved = 0;
  let rowEssential = 0;
  let rowGroups = 0;
  for (const r of i.rows) {
    for (const k of ["delivered", "late", "replaced", "unknown"] as const) outcomes[k] += n(r[k]);
    const missed = missedTotal(r);
    outcomes.missed += missed;
    for (const k of REASON_ORDER) missedBy[k] += n(r.missed[k]);
    const verified = n(r.missed.supplier) - n(r.unverified);
    supplierVerified += verified;
    supplierUnverified += n(r.unverified);
    const p = pat(r.service, r.window);
    p.scheduled += rowScheduled(r);
    p.missed += missed;
    p.supplier += verified;
    const w = wk(r.week);
    if (w) {
      w.scheduled += rowScheduled(r);
      for (const k of ["delivered", "late", "replaced", "unknown"] as const) w[k] += n(r[k]);
      w.missed += missed;
    }
    for (const b of BAND_ORDER) bands[b] += n(r.restored[b]);
    rowBooked += n(r.booked);
    rowUnresolved += n(r.unresolved);
    rowEssential += n(r.essentialOpen);
    rowGroups += n(r.repeatIssues);
  }
  const scheduled = OUTCOME_ORDER.reduce((a, k) => a + outcomes[k], 0);
  for (const p of pattern.values()) p.per100 = p.scheduled > 0 ? round1((p.supplier / p.scheduled) * 100) : null;

  // Recovery: to the actual suitable restored service. Open cases keep their age.
  const cases: RecoveryCase[] = i.occurrences.filter(needsRecovery).map((o) => {
    const status = o.restored ? "restored" : o.booked ? "booked" : "unresolved";
    const days = o.restored ? daysBetween(o.date, o.restored) : daysBetween(o.date, i.period.asOf);
    return {
      id: o.id,
      who: o.who,
      date: o.date,
      service: o.service,
      essential: o.essential,
      issue: o.issue,
      status,
      days,
      within: status === "restored" && days <= windowDays,
      updateDays: o.updated ? daysBetween(o.date, o.updated) : null,
    };
  });
  for (const c of cases) if (c.status === "restored") bands[bandOf(c.days)] += 1;
  const exact = cases.filter((c) => c.status === "restored").map((c) => c.days);
  const rowsEligible = i.rows.reduce((a, r) => a + recoveryEligibleOf(r), 0);
  const eligible = cases.length + rowsEligible;
  const rowWithin = i.rows.reduce((a, r) => a + n(r.restored.d0) + (windowDays >= 2 ? n(r.restored.d1_2) : 0) + (windowDays >= 7 ? n(r.restored.d3_7) : 0), 0);
  const restoredWithin = cases.filter((c) => c.within).length + rowWithin;
  const open = cases.filter((c) => c.status !== "restored");
  const updates = cases.map((c) => c.updateDays).filter((d): d is number => d !== null);

  // Repeat issues: unique affected visits beside the recurring groups. No double count.
  const affected = i.occurrences.filter((o) => o.outcome !== "delivered" || o.reason);
  const issues = i.issues
    .map((g) => {
      const visits = affected.filter((o) => o.issue === g.id);
      return { id: g.id, label: g.label, visits: visits.length, weeks: [...new Set(visits.map((o) => weekOf(i, o.date)))].sort((a, b) => a - b) };
    })
    .filter((g) => g.visits > 0);
  const repeatVisits = issues.filter((g) => g.visits >= 2).reduce((a, g) => a + g.visits, 0);

  // Effort: each unique task once. Causes are an overlay.
  const occ = new Map(i.occurrences.map((o) => [o.id, o]));
  const byCategory = zeroBy(Object.keys(CATEGORIES) as Category[]);
  const byCause = zeroBy(Object.keys(CAUSES) as Cause[]);
  const byReason = zeroBy([...REASON_ORDER, "unlinked"] as (Reason | "unlinked")[]);
  const byWeek = new Map<number | null, number>();
  let hours = 0;
  let unmeasured = 0;
  for (const t of i.tasks) {
    const h = taskHours(t);
    if (h === null) {
      unmeasured += 1;
      continue;
    }
    hours += h;
    byCategory[t.category] += h;
    for (const c of new Set(t.causes.length ? t.causes : (["noRework"] as Cause[]))) byCause[c] += h;
    const o = t.occurrence ? occ.get(t.occurrence) : undefined;
    const reason = o ? reasonOf(o) : t.reason;
    byReason[reason || "unlinked"] += h;
    const week = o ? weekOf(i, o.date) : t.week;
    byWeek.set(week, (byWeek.get(week) ?? 0) + h);
  }
  const visitsWithTasks = new Set(i.tasks.map((t) => t.occurrence).filter(Boolean)).size;
  const r2 = <K extends string>(r: Record<K, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v as number)])) as Record<K, number>;

  // Cost: observed, entered, and what the business actually bears. Fees are shown apart and never added.
  const hourly = i.hourly;
  const labourAssessed = typeof hourly === "number";
  const labour = labourAssessed ? round2(hours * (hourly as number)) : null;
  const borne = { premium: 0, credit: 0, direct: 0 };
  const notBorne: { label: string; amount: number }[] = [];
  const notAssessed: { label: string; why: string }[] = [];
  const fee: { label: string; amount: Amount }[] = [];
  for (const c of i.costs) {
    if (c.kind === "fee") {
      fee.push({ label: c.label, amount: c.amount });
      continue;
    }
    if (typeof c.amount !== "number") notAssessed.push({ label: c.label, why: "amount not known" });
    else if (c.bears === "yes") borne[c.kind] += c.amount;
    else if (c.bears === "no") notBorne.push({ label: c.label, amount: c.amount });
    else notAssessed.push({ label: c.label, why: "who bears it isn’t known" });
  }
  const items = borne.premium + borne.credit + borne.direct;
  const observedDirect = round2((labour ?? 0) + items);
  const trailParts = [
    labourAssessed ? `${hrs(hours)} × ${money(hourly as number)} = ${money(labour!)} recovery labour` : `${hrs(hours)} recovery labour (cost ${NOT_ASSESSED})`,
    ...(borne.premium ? [`${money(borne.premium)} replacement premiums`] : []),
    ...(borne.credit ? [`${money(borne.credit)} credits or refunds`] : []),
    ...(borne.direct ? [`${money(borne.direct)} other direct costs`] : []),
  ];

  // Interventions: only the affected subset, by the owner's assumption, over the horizon. Forecasts.
  const horizon = n(i.horizonWeeks) || W;
  const scale = W > 0 ? horizon / W : 1;
  const interventions = i.interventions
    .filter((x) => x.active)
    .map((x): InterventionResult => {
      const subset = subsetCount(i, x);
      const affectedN = x.affected === null ? subset : Math.min(n(x.affected), subset);
      let subsetHours = 0;
      let subsetItems = 0;
      if (i.occurrences.length) {
        const ids = new Set(subsetOccurrences(i, x).map((o) => o.id));
        for (const t of i.tasks)
          if ((t.occurrence && ids.has(t.occurrence)) || (!t.occurrence && x.issue && t.issue === x.issue)) subsetHours += taskHours(t) ?? 0;
        for (const c of i.costs)
          if (
            c.kind !== "fee" &&
            c.bears === "yes" &&
            typeof c.amount === "number" &&
            ((c.occurrence && ids.has(c.occurrence)) || (!c.occurrence && x.issue && c.issue === x.issue))
          )
            subsetItems += c.amount;
      } else if (x.reason) {
        for (const t of i.tasks) if (t.reason === x.reason) subsetHours += taskHours(t) ?? 0;
        for (const c of i.costs) if (c.kind !== "fee" && c.bears === "yes" && typeof c.amount === "number" && c.reason === x.reason) subsetItems += c.amount;
      }
      const perHours = subset > 0 ? subsetHours / subset : null;
      const perItems = subset > 0 ? subsetItems / subset : null;
      const perCost = perHours === null ? null : (labourAssessed ? perHours * (hourly as number) : 0) + (perItems ?? 0);
      const reduction = n(x.reduction);
      const prevented = affectedN * reduction * scale;
      const hoursReleased = prevented * (perHours ?? 0);
      const ownHours = n(x.hours) * (horizon / 4);
      const toLabour = i.freedHours === "labour" && labourAssessed;
      // Hours freed are either a labour cost avoided or onboarding capacity: never both.
      const avoidedRaw = perHours === null ? null : prevented * ((toLabour ? perHours * (hourly as number) : 0) + (perItems ?? 0));
      // With no loaded hourly cost and nothing else to avoid, the avoided cost isn't assessed: never read as $0.
      const avoided = avoidedRaw === null || (!labourAssessed && i.freedHours === "labour" && !perItems) ? null : avoidedRaw;
      const cost = n(x.oneOff) + n(x.recurring) * (horizon / 4);
      const trail = [
        `Affected: ${affectedN} of ${subset} verified ${subset === 1 ? "miss" : "misses"} in this group`,
        `Assumed prevented: ${affectedN} × ${Math.round(reduction * 100)}%${scale !== 1 ? ` × ${round2(scale)} (horizon ${horizon} weeks / period ${W})` : ""} = ${round2(prevented)}`,
        perHours === null
          ? "Observed recovery hours per miss: insufficient data"
          : `Observed recovery: ${hrs(subsetHours)} / ${subset} = ${round2(perHours)} h per miss`,
        `Recovery hours released: ${round2(prevented)} × ${round2(perHours ?? 0)} = ${round2(hoursReleased)} h (modelled)`,
        perCost === null
          ? "Avoided cost: insufficient data"
          : toLabour
            ? `Avoided cost: ${round2(prevented)} × ${money(perCost)} per miss = ${money(avoidedRaw ?? 0)} (modelled)`
            : `Avoided cost: ${round2(prevented)} × ${money(perItems ?? 0)} premiums and direct costs per miss = ${money(avoidedRaw ?? 0)}${labourAssessed ? " (the freed hours are counted as onboarding capacity, not as money)" : ` (labour ${NOT_ASSESSED})`}`,
        `Action cost over ${horizon} weeks: ${money(n(x.oneOff))} one-off + ${money(n(x.recurring))} × ${round2(horizon / 4)} = ${money(cost)}`,
      ];
      return {
        id: x.id,
        label: x.label,
        kind: x.kind,
        subset,
        affected: affectedN,
        reduction,
        perHours: perHours === null ? null : round2(perHours),
        perCost: perCost === null ? null : round2(perCost),
        perItems: perItems === null ? null : round2(perItems),
        prevented: round2(prevented),
        hoursReleased: round2(hoursReleased),
        ownHours: round2(ownHours),
        netHours: round2(hoursReleased - ownHours),
        avoided: avoided === null ? null : round2(avoided),
        labourAssessed,
        cost: round2(cost),
        change: avoided === null ? null : round2(avoided - cost),
        forecast: true,
        trail,
      };
    });

  // The referral push, beside it. Onboarding capacity comes first; the freed hours count here only if chosen.
  let leads: LeadsResult | null = null;
  const openCount = open.length + rowBooked + rowUnresolved;
  if (i.leads.active) {
    const L = i.leads;
    const needed = n(L.starts) * n(L.onboardingPerStart);
    const freed = i.freedHours === "onboarding" ? interventions.reduce((a, x) => a + Math.max(0, x.netHours), 0) : 0;
    const spare = n(i.onboardingHours) + freed;
    const warnings: string[] = [];
    if (openCount > 0) warnings.push(`New referrals don’t resolve the ${openCount} ${openCount === 1 ? "visit" : "visits"} still open.`);
    if (needed > spare) warnings.push(`Onboarding the expected starts needs ${hrs(needed)}; ${hrs(spare)} is spare. The team couldn’t start them well.`);
    if (n(L.firstStartWeeks) > horizon) warnings.push(`The first starts would come after this ${horizon}-week horizon.`);
    if (L.source !== "verified") warnings.push(`Expected enquiries and starts are ${EVIDENCE_SOURCES[L.source].toLowerCase()} figures: assumptions to test.`);
    leads = {
      label: L.label,
      effortHours: n(L.effortHours),
      cost: n(L.cost),
      enquiries: n(L.enquiries),
      starts: n(L.starts),
      firstStartWeeks: n(L.firstStartWeeks),
      onboardingNeeded: round2(needed),
      onboardingSpare: round2(spare),
      shortfall: round2(Math.max(0, needed - spare)),
      beyondHorizon: n(L.firstStartWeeks) > horizon,
      warnings,
    };
  }

  const result: ReliabilityResult = {
    modelVersion: MODEL_VERSION,
    definitionsVersion: DEFINITIONS_VERSION,
    period: { start: i.period.start, end: periodEnd(i), weeks: W, asOf: i.period.asOf },
    scheduled,
    outcomes,
    missedBy,
    supplierVerified,
    supplierUnverified,
    supplierRate: rate(supplierVerified, scheduled),
    reasonRates: Object.fromEntries(REASON_ORDER.map((k) => [k, rate(missedBy[k], scheduled)])) as Record<Reason, Rate>,
    pattern: [...pattern.values()],
    weeks,
    recovery: {
      windowDays,
      eligible,
      withinWindow: rate(restoredWithin, eligible),
      restored: exact.length + BAND_ORDER.reduce((a, b) => a + i.rows.reduce((x, r) => x + n(r.restored[b]), 0), 0),
      booked: open.filter((c) => c.status === "booked").length + rowBooked,
      unresolved: open.filter((c) => c.status === "unresolved").length + rowUnresolved,
      openBeyondWindow: open.filter((c) => c.days > windowDays).length,
      essentialOpen: open.filter((c) => c.essential).length + rowEssential,
      exact,
      median: median(exact),
      bands,
      cases,
      updateMedian: median(updates),
      notUpdated: cases.filter((c) => c.updateDays === null).length,
    },
    repeat: { issues, repeatVisits, oneOff: affected.length - repeatVisits, affectedVisits: affected.length, rowGroups },
    effort: {
      hours: round2(hours),
      tasks: i.tasks.length,
      unmeasured,
      byCategory: r2(byCategory),
      byCause: r2(byCause),
      byWeek: [...byWeek.entries()].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99)).map(([week, h]) => ({ week, hours: round2(h) })),
      byReason: r2(byReason),
      visitsWithTasks,
      partitionOk: Math.abs(Object.values(byCategory).reduce((a, b) => a + b, 0) - hours) < 1e-6,
    },
    cost: {
      hourly,
      labour,
      borne: { premium: round2(borne.premium), credit: round2(borne.credit), direct: round2(borne.direct) },
      notBorne,
      notAssessed,
      fee,
      observedDirect,
      labourAssessed,
      trail: `${trailParts.join(" + ")} = ${labourAssessed ? money(observedDirect) : `${money(observedDirect)} plus labour ${NOT_ASSESSED}`}`,
    },
    interventions,
    horizon,
    freedHours: i.freedHours,
    leads,
    trend: i.comparison.label ? { label: i.comparison.label, rate: rate(n(i.comparison.supplierMissed), n(i.comparison.scheduled)) } : null,
    findings: [],
  };
  result.findings = findingsOf(result);
  return result;
}

function findingsOf(r: ReliabilityResult): string[] {
  const out: string[] = [];
  out.push(`Verified supplier misses: ${r.supplierRate.text} of scheduled visits.`);
  const others = REASON_ORDER.filter((k) => k !== "supplier" && r.missedBy[k] > 0).map((k) => `${r.missedBy[k]} ${REASONS[k].toLowerCase()}`);
  if (others.length) out.push(`Other missed visits, shown apart and not added to the supplier rate: ${others.join("; ")}.`);
  if (r.supplierUnverified)
    out.push(
      `${r.supplierUnverified} supplier ${r.supplierUnverified === 1 ? "report isn’t" : "reports aren’t"} verified yet: kept out of the supplier rate until they are.`,
    );
  if (r.outcomes.unknown) out.push(`${r.outcomes.unknown} ${r.outcomes.unknown === 1 ? "visit’s" : "visits’"} status is unknown: still in the denominator.`);
  const rec = r.recovery;
  if (rec.eligible)
    out.push(
      `Restored within ${windowLabel(rec.windowDays)}: ${rec.withinWindow.text}. ${rec.booked + rec.unresolved} still open${rec.booked ? ` (${rec.booked} with a replacement booked but not delivered)` : ""}.`,
    );
  if (rec.essentialOpen)
    out.push(`${rec.essentialOpen} essential ${rec.essentialOpen === 1 ? "visit is" : "visits are"} still open: that comes before any comparison.`);
  out.push(
    `${hrs(r.effort.hours)} of unique recovery work${r.effort.unmeasured ? `, plus ${r.effort.unmeasured} ${r.effort.unmeasured === 1 ? "task" : "tasks"} not measured` : ""}.`,
  );
  if (r.repeat.issues.some((g) => g.visits >= 2))
    out.push(
      `Recurring: ${r.repeat.issues
        .filter((g) => g.visits >= 2)
        .map((g) => `${g.label} (${g.visits} visits)`)
        .join("; ")}.`,
    );
  if (r.trend && r.trend.rate.value !== null)
    out.push(`${r.trend.label}: ${r.trend.rate.text}. A rise in recorded misses can mean better recording, so check what changed in the process.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The comparison card: four questions, no verdict
// ---------------------------------------------------------------------------------------------

export type ComparisonCard = { now: string[]; reliability: string[]; leads: string[]; confirm: string[] };

/**
  What needs fixing now? What may change if we invest in reliability? What would another referral push require from
  the same team? Which facts still need confirmation? It never says which option is "better", and it never weighs a
  person's missed support in dollars.
*/
export function comparisonCard(i: ReliabilityInputs, r: ReliabilityResult): ComparisonCard {
  const rec = r.recovery;
  const now: string[] = [];
  if (rec.essentialOpen)
    now.push(
      `${rec.essentialOpen} essential ${rec.essentialOpen === 1 ? "visit is" : "visits are"} still open: check the person is safe, and use the escalation process if needed.`,
    );
  for (const c of rec.cases.filter((x) => x.status !== "restored"))
    now.push(
      `${c.who || `Visit ${c.id}`} (${dateLabel(c.date)}): ${c.status === "booked" ? "a replacement is booked but hasn’t happened" : "nothing restored yet"}, ${c.days} days open.`,
    );
  if (!rec.cases.length && rec.booked + rec.unresolved) now.push(`${rec.booked + rec.unresolved} missed visits still open.`);
  if (!now.length) now.push("No missed visit is still open.");
  const reliability = r.interventions.length
    ? r.interventions.map(
        (x) =>
          `${x.label}: about ${round1(x.prevented)} fewer missed visits, ${hrs(x.hoursReleased)} of recovery work and ${x.avoided === null ? `avoided cost ${NOT_ASSESSED}` : `${money(x.avoided)} avoided cost`} over ${r.horizon} weeks, for ${money(x.cost)}${x.ownHours ? ` and ${hrs(x.ownHours)} of the team’s time` : ""}. A forecast from your assumption (${Math.round(x.reduction * 100)}%), not a result.`,
      )
    : ["No reliability action tested yet."];
  const leads = r.leads
    ? [
        `${r.leads.label || "The referral push"}: ${hrs(r.leads.effortHours)} of effort and ${money(r.leads.cost)}, for about ${r.leads.enquiries} enquiries and ${r.leads.starts} starts, the first in about ${r.leads.firstStartWeeks} weeks.`,
        `Onboarding them needs ${hrs(r.leads.onboardingNeeded)}; ${hrs(r.leads.onboardingSpare)} is spare${i.freedHours === "onboarding" ? " (including hours a reliability action may free)" : ""}.`,
        ...r.leads.warnings,
      ]
    : ["No referral push entered."];
  const confirm: string[] = [];
  if (r.supplierUnverified) confirm.push(`${r.supplierUnverified} supplier ${r.supplierUnverified === 1 ? "report" : "reports"} to verify.`);
  if (r.outcomes.unknown) confirm.push(`${r.outcomes.unknown} ${r.outcomes.unknown === 1 ? "visit" : "visits"} whose status is unknown or disputed.`);
  if (r.effort.unmeasured) confirm.push(`${r.effort.unmeasured} recovery ${r.effort.unmeasured === 1 ? "task" : "tasks"} not measured.`);
  if (!r.cost.labourAssessed) confirm.push(`The loaded hourly cost of recovery work: ${NOT_ASSESSED}.`);
  for (const c of r.cost.notAssessed) confirm.push(`${c.label}: ${c.why}.`);
  if (r.cost.fee.length) confirm.push("Any fee effect: Finance confirms it against the agreement. It’s never added to the direct cost.");
  for (const x of r.interventions)
    confirm.push(`Whether “${x.label}” prevents ${Math.round(x.reduction * 100)}% of its group: check the next period against this one.`);
  if (r.leads && i.leads.source !== "verified") confirm.push("The referral push’s expected enquiries, starts and timing.");
  return { now, reliability, leads, confirm };
}

// ---------------------------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------------------------

/** What the person changed, in words. */
export function inputChanges(a: ReliabilityInputs, b: ReliabilityInputs): string[] {
  const out: string[] = [];
  if (a.hourly !== b.hourly) out.push(`Loaded hourly cost: ${a.hourly ?? "blank"} → ${b.hourly ?? "blank"}.`);
  if (a.windowDays !== b.windowDays) out.push(`Restoration window: ${a.windowDays ?? "blank"} → ${b.windowDays ?? "blank"} days.`);
  if (a.freedHours !== b.freedHours)
    out.push(`Freed hours now read as ${b.freedHours === "labour" ? "a labour cost avoided" : "onboarding capacity"}, not both.`);
  for (const ob of b.occurrences) {
    const oa = a.occurrences.find((x) => x.id === ob.id);
    if (!oa) continue;
    if (oa.outcome !== ob.outcome) out.push(`Visit ${ob.id}: ${OUTCOMES[oa.outcome].toLowerCase()} → ${OUTCOMES[ob.outcome].toLowerCase()}.`);
    if (oa.reason !== ob.reason || oa.verified !== ob.verified)
      out.push(
        `Visit ${ob.id}: reason ${ob.reason ? REASONS[ob.reason].toLowerCase() : "none"}${ob.reason === "supplier" ? (ob.verified ? " (verified)" : " (not verified)") : ""}.`,
      );
  }
  for (const rb of b.rows) {
    const ra = a.rows.find((x) => x.id === rb.id);
    if (!ra) out.push(`Added ${rb.label || SERVICES[rb.service]}.`);
    else if (rowScheduled(ra) !== rowScheduled(rb) || missedTotal(ra) !== missedTotal(rb))
      out.push(
        `${rb.label || SERVICES[rb.service]}: ${rowScheduled(ra)} scheduled, ${missedTotal(ra)} missed → ${rowScheduled(rb)} scheduled, ${missedTotal(rb)} missed.`,
      );
  }
  for (const xb of b.interventions) {
    const xa = a.interventions.find((x) => x.id === xb.id);
    if (!xa) out.push(`Added the action “${xb.label}”.`);
    else {
      if (xa.active !== xb.active) out.push(`${xb.active ? "Tested" : "Took off"} “${xb.label}”.`);
      if (xa.reduction !== xb.reduction)
        out.push(
          `“${xb.label}”: assumed prevented ${xa.reduction === null ? "blank" : `${Math.round(xa.reduction * 100)}%`} → ${xb.reduction === null ? "blank" : `${Math.round(xb.reduction * 100)}%`}.`,
        );
      if (xa.oneOff !== xb.oneOff || xa.recurring !== xb.recurring) out.push(`“${xb.label}”: its cost changed.`);
    }
  }
  if (a.leads.active !== b.leads.active) out.push(b.leads.active ? "Added the referral push to compare." : "Took the referral push out of the comparison.");
  return out;
}

/** What it did to the result, in words. */
export function resultChanges(a: ReliabilityResult, b: ReliabilityResult): string[] {
  const out: string[] = [];
  if (a.supplierRate.text !== b.supplierRate.text) out.push(`Verified supplier misses: ${a.supplierRate.text} → ${b.supplierRate.text}.`);
  if (a.recovery.withinWindow.text !== b.recovery.withinWindow.text)
    out.push(`Restored within the window: ${a.recovery.withinWindow.text} → ${b.recovery.withinWindow.text}.`);
  if (a.effort.hours !== b.effort.hours) out.push(`Recovery work: ${hrs(a.effort.hours)} → ${hrs(b.effort.hours)}.`);
  if (a.cost.observedDirect !== b.cost.observedDirect)
    out.push(`Observed direct extra cost: ${money(a.cost.observedDirect)} → ${money(b.cost.observedDirect)}.`);
  for (const xb of b.interventions) {
    const xa = a.interventions.find((x) => x.id === xb.id);
    if (!xa) out.push(`“${xb.label}”: ${hrs(xb.hoursReleased)} and ${xb.avoided === null ? NOT_ASSESSED : money(xb.avoided)} modelled (a forecast).`);
    else {
      const cash = (v: number | null) => (v === null ? NOT_ASSESSED : money(v));
      const parts = [
        ...(xa.hoursReleased !== xb.hoursReleased ? [`recovery hours ${hrs(xa.hoursReleased)} → ${hrs(xb.hoursReleased)}`] : []),
        ...(xa.avoided !== xb.avoided ? [`avoided cost ${cash(xa.avoided)} → ${cash(xb.avoided)}`] : []),
      ];
      if (parts.length) out.push(`“${xb.label}”: ${parts.join(", ")} (modelled).`);
    }
  }
  if (a.leads && b.leads && a.leads.onboardingSpare !== b.leads.onboardingSpare)
    out.push(`Spare onboarding hours: ${hrs(a.leads.onboardingSpare)} → ${hrs(b.leads.onboardingSpare)}.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Starting points and stored JSON
// ---------------------------------------------------------------------------------------------

const blankReasons = (): Record<Reason, Num> => Object.fromEntries(REASON_ORDER.map((k) => [k, null])) as Record<Reason, Num>;
const blankBands = (): Record<RestoreBand, Num> => Object.fromEntries(BAND_ORDER.map((k) => [k, null])) as Record<RestoreBand, Num>;

export const blankRow = (id: string, service: Service, window: Window): CountRow => ({
  id,
  label: "",
  service,
  window,
  week: null,
  delivered: null,
  late: null,
  replaced: null,
  unknown: null,
  missed: blankReasons(),
  unverified: null,
  restored: blankBands(),
  booked: null,
  unresolved: null,
  essentialOpen: null,
  repeatIssues: null,
  source: "estimate",
});

export const blankLeads = (): Leads => ({
  active: false,
  label: "",
  effortHours: null,
  cost: null,
  enquiries: null,
  starts: null,
  firstStartWeeks: null,
  onboardingPerStart: null,
  source: "estimate",
  note: "",
});

const task = (id: string, label: string, category: Category, causes: Cause[]): RecoveryTask => ({
  id,
  label,
  category,
  causes,
  occurrence: "",
  issue: "",
  reason: "supplier",
  week: null,
  count: null,
  minutes: null,
});

/** A blank entry for "Review my service reliability": aggregate counts only, nothing filled in. */
export function blankInputs(asOf: string): ReliabilityInputs {
  return {
    period: { start: "", weeks: 4, asOf },
    scope: "",
    windowDays: 2,
    hourly: null,
    occurrences: [],
    rows: [blankRow("r1", "domestic", "morning"), blankRow("r2", "personalCare", "morning")],
    issues: [],
    tasks: [
      task("t1", "Calls with participants and families", "conversation", ["missedService"]),
      task("t2", "Finding and booking a replacement", "change", ["missedService", "supplierAvailability"]),
      task("t3", "Supplier follow-up", "supplier", ["missedService"]),
      task("t4", "Billing corrections", "supplier", ["invoiceCorrection"]),
    ],
    costs: [],
    interventions: [],
    freedHours: "labour",
    horizonWeeks: 4,
    leads: blankLeads(),
    onboardingHours: null,
    updateTarget: null,
    comparison: { label: "", scheduled: null, supplierMissed: null },
  };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);
const amt = (v: unknown): Amount => (v === "unknown" ? "unknown" : num(v));
const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : "");
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const ID = /^[a-zA-Z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const reason = (v: unknown): Reason | "" => (typeof v === "string" && v in REASONS ? (v as Reason) : "");
const SERVICE_KEYS = Object.keys(SERVICES) as Service[];
const week = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 8 ? v : null);

export function cleanOccurrence(v: unknown, k: number): Occurrence {
  const o = obj(v);
  return {
    id: id(o.id, `V${String(k + 1).padStart(2, "0")}`),
    date: date(o.date),
    service: oneOf(o.service, SERVICE_KEYS, "domestic"),
    window: oneOf(o.window, WINDOW_ORDER, "morning"),
    essential: o.essential === true,
    outcome: oneOf(o.outcome, OUTCOME_ORDER, "unknown"),
    reason: reason(o.reason),
    verified: o.verified === true,
    issue: id(o.issue, ""),
    contacted: date(o.contacted),
    booked: date(o.booked),
    restored: date(o.restored),
    updated: date(o.updated),
    owner: str(o.owner, 80),
    preference: str(o.preference, 200),
    who: str(o.who, 60),
    evidence: str(o.evidence, 400),
    evidenceOn: date(o.evidenceOn),
    source: oneOf(o.source, Object.keys(EVIDENCE_SOURCES) as EvidenceSource[], "unknown"),
  };
}

function cleanRow(v: unknown, k: number): CountRow {
  const r = obj(v);
  const m = obj(r.missed);
  const b = obj(r.restored);
  return {
    id: id(r.id, `r${k + 1}`),
    label: str(r.label, 80),
    service: oneOf(r.service, SERVICE_KEYS, "domestic"),
    window: oneOf(r.window, WINDOW_ORDER, "morning"),
    week: week(r.week),
    delivered: num(r.delivered),
    late: num(r.late),
    replaced: num(r.replaced),
    unknown: num(r.unknown),
    missed: Object.fromEntries(REASON_ORDER.map((x) => [x, num(m[x])])) as Record<Reason, Num>,
    unverified: num(r.unverified),
    restored: Object.fromEntries(BAND_ORDER.map((x) => [x, num(b[x])])) as Record<RestoreBand, Num>,
    booked: num(r.booked),
    unresolved: num(r.unresolved),
    essentialOpen: num(r.essentialOpen),
    repeatIssues: num(r.repeatIssues),
    source: oneOf(r.source, Object.keys(EVIDENCE_SOURCES) as EvidenceSource[], "estimate"),
  };
}

/** Reads stored or sent inputs. Anything not in the model (a "lifetime value", a churn score) is dropped. */
export function cleanInputs(v: unknown): ReliabilityInputs {
  const o = obj(v);
  const p = obj(o.period);
  const L = obj(o.leads);
  const c = obj(o.comparison);
  return {
    period: { start: date(p.start), weeks: num(p.weeks), asOf: date(p.asOf) },
    scope: str(o.scope, 200),
    windowDays: num(o.windowDays),
    hourly: amt(o.hourly),
    occurrences: arr(o.occurrences).slice(0, 200).map(cleanOccurrence),
    rows: arr(o.rows).slice(0, 40).map(cleanRow),
    issues: arr(o.issues)
      .slice(0, 12)
      .map((x, k) => {
        const g = obj(x);
        return { id: id(g.id, `i${k + 1}`), label: str(g.label, 120), note: str(g.note, 400) };
      }),
    tasks: arr(o.tasks)
      .slice(0, 80)
      .map((x, k) => {
        const t = obj(x);
        return {
          id: id(t.id, `t${k + 1}`),
          label: str(t.label, 120),
          category: oneOf(t.category, Object.keys(CATEGORIES) as Category[], "other"),
          causes: [...new Set(arr(t.causes).filter((y): y is Cause => typeof y === "string" && y in CAUSES))].slice(0, 4),
          occurrence: id(t.occurrence, ""),
          issue: id(t.issue, ""),
          reason: reason(t.reason),
          week: week(t.week),
          count: "count" in t ? num(t.count) : 1,
          minutes: t.minutes === "unknown" ? "unknown" : num(t.minutes),
        };
      }),
    costs: arr(o.costs)
      .slice(0, 40)
      .map((x, k) => {
        const y = obj(x);
        return {
          id: id(y.id, `c${k + 1}`),
          label: str(y.label, 120),
          kind: oneOf(y.kind, COST_ORDER, "direct"),
          amount: amt(y.amount),
          bears: oneOf(y.bears, Object.keys(BEARS) as Bears[], "unknown"),
          occurrence: id(y.occurrence, ""),
          issue: id(y.issue, ""),
          reason: reason(y.reason),
          source: oneOf(y.source, Object.keys(EVIDENCE_SOURCES) as EvidenceSource[], "estimate"),
        };
      }),
    interventions: arr(o.interventions)
      .slice(0, 8)
      .map((x, k) => {
        const y = obj(x);
        return {
          id: id(y.id, `x${k + 1}`),
          label: str(y.label, 160),
          kind: oneOf(y.kind, Object.keys(INTERVENTION_KINDS) as InterventionKind[], "other"),
          reason: reason(y.reason),
          issue: id(y.issue, ""),
          affected: num(y.affected),
          reduction: num(y.reduction),
          oneOff: num(y.oneOff),
          recurring: num(y.recurring),
          hours: num(y.hours),
          starts: date(y.starts),
          owner: str(y.owner, 80),
          evidence: str(y.evidence, 400),
          active: y.active === true,
        };
      }),
    freedHours: o.freedHours === "onboarding" ? "onboarding" : "labour",
    horizonWeeks: num(o.horizonWeeks),
    leads: {
      active: L.active === true,
      label: str(L.label, 160),
      effortHours: num(L.effortHours),
      cost: num(L.cost),
      enquiries: num(L.enquiries),
      starts: num(L.starts),
      firstStartWeeks: num(L.firstStartWeeks),
      onboardingPerStart: num(L.onboardingPerStart),
      source: oneOf(L.source, Object.keys(EVIDENCE_SOURCES) as EvidenceSource[], "estimate"),
      note: str(L.note, 400),
    },
    onboardingHours: num(o.onboardingHours),
    updateTarget: num(o.updateTarget),
    comparison: { label: str(c.label, 80), scheduled: num(c.scheduled), supplierMissed: num(c.supplierMissed) },
  };
}

/** The headline a saved Decision Sheet keeps: aggregate counts and hours, never a person. */
export const snapshotOf = (r: ReliabilityResult) => ({
  scheduled: r.scheduled,
  supplierVerified: r.supplierVerified,
  supplierRate: r.supplierRate.value,
  open: r.recovery.booked + r.recovery.unresolved,
  essentialOpen: r.recovery.essentialOpen,
  hours: r.effort.hours,
  observedDirect: r.cost.observedDirect,
});

export { INSUFFICIENT };
