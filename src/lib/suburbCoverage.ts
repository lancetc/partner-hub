/*
  Local Coverage Comparison ("Is this suburb ready for growth?", docs/suburb-growth.md): a deterministic model that
  sets the services clients need, by service, capability, area and day/time window, against provider-approved,
  suitable, recently confirmed and uncommitted contractor capacity, week by week over a planning horizon.

  The PRD asks to reuse the Contractor Network Builder's supply states, service taxonomy and coverage arithmetic. That
  Work Tool isn't in the Hub yet, so the states, the taxonomy and the arithmetic live here, versioned, and are shared by
  every Local Coverage block, the story (fictional figures) and "Plan my local area" (a partner's own aggregate
  figures). When the Network Builder exists, this file is what it should own. No AI calculates anything.

  For each service + capability + area + day/time window, each week:

    committed_unfilled = max(0, confirmed_planned − confirmed_booked)
    usable_spare       = provider-approved, suitable hours with current, verified, uncommitted availability in the
                         matching window, after travel, existing commitments and overlap checks
    current_gap        = max(0, committed_unfilled − usable_spare)
    forecast_gap[case] = max(0, committed_unfilled + forecast[case] − usable_spare)

  Rules it keeps:
  - Hours and visits are kept apart: a cell is counted in its own unit, and nothing adds hours to visits.
  - A nurse, a cleaner and a personal-care worker aren't interchangeable; a capability a visit needs must be there.
  - A visit is a block of its own length: a shorter window of availability can't fill a longer visit, and spare
    afternoon hours never cover a 7 am visit.
  - Only provider-approved supply counts. Candidates, interested contractors, evidence in progress and provider
    verification are potential supply; paused, restricted and expired approvals are excluded. A provisional offer, an
    availability that starts later, or one not re-verified within the owner's freshness rule doesn't count either.
  - A worker's availability window is counted once: it can't be in two areas at overlapping times. When two cells
    could use the same window, it's counted for the first and the result says so (confirm in scheduling).
  - A participant's chosen worker who is still being checked is shown as a choice to assess, never as spare capacity,
    and never discarded.
  - Forecast and being-arranged demand are separate bands: they never change the current gap.
  - Blank, unknown and zero are different: a blank is an error to fix; an unknown or paused need is counted and makes
    an otherwise covered cell "needs confirmation"; zero is zero.
  - A stale source makes a confident result "needs confirmation", not a green map.
  - Backup is shown apart from the gap, against a target the accountable owner sets: there's no universal ratio.
  - A candidate's expected onboarding is an uncertain scenario, never a service date, and never usable spare.
*/

export const MODEL_VERSION = "suburb-coverage-1";
/** Stands in for the Contractor Network Builder's service taxonomy and supply state machine, until that tool exists. */
export const TAXONOMY_VERSION = "network-taxonomy-1";

export const SERVICES = {
  personalCare: "Personal care",
  domestic: "Domestic assistance (cleaning)",
  nursing: "Nursing",
  social: "Social support",
  maintenance: "Home maintenance and gardening",
} as const;
export type Service = keyof typeof SERVICES;
export const SERVICE_ORDER = Object.keys(SERVICES) as Service[];
export const SERVICE_HINTS: Record<Service, string> = {
  personalCare: "Showering, dressing, grooming and help with meals, by a worker approved for personal care.",
  domestic: "Cleaning, laundry and household tasks. A cleaner isn’t a personal-care worker.",
  nursing: "Clinical care by a registered or enrolled nurse, under the provider’s clinical governance.",
  social: "Company, outings and community access.",
  maintenance: "Minor home maintenance, gardening and safety repairs.",
};

/** What a visit may need beyond the service itself. The worker must have it for the visit to count. */
export const CAPABILITIES = {
  medication: "Medication prompting",
  manualHandling: "Manual handling (hoist or two-person)",
  woundCare: "Wound care",
  dementia: "Dementia experience",
  language: "A language other than English",
} as const;
export type Capability = keyof typeof CAPABILITIES;
export const CAPABILITY_ORDER = Object.keys(CAPABILITIES) as Capability[];

/** The supply state machine. Only "approved" is ready supply, and only for its approved service. */
export const SUPPLY_STATES = {
  candidate: "Candidate",
  interested: "Interested",
  evidence: "Evidence in progress",
  verification: "Provider verification",
  approved: "Provider approved",
  paused: "Paused",
  restricted: "Restricted",
  expired: "Approval expired",
} as const;
export type SupplyState = keyof typeof SUPPLY_STATES;
export const STATE_ORDER = Object.keys(SUPPLY_STATES) as SupplyState[];
export const STATE_HINTS: Record<SupplyState, string> = {
  candidate: "Found, or listed in a directory. Nothing is checked yet.",
  interested: "Has said they’d like to work with the provider. Nothing is checked yet.",
  evidence: "Sending their documents and checks. Not ready supply.",
  verification: "The provider is checking their evidence. Not ready supply until approved.",
  approved: "Approved by the provider for this service. Counts only with recently confirmed, uncommitted availability.",
  paused: "Not taking work for now: excluded.",
  restricted: "Approved with a restriction that rules this work out: excluded.",
  expired: "Their approval or a required check has expired: excluded until it’s renewed.",
};
export const PIPELINE: readonly SupplyState[] = ["candidate", "interested", "evidence", "verification"];
const EXCLUDED: readonly SupplyState[] = ["paused", "restricted", "expired"];

export const AVAILABILITY = {
  confirmed: "Confirmed, uncommitted",
  provisional: "Provisional offer",
  booked: "Already committed",
} as const;
export type AvailabilityStatus = keyof typeof AVAILABILITY;

/** How a learner (and the model) reads a supply card against a need. */
export const USES = {
  usable: "Usable now",
  potential: "Potential after verification",
  unavailable: "Unavailable",
  committed: "Already committed",
} as const;
export type Use = keyof typeof USES;
export const USE_ORDER = Object.keys(USES) as Use[];

export const TIERS = {
  confirmed: "Confirmed planned",
  arranging: "Approved, being arranged",
  forecast: "Forecast",
  unknown: "Unknown or paused",
} as const;
export type Tier = keyof typeof TIERS;

export const PREFERENCES = {
  none: "No unresolved preference",
  unresolved: "A preference still to resolve",
  preferredWorker: "The participant has chosen a worker",
} as const;
export type Preference = keyof typeof PREFERENCES;

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_NAMES: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const WEEKDAYS: Day[] = ["mon", "tue", "wed", "thu", "fri"];

/** The planning horizon an author or owner may choose, in weeks. Eight is the default. */
export const HORIZON = { min: 2, max: 12, default: 8 } as const;

/** A number field that may be blank. null is blank: never read as zero. */
export type Num = number | null;
export type Unit = "hours" | "visits";

export type Area = {
  id: string;
  /** A fictional suburb in the story; an area or travel zone name in a partner's own plan. */
  name: string;
  note?: string;
  /** Where it sits on the schematic map, 0–100 across and down. The list and table hold everything the map shows. */
  x: number;
  y: number;
};

/** A day/time window: the days, and the hours (24-hour, 6.5 is 6:30 am) a visit must fall within. */
export type Window = { days: Day[]; from: Num; to: Num };

export type DemandCell = {
  id: string;
  service: Service;
  /** A capability every visit needs; "" none beyond the service. */
  capability: Capability | "";
  area: string;
  window: Window;
  unit: Unit;
  /** How long one visit is, in hours: a shorter block of availability can't fill it. */
  visitHours: Num;
  /** Confirmed planned: approved and agreed services with a schedule, a week. */
  planned: Num;
  /** Of those, booked with a suitable, confirmed worker. */
  booked: Num;
  /** Approved, being arranged: a separate near-term band, never a booking. */
  arranging: Num;
  /** Forecast: additional demand in each scenario, never merged into committed demand. */
  forecast: { low: Num; base: Num; high: Num };
  /** Unknown or paused needs (a hospital pause, a missing schedule): counted, never assumed zero. */
  unknown: Num;
  /** The earliest date it's needed (YYYY-MM-DD); "" needed now. */
  neededFrom: string;
  preference: Preference;
  /** Suitable backup workers the accountable Operations/Quality owner wants for this service context; null: not set. */
  backupTarget: Num;
  /** An approved continuity arrangement, in words; "" none. */
  continuity: string;
  /** Where the demand figures come from, who owns them, and when they were last verified (YYYY-MM-DD). */
  source: string;
  owner: string;
  verifiedOn: string;
  /** A line of story (fictional case only). Never a name, address or diagnosis. */
  note?: string;
};

export type Availability = {
  id: string;
  days: Day[];
  from: Num;
  to: Num;
  /** Hours a week within that window. */
  hours: Num;
  status: AvailabilityStatus;
  /** When it starts (YYYY-MM-DD); "" already available. */
  effectiveFrom: string;
};

export type SupplyRow = {
  id: string;
  /** Anonymous: "Worker A", "Agency row 1". Never a contractor's name or contact details. */
  label: string;
  /** An aggregate row (several workers): a match can't be checked worker by worker, so it's an estimate. */
  aggregate: boolean;
  service: Service;
  capabilities: Capability[];
  state: SupplyState;
  /** The areas or travel zones they'll work in. */
  areas: string[];
  slots: Availability[];
  verifiedOn: string;
  source: string;
  owner: string;
  /** A demand cell where a participant has chosen this worker; "" none. */
  preferredFor: string;
  /** For someone in the pipeline: expected weeks to approval. An uncertain scenario, never a date. */
  onboardingWeeks: Num;
  /** Hours this worker currently carries in each cell: what an absence would affect. */
  bookings: { cell: string; hours: number }[];
  note?: string;
};

export type CoverageInputs = {
  /** The planning period starts here (YYYY-MM-DD); figures are read as of this date. */
  asOf: string;
  timezone: string;
  weeks: Num;
  /** The availability freshness rule: set, effective-dated, by the operational owner. No universal interval. */
  freshness: { days: Num; setBy: string; from: string };
  /** Typical weeks from interest to provider approval, for judging lead time. Set by supplier onboarding. */
  leadWeeks: Num;
  areas: Area[];
  demand: DemandCell[];
  supply: SupplyRow[];
};

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: Num | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** 7 → "7 am", 10.5 → "10:30 am", 13 → "1 pm". */
export function timeLabel(h: Num) {
  if (h === null || !Number.isFinite(h)) return "?";
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  const suffix = whole >= 12 && whole < 24 ? "pm" : "am";
  const hr = whole % 12 === 0 ? 12 : whole % 12;
  return `${hr}${mins ? `:${String(mins).padStart(2, "0")}` : ""} ${suffix}`;
}
export function daysLabel(days: Day[]) {
  const idx = [...new Set(days)].map((d) => DAYS.indexOf(d)).sort((a, b) => a - b);
  if (!idx.length) return "no days";
  if (idx.length === 7) return "every day";
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs.at(-1);
    if (last && last.at(-1) === i - 1) last.push(i);
    else runs.push([i]);
  }
  return runs.map((r) => (r.length > 2 ? `${DAY_NAMES[DAYS[r[0]]]}–${DAY_NAMES[DAYS[r.at(-1)!]]}` : r.map((i) => DAY_NAMES[DAYS[i]]).join(", "))).join(", ");
}
export const windowLabel = (w: Pick<Window, "days" | "from" | "to">) => `${daysLabel(w.days)} ${timeLabel(w.from)}–${timeLabel(w.to)}`;
export const fmtUnits = (v: number, unit: Unit) => (unit === "hours" ? `${round1(v)} h` : `${round1(v)} ${round1(v) === 1 ? "visit" : "visits"}`);
export const areaName = (i: Pick<CoverageInputs, "areas">, id: string) => i.areas.find((a) => a.id === id)?.name || "an unnamed area";
/** "Personal care (medication prompting), Banksia Rise, Mon–Fri 7 am–9 am": a service, a place and a time window. */
export function cellLabel(i: Pick<CoverageInputs, "areas">, c: DemandCell) {
  return `${SERVICES[c.service]}${c.capability ? ` (${CAPABILITIES[c.capability].toLowerCase()})` : ""}, ${areaName(i, c.area)}, ${windowLabel(c.window)}`;
}
/** When it falls: before noon on a weekday, a weekday afternoon or evening, or a weekend. For filtering. */
export function whenOf(w: Window): "weekday-am" | "weekday-pm" | "weekend" {
  if (w.days.length && w.days.every((d) => d === "sat" || d === "sun")) return "weekend";
  return n(w.from) < 12 ? "weekday-am" : "weekday-pm";
}
export const WHEN = { "weekday-am": "Weekday mornings", "weekday-pm": "Weekday afternoons and evenings", weekend: "Weekends" } as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
const addDays = (iso: string, k: number) => new Date(Date.parse(iso) + k * 86400000).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateLabel = (iso: string) =>
  DATE.test(iso) ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "no date";

export type Week = { index: number; label: string; from: string; to: string };
/** The planning weeks, from the as-of date. */
export function weeksOf(i: Pick<CoverageInputs, "asOf" | "weeks">): Week[] {
  if (!DATE.test(i.asOf) || !Number.isFinite(Date.parse(i.asOf))) return [];
  const count = Math.max(HORIZON.min, Math.min(HORIZON.max, Math.round(n(i.weeks) || HORIZON.default)));
  return Array.from({ length: count }, (_, k) => {
    const from = addDays(i.asOf, 7 * k);
    const to = addDays(i.asOf, 7 * k + 6);
    const short = (d: string) => dateLabel(d).replace(/ \d{4}$/, "");
    return { index: k, label: `Week ${k + 1} · ${short(from)}–${short(to)}`, from, to };
  });
}

// ---------------------------------------------------------------------------------------------
// Validation: blank is not zero
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

const overlapHours = (a: { from: Num; to: Num }, b: { from: Num; to: Num }) => Math.max(0, Math.min(n(a.to), n(b.to)) - Math.max(n(a.from), n(b.from)));
const sharedDays = (a: Day[], b: Day[]) => a.filter((d) => b.includes(d));

export function validateInputs(i: CoverageInputs): InputError[] {
  const out: InputError[] = [];
  const need = (v: Num | undefined, field: string, label: string, { min = 0, max = 1000 } = {}) => {
    if (v === null || v === undefined || Number.isNaN(v)) out.push({ field, message: `${label} is blank. Enter a number (0 if there’s none).` });
    else if (v < min || v > max) out.push({ field, message: `${label} must be between ${min} and ${max}.` });
  };
  const window = (w: Window, field: string, label: string) => {
    if (!w.days.length) out.push({ field: `${field}.days`, message: `${label}: choose at least one day.` });
    need(w.from, `${field}.from`, `${label}: start time`, { max: 24 });
    need(w.to, `${field}.to`, `${label}: end time`, { max: 24 });
    if (w.from !== null && w.to !== null && w.to <= w.from) out.push({ field: `${field}.to`, message: `${label}: the end time must be after the start.` });
  };
  if (!DATE.test(i.asOf) || !Number.isFinite(Date.parse(i.asOf))) out.push({ field: "asOf", message: "Enter the date the plan starts from." });
  need(i.weeks, "weeks", "The planning horizon", { min: HORIZON.min, max: HORIZON.max });
  if (i.freshness.days === null)
    out.push({ field: "freshness.days", message: "The availability freshness rule is blank. It’s set by the operational owner: enter their number of days." });
  else need(i.freshness.days, "freshness.days", "The availability freshness rule", { min: 1, max: 365 });
  need(i.leadWeeks, "leadWeeks", "Weeks from interest to approval", { max: 52 });
  if (!i.areas.length) out.push({ field: "areas", message: "Add at least one area." });
  const areaIds = new Set(i.areas.map((a) => a.id));
  i.areas.forEach((a, k) => {
    if (!a.name.trim()) out.push({ field: `area.${a.id}.name`, message: `Area ${k + 1} needs a name.` });
  });
  if (!i.demand.length) out.push({ field: "demand", message: "Add at least one service need." });
  const cellIds = new Set(i.demand.map((c) => c.id));
  i.demand.forEach((c, k) => {
    const name = `Need ${k + 1} (${SERVICES[c.service]}${c.area && areaIds.has(c.area) ? `, ${areaName(i, c.area)}` : ""})`;
    if (!areaIds.has(c.area)) out.push({ field: `cell.${c.id}.area`, message: `${name}: choose its area.` });
    window(c.window, `cell.${c.id}.window`, name);
    need(c.visitHours, `cell.${c.id}.visitHours`, `${name}: hours per visit`, { max: 12 });
    if (c.visitHours !== null && c.visitHours <= 0) out.push({ field: `cell.${c.id}.visitHours`, message: `${name}: a visit must be longer than zero hours.` });
    if (c.visitHours !== null && c.window.from !== null && c.window.to !== null && c.visitHours > c.window.to - c.window.from + 1e-9)
      out.push({ field: `cell.${c.id}.visitHours`, message: `${name}: a visit is longer than its window.` });
    need(c.planned, `cell.${c.id}.planned`, `${name}: confirmed planned`);
    need(c.booked, `cell.${c.id}.booked`, `${name}: booked`);
    if (c.planned !== null && c.booked !== null && c.booked > c.planned)
      out.push({ field: `cell.${c.id}.booked`, message: `${name}: more is booked than is planned. Check the schedule.` });
    need(c.arranging, `cell.${c.id}.arranging`, `${name}: being arranged`);
    need(c.forecast.low, `cell.${c.id}.forecast.low`, `${name}: low forecast`);
    need(c.forecast.base, `cell.${c.id}.forecast.base`, `${name}: base forecast`);
    need(c.forecast.high, `cell.${c.id}.forecast.high`, `${name}: high forecast`);
    if (
      c.forecast.low !== null &&
      c.forecast.base !== null &&
      c.forecast.high !== null &&
      !(c.forecast.low <= c.forecast.base && c.forecast.base <= c.forecast.high)
    )
      out.push({ field: `cell.${c.id}.forecast.base`, message: `${name}: the forecast should run low ≤ base ≤ high.` });
    need(c.unknown, `cell.${c.id}.unknown`, `${name}: unknown or paused needs`, { max: 100 });
    if (c.neededFrom && !DATE.test(c.neededFrom)) out.push({ field: `cell.${c.id}.neededFrom`, message: `${name}: the needed-from date isn’t a date.` });
    if (c.verifiedOn && !DATE.test(c.verifiedOn)) out.push({ field: `cell.${c.id}.verifiedOn`, message: `${name}: the verified date isn’t a date.` });
  });
  i.supply.forEach((s, k) => {
    const name = `${s.label || `Supply row ${k + 1}`}`;
    for (const a of s.areas) if (!areaIds.has(a)) out.push({ field: `supply.${s.id}.areas`, message: `${name}: an area it travels to isn’t in the plan.` });
    if (s.preferredFor && !cellIds.has(s.preferredFor))
      out.push({ field: `supply.${s.id}.preferredFor`, message: `${name}: the need it was chosen for isn’t in the plan.` });
    if (s.verifiedOn && !DATE.test(s.verifiedOn)) out.push({ field: `supply.${s.id}.verifiedOn`, message: `${name}: the verified date isn’t a date.` });
    s.slots.forEach((a, j) => {
      const label = `${name}, availability ${j + 1}`;
      window(a, `slot.${s.id}.${a.id}`, label);
      need(a.hours, `slot.${s.id}.${a.id}.hours`, `${label}: hours a week`, { max: 168 });
      if (a.hours !== null && a.from !== null && a.to !== null && a.days.length && a.hours > a.days.length * (a.to - a.from) + 1e-9)
        out.push({ field: `slot.${s.id}.${a.id}.hours`, message: `${label}: more hours than the window holds.` });
      if (a.effectiveFrom && !DATE.test(a.effectiveFrom))
        out.push({ field: `slot.${s.id}.${a.id}.effectiveFrom`, message: `${label}: the start date isn’t a date.` });
    });
    // One person can't be in two places at once: their windows mustn't overlap. (An aggregate row is several people.)
    if (!s.aggregate)
      s.slots.forEach((a, j) =>
        s.slots.slice(j + 1).forEach((b) => {
          if (sharedDays(a.days, b.days).length && overlapHours(a, b) > 0)
            out.push({ field: `slot.${s.id}.${b.id}.from`, message: `${name}: two availability windows overlap. One person can’t be in two places at once.` });
        }),
      );
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matching a supply window to a need
// ---------------------------------------------------------------------------------------------

export type ReasonKind = "scope" | "pipeline" | "excluded" | "capability" | "area" | "time" | "booked" | "provisional" | "later" | "stale" | "taken" | "ok";
/** How far a supply row got through the checks: the furthest one explains it best. */
const STAGE: Record<ReasonKind, number> = {
  scope: 0,
  excluded: 1,
  pipeline: 2,
  capability: 3,
  area: 4,
  time: 5,
  booked: 6,
  provisional: 7,
  later: 7,
  stale: 8,
  taken: 9,
  ok: 10,
};
const USE_OF: Record<ReasonKind, Use> = {
  scope: "unavailable",
  excluded: "unavailable",
  pipeline: "potential",
  capability: "unavailable",
  area: "unavailable",
  time: "unavailable",
  booked: "committed",
  provisional: "potential",
  later: "potential",
  stale: "potential",
  taken: "committed",
  ok: "usable",
};

export const isFresh = (verifiedOn: string, asOf: string, freshDays: Num) => {
  if (!verifiedOn || !DATE.test(verifiedOn) || freshDays === null) return false;
  const age = days(verifiedOn, asOf);
  return Number.isFinite(age) && age >= 0 && age <= freshDays;
};

type Check = { kind: ReasonKind; reason: string; cap: number; partial: boolean };

/** Can this window of this supply row serve this need in a given week? If so, how many hours could it hold. */
function check(i: CoverageInputs, s: SupplyRow, a: Availability, c: DemandCell, weekStart: string): Check {
  const no = (kind: ReasonKind, reason: string): Check => ({ kind, reason, cap: 0, partial: false });
  const who = s.label || "A supply row";
  if (s.service !== c.service)
    return no("scope", `${who} provides ${SERVICES[s.service].toLowerCase()}, not ${SERVICES[c.service].toLowerCase()}: they aren’t interchangeable.`);
  if (EXCLUDED.includes(s.state)) return no("excluded", `${who}: ${SUPPLY_STATES[s.state].toLowerCase()}, so excluded.`);
  if (PIPELINE.includes(s.state))
    return no(
      "pipeline",
      s.preferredFor === c.id
        ? `${who} was chosen by the participant and is at “${SUPPLY_STATES[s.state].toLowerCase()}”: a choice to assess through the provider’s checks, not spare capacity yet.`
        : `${who}: ${SUPPLY_STATES[s.state].toLowerCase()}. Not ready supply until the provider approves them.`,
    );
  if (c.capability && !s.capabilities.includes(c.capability))
    return no("capability", `${who} isn’t approved for ${CAPABILITIES[c.capability].toLowerCase()}, which these visits need.`);
  if (!s.areas.includes(c.area)) return no("area", `${who} doesn’t travel to ${areaName(i, c.area)}.`);
  const common = sharedDays(c.window.days, a.days);
  const span = overlapHours(a, c.window);
  const vh = n(c.visitHours);
  if (!common.length || span <= 0) return no("time", `${who} is free ${windowLabel(a)}, outside the ${windowLabel(c.window)} window.`);
  if (span + 1e-9 < vh)
    return no("time", `${who} is free ${windowLabel(a)}: inside the window there’s only ${round2(span)} h, shorter than a ${round2(vh)}-hour visit.`);
  if (a.status === "booked") return no("booked", `${who}: those hours (${windowLabel(a)}) are already committed to other visits.`);
  if (a.status === "provisional") return no("provisional", `${who}: a provisional offer (${windowLabel(a)}), not confirmed.`);
  if (a.effectiveFrom && a.effectiveFrom > weekStart) return no("later", `${who}: available from ${dateLabel(a.effectiveFrom)}, not yet.`);
  if (!isFresh(s.verifiedOn, i.asOf, i.freshness.days))
    return no(
      "stale",
      s.verifiedOn
        ? `${who}: availability last verified ${dateLabel(s.verifiedOn)}, older than the ${n(i.freshness.days)}-day freshness rule. Needs confirmation.`
        : `${who}: availability never verified. Needs confirmation.`,
    );
  // A visit fits in the window a whole number of times a day: a worker can't do two 7–9 am visits at once.
  const cap = s.aggregate ? n(a.hours) : common.length * Math.floor(span / vh + 1e-9) * vh;
  const partial = s.aggregate || common.length < c.window.days.length;
  return {
    kind: "ok",
    reason: `${who}: provider approved, free ${windowLabel(a)} in ${areaName(i, c.area)}, verified ${dateLabel(s.verifiedOn)}.`,
    cap,
    partial,
  };
}

// ---------------------------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------------------------

export type SupplyUse = { id: string; label: string; use: Use; kind: ReasonKind; reason: string; hours: number; state: SupplyState };
export type CellWeek = {
  week: number;
  active: boolean;
  planned: number;
  booked: number;
  unfilled: number;
  spare: number;
  gap: number;
  surplus: number;
  nearTermGap: number;
  forecastGap: { low: number; base: number; high: number };
};
export type CellStatus = "covered" | "gap" | "confirm";
export const STATUS: Record<CellStatus, { label: string; tone: "good" | "bad" | "warn" }> = {
  covered: { label: "Covered", tone: "good" },
  gap: { label: "Current gap", tone: "bad" },
  confirm: { label: "Needs confirmation", tone: "warn" },
};
export type BackupState = "ok" | "short" | "notSet" | "none";
export const BACKUP: Record<BackupState, string> = {
  ok: "Backup meets the owner’s target",
  short: "Backup fragile: below the owner’s target",
  notSet: "No backup target set by the accountable owner",
  none: "No current visits to back up",
};

export type CellResult = {
  id: string;
  label: string;
  service: Service;
  area: string;
  unit: Unit;
  /** Week 1 (the current week): the headline figures. */
  planned: number;
  booked: number;
  unfilled: number;
  spare: number;
  gap: number;
  surplus: number;
  arranging: number;
  nearTermGap: number;
  forecast: { low: number; base: number; high: number };
  forecastGap: { low: number; base: number; high: number };
  unknown: number;
  status: CellStatus;
  /** Can't be checked worker by worker (an aggregate row, part of a week, a window two needs share): confirm in scheduling. */
  estimate: boolean;
  staleDemand: boolean;
  backup: { target: number | null; available: number; continuity: string; state: BackupState };
  weeks: CellWeek[];
  /** Weeks in the horizon with a current gap, and with a base forecast gap. */
  recurs: number;
  forecastRecurs: number;
  supply: SupplyUse[];
  /** Participants' chosen workers still being checked: a choice to assess, with its route. */
  choices: { id: string; label: string; state: SupplyState }[];
  /** People in the pipeline who might cover it later: an uncertain scenario, never usable spare. */
  pipeline: { id: string; label: string; state: SupplyState; weeks: number | null }[];
  reasons: string[];
  changeIf: string[];
  owner: string;
  neededFrom: string;
  verifiedOn: string;
  source: string;
};

export type AreaResult = {
  id: string;
  name: string;
  /** Everyone listed for the area, in any state: the tempting count. */
  listed: number;
  approved: number;
  /** Supply rows with hours counted in the area in week 1. */
  usable: number;
  gapHours: number;
  gapVisits: number;
  status: CellStatus;
  fragile: number;
};

export type Priority = {
  cell: string;
  label: string;
  unit: Unit;
  gap: number;
  forecast: { low: number; high: number };
  recurs: number;
  forecastRecurs: number;
  backup: string;
  leadWeeks: number | null;
  /** Enough lead time to recruit and verify before it's needed. */
  /** Lead time against the need: recruiting and verifying builds the bench for later weeks, never this week. */
  lead: string;
  freshness: string;
  preference: string;
  why: string;
};

export type CoverageResult = {
  modelVersion: string;
  taxonomyVersion: string;
  asOf: string;
  timezone: string;
  weeks: Week[];
  cells: CellResult[];
  areas: AreaResult[];
  /** Act on current service gaps: confirmed, unfilled, by when it's needed. */
  immediate: { cell: string; text: string; owner: string }[];
  /** Build the local bench: the evidence, in a stated order (confirmed gap, then forecast gap, recurrence, backup). */
  network: Priority[];
  findings: string[];
};

type Pool = { key: string; row: SupplyRow; slot: Availability; left: number; served: { cell: DemandCell; hours: number }[] };

/** One week's allocation: committed need first, then the near-term and base forecast, then what's left as surplus. */
function allocate(i: CoverageInputs, week: Week) {
  const active = (c: DemandCell) => !c.neededFrom || c.neededFrom <= week.to;
  const cells = i.demand;
  const pools: Pool[] = i.supply.flatMap((row) => row.slots.map((slot) => ({ key: `${row.id}/${slot.id}`, row, slot, left: n(slot.hours), served: [] })));
  const checks = new Map<string, Check>();
  const checkOf = (p: Pool, c: DemandCell) => {
    const k = `${p.key}|${c.id}`;
    if (!checks.has(k)) checks.set(k, check(i, p.row, p.slot, c, week.from));
    return checks.get(k)!;
  };
  const got = new Map<string, number>(cells.map((c) => [c.id, 0]));
  const capUsed = new Map<string, number>();
  const taken = new Map<string, string>(); // pool|cell → the cell in another area it's already counted for
  const shared = new Set<string>();
  /** Already serving a cell in another area at an overlapping time: one worker can't be in two suburbs at once. */
  const clash = (p: Pool, c: DemandCell) =>
    p.served.find((x) => x.cell.area !== c.area && sharedDays(x.cell.window.days, c.window.days).length && overlapHours(x.cell.window, c.window) > 0);
  const take = (c: DemandCell, wantHours: number, only: Pool[] = pools, markShared = true) => {
    const vh = n(c.visitHours);
    if (vh <= 0) return;
    let want = wantHours;
    for (const p of only) {
      if (want <= 1e-9) break;
      const ch = checkOf(p, c);
      if (ch.kind !== "ok" || p.left < vh - 1e-9) continue;
      const other = clash(p, c);
      if (other) {
        taken.set(`${p.key}|${c.id}`, other.cell.id);
        continue;
      }
      const capLeft = ch.cap - (capUsed.get(`${p.key}|${c.id}`) ?? 0);
      const visits = Math.min(Math.floor(p.left / vh + 1e-9), Math.floor(capLeft / vh + 1e-9), Math.ceil(want / vh - 1e-9));
      if (visits <= 0) continue;
      const h = visits * vh;
      if (markShared && p.served.some((x) => x.cell.id !== c.id)) {
        shared.add(c.id);
        for (const x of p.served) shared.add(x.cell.id);
      }
      p.left -= h;
      want -= h;
      capUsed.set(`${p.key}|${c.id}`, (capUsed.get(`${p.key}|${c.id}`) ?? 0) + h);
      const s = p.served.find((x) => x.cell.id === c.id);
      if (s) s.hours += h;
      else p.served.push({ cell: c, hours: h });
      got.set(c.id, (got.get(c.id) ?? 0) + h);
    }
  };
  const hoursOf = (c: DemandCell, units: number) => (c.unit === "visits" ? units * n(c.visitHours) : units);
  const unfilledH = (c: DemandCell) => (active(c) ? hoursOf(c, Math.max(0, n(c.planned) - n(c.booked))) : 0);
  // 1. Committed, unfilled need, in the order the needs are listed.
  for (const c of cells) take(c, unfilledH(c) - (got.get(c.id) ?? 0));
  // Backup: what's left, after committed need, in windows that could serve each need (and, for an absence, by window).
  const afterCommitted = new Map(pools.map((p) => [p.key, p.left]));
  const backup = new Map<string, { rows: Set<string>; hours: number }>();
  for (const c of cells) {
    const b = { rows: new Set<string>(), hours: 0 };
    for (const p of pools)
      if (checkOf(p, c).kind === "ok" && p.left >= n(c.visitHours) - 1e-9 && !clash(p, c)) {
        b.rows.add(p.row.id);
        b.hours += p.left;
      }
    backup.set(c.id, b);
  }
  // 2. The near-term band and the base forecast: never at the expense of committed need, which is already counted.
  for (const c of cells) if (active(c)) take(c, unfilledH(c) + hoursOf(c, n(c.arranging) + n(c.forecast.base)) - (got.get(c.id) ?? 0));
  // 3. Whatever is left in a window goes to the first need it can serve (the one it already serves first), as surplus.
  for (const p of pools) {
    if (p.left <= 1e-9) continue;
    const order = [...p.served.map((x) => x.cell), ...cells.filter((c) => active(c) && !p.served.some((x) => x.cell.id === c.id))];
    for (const c of order) {
      if (p.left <= 1e-9) break;
      if (checkOf(p, c).kind !== "ok") continue;
      const before = got.get(c.id) ?? 0;
      take(c, p.left, [p], false);
      if ((got.get(c.id) ?? 0) > before) break;
    }
  }
  return { pools, checkOf, got, taken, shared, backup, afterCommitted, active };
}

/** Hours in a need's own unit: hours, or whole visits. */
function toUnits(c: DemandCell, hours: number) {
  if (c.unit === "hours") return round2(hours);
  const vh = n(c.visitHours);
  return vh > 0 ? Math.floor(hours / vh + 1e-9) : 0;
}

export function calculate(i: CoverageInputs): CoverageResult {
  const weeks = weeksOf(i);
  const runs = weeks.map((w) => ({ w, a: allocate(i, w) }));
  const first = runs[0];
  const cells: CellResult[] = i.demand.map((c) => {
    const perWeek: CellWeek[] = runs.map(({ w, a }) => {
      const on = a.active(c);
      const planned = on ? n(c.planned) : 0;
      const booked = on ? n(c.booked) : 0;
      const unfilled = Math.max(0, planned - booked);
      const spare = toUnits(c, a.got.get(c.id) ?? 0);
      const f = (k: "low" | "base" | "high") => round2(Math.max(0, unfilled + (on ? n(c.forecast[k]) : 0) - spare));
      return {
        week: w.index,
        active: on,
        planned,
        booked,
        unfilled: round2(unfilled),
        spare: round2(spare),
        gap: round2(Math.max(0, unfilled - spare)),
        surplus: round2(Math.max(0, spare - unfilled)),
        nearTermGap: round2(Math.max(0, unfilled + (on ? n(c.arranging) : 0) - spare)),
        forecastGap: { low: f("low"), base: f("base"), high: f("high") },
      };
    });
    const w0 = perWeek[0] ?? {
      week: 0,
      active: false,
      planned: 0,
      booked: 0,
      unfilled: 0,
      spare: 0,
      gap: 0,
      surplus: 0,
      nearTermGap: 0,
      forecastGap: { low: 0, base: 0, high: 0 },
    };
    // What each supply row is to this need, in week 1: its furthest check, or what it was counted for.
    const supply: SupplyUse[] = [];
    const counted = new Map<string, number>();
    if (first)
      for (const p of first.a.pools) {
        const s = p.served.find((x) => x.cell.id === c.id);
        if (s) counted.set(p.row.id, (counted.get(p.row.id) ?? 0) + s.hours);
      }
    for (const row of i.supply) {
      if (row.service !== c.service && !row.areas.includes(c.area)) continue;
      let best: Check | null = null;
      let takenBy = "";
      if (first)
        for (const p of first.a.pools.filter((x) => x.row.id === row.id)) {
          const ch = first.a.checkOf(p, c);
          const by = first.a.taken.get(`${p.key}|${c.id}`);
          const k: Check = ch.kind === "ok" && by && !counted.get(row.id) ? { ...ch, kind: "taken" } : ch;
          if (by && k.kind === "taken") takenBy = by;
          if (!best || STAGE[k.kind] > STAGE[best.kind]) best = k;
        }
      if (!best) {
        // No availability entered: judge on the row alone.
        const blank: Availability = { id: "none", days: [], from: null, to: null, hours: 0, status: "confirmed", effectiveFrom: "" };
        best = check(i, row, blank, c, first?.w.from ?? i.asOf);
        if (best.kind === "time") best = { ...best, reason: `${row.label}: no availability recorded.` };
      }
      const hours = counted.get(row.id) ?? 0;
      let kind: ReasonKind = best.kind;
      let reason = best.reason;
      if (kind === "ok" && hours <= 0) {
        // Suitable, but not needed here, or every hour already counted for another need.
        const other = takenBy ? i.demand.find((x) => x.id === takenBy) : undefined;
        kind = "taken";
        reason = other
          ? `${row.label}: suitable, but those hours are already counted for ${cellLabel(i, other)}, at an overlapping time. One worker can’t be in two places at once.`
          : `${row.label}: suitable, but every spare hour in the window is already counted for another need.`;
      } else if (kind === "taken") {
        const other = i.demand.find((x) => x.id === takenBy);
        reason = `${row.label}: suitable, but those hours are already counted for ${other ? cellLabel(i, other) : "another need"}, at an overlapping time. One worker can’t be in two places at once.`;
      }
      supply.push({ id: row.id, label: row.label, use: USE_OF[kind], kind, reason, hours: round2(toUnits(c, hours)), state: row.state });
    }
    const staleDemand = !isFresh(c.verifiedOn, i.asOf, i.freshness.days);
    const unknown = n(c.unknown);
    const wouldFit = supply.some((x) => x.kind === "stale");
    // A stale source never gives a confident answer: a gap that re-verified supply might close, or stale demand, needs confirmation.
    const status: CellStatus = staleDemand ? "confirm" : w0.gap > 0 ? (wouldFit ? "confirm" : "gap") : unknown > 0 ? "confirm" : "covered";
    const estimate =
      Boolean(first?.a.shared.has(c.id)) ||
      supply.some((x) => x.use === "usable" && i.supply.find((r) => r.id === x.id)?.aggregate) ||
      (first?.a.pools.some((p) => p.served.some((x) => x.cell.id === c.id) && first.a.checkOf(p, c).partial) ?? false);
    const b = first?.a.backup.get(c.id) ?? { rows: new Set<string>(), hours: 0 };
    const available = b.rows.size + (c.continuity.trim() ? 1 : 0);
    const backupState: BackupState = w0.planned <= 0 ? "none" : c.backupTarget === null ? "notSet" : available >= c.backupTarget ? "ok" : "short";
    const choices = i.supply.filter((r) => r.preferredFor === c.id && r.state !== "approved").map((r) => ({ id: r.id, label: r.label, state: r.state }));
    const pipeline = i.supply
      .filter(
        (r) => PIPELINE.includes(r.state) && r.service === c.service && r.areas.includes(c.area) && (!c.capability || r.capabilities.includes(c.capability)),
      )
      .map((r) => ({ id: r.id, label: r.label, state: r.state, weeks: r.onboardingWeeks }));
    const label = cellLabel(i, c);
    const reasons: string[] = [];
    const changeIf: string[] = [];
    if (w0.gap > 0) {
      reasons.push(
        `${fmtUnits(w0.unfilled, c.unit)} a week is planned and unbooked, and only ${fmtUnits(w0.spare, c.unit)} of matching spare capacity is confirmed.`,
      );
      for (const x of supply.filter((y) => y.use !== "usable" && y.kind !== "scope")) reasons.push(x.reason);
      changeIf.push(
        `A provider-approved ${SERVICES[c.service].toLowerCase()} worker${c.capability ? ` with ${CAPABILITIES[c.capability].toLowerCase()}` : ""}, confirmed free ${windowLabel(c.window)} in ${areaName(i, c.area)}.`,
      );
    } else if (w0.planned > 0) reasons.push(`Every planned ${c.unit === "hours" ? "hour" : "visit"} is booked or matched by confirmed spare capacity.`);
    for (const x of supply.filter((y) => y.kind === "stale")) changeIf.push(`Re-verifying ${x.label}’s availability with its owner.`);
    for (const x of supply.filter((y) => y.kind === "provisional")) changeIf.push(`${x.label} confirming the provisional offer.`);
    for (const x of pipeline)
      changeIf.push(
        `${x.label} completing provider checks${x.weeks !== null ? ` (an uncertain scenario: about ${x.weeks} weeks, not a start date)` : ""}. Until then they don’t count.`,
      );
    if (staleDemand)
      changeIf.push(`Confirming the demand figures with ${c.owner || "their owner"}: last verified ${c.verifiedOn ? dateLabel(c.verifiedOn) : "never"}.`);
    if (unknown > 0) changeIf.push(`Confirming the ${unknown} unknown or paused ${unknown === 1 ? "need" : "needs"}: never assumed to be zero.`);
    const owner =
      w0.gap > 0 || status === "gap"
        ? "The accountable Operations or clinical team, through the continuity process, with the Care Partner talking to the participant"
        : status === "confirm"
          ? `The source’s owner (${c.owner || "to name"}), to re-verify before anyone relies on it`
          : backupState === "short"
            ? "The Care Partner, with Operations/Quality, to build backup cover"
            : "The Care Partner: keep bookings and backup current";
    return {
      id: c.id,
      label,
      service: c.service,
      area: c.area,
      unit: c.unit,
      planned: w0.planned,
      booked: w0.booked,
      unfilled: w0.unfilled,
      spare: w0.spare,
      gap: w0.gap,
      surplus: w0.surplus,
      arranging: n(c.arranging),
      nearTermGap: w0.nearTermGap,
      forecast: { low: n(c.forecast.low), base: n(c.forecast.base), high: n(c.forecast.high) },
      forecastGap: w0.forecastGap,
      unknown,
      status,
      estimate,
      staleDemand,
      backup: { target: c.backupTarget, available, continuity: c.continuity, state: backupState },
      weeks: perWeek,
      recurs: perWeek.filter((w) => w.gap > 0).length,
      forecastRecurs: perWeek.filter((w) => w.forecastGap.base > 0).length,
      supply,
      choices,
      pipeline,
      reasons,
      changeIf,
      owner,
      neededFrom: c.neededFrom,
      verifiedOn: c.verifiedOn,
      source: c.source,
    };
  });

  const areas: AreaResult[] = i.areas.map((a) => {
    const mine = cells.filter((c) => c.area === a.id);
    const rows = i.supply.filter((s) => s.areas.includes(a.id));
    const status: CellStatus = mine.some((c) => c.status === "gap") ? "gap" : mine.some((c) => c.status === "confirm") ? "confirm" : "covered";
    return {
      id: a.id,
      name: a.name,
      listed: rows.length,
      approved: rows.filter((s) => s.state === "approved").length,
      usable: new Set(mine.flatMap((c) => c.supply.filter((x) => x.use === "usable" && x.hours > 0).map((x) => x.id))).size,
      gapHours: round2(mine.filter((c) => c.unit === "hours").reduce((t, c) => t + c.gap, 0)),
      gapVisits: round2(mine.filter((c) => c.unit === "visits").reduce((t, c) => t + c.gap, 0)),
      status,
      fragile: mine.filter((c) => c.backup.state === "short").length,
    };
  });

  const byNeed = (c: CellResult) => c.neededFrom || "0000";
  const immediate = cells
    .filter((c) => c.gap > 0)
    .sort((a, b) => byNeed(a).localeCompare(byNeed(b)) || i.demand.findIndex((x) => x.id === a.id) - i.demand.findIndex((x) => x.id === b.id))
    .map((c) => ({
      cell: c.id,
      text: `${c.label}: ${fmtUnits(c.gap, c.unit)} a week of confirmed, approved service is unfilled${c.neededFrom ? ` from ${dateLabel(c.neededFrom)}` : " now"}, with no confirmed suitable spare capacity to fill it. A recruitment brief doesn’t resolve this week’s need.`,
      owner: c.owner,
    }));

  const lead = i.leadWeeks;
  const network: Priority[] = cells
    .filter((c) => c.gap > 0 || c.forecastGap.base > 0 || c.backup.state === "short")
    .map((c) => {
      const neededIn = c.neededFrom && i.asOf ? days(i.asOf, c.neededFrom) / 7 : 0;
      const leadText =
        lead === null
          ? "Lead time to recruit and verify isn’t set."
          : c.gap > 0
            ? `About ${lead} weeks to recruit and verify: it can build the bench for later weeks, but it won’t fill this week’s gap.`
            : neededIn >= lead
              ? `About ${lead} weeks to recruit and verify: enough time before it’s needed, if started now.`
              : `About ${lead} weeks to recruit and verify: tight, so plan an interim arrangement too.`;
      const pref = i.demand.find((x) => x.id === c.id)?.preference ?? "none";
      return {
        cell: c.id,
        label: c.label,
        unit: c.unit,
        gap: c.gap,
        forecast: { low: c.forecastGap.low, high: c.forecastGap.high },
        recurs: c.recurs,
        forecastRecurs: c.forecastRecurs,
        backup: `${c.backup.available} suitable backup${c.backup.available === 1 ? "" : "s"}${c.backup.target !== null ? ` against a target of ${c.backup.target}` : " (no target set)"}`,
        leadWeeks: lead,
        lead: leadText,
        freshness: c.staleDemand
          ? `Demand needs re-verifying (last ${c.verifiedOn ? dateLabel(c.verifiedOn) : "never"})`
          : `Demand verified ${dateLabel(c.verifiedOn)}`,
        preference: PREFERENCES[pref],
        why:
          c.gap > 0
            ? `${fmtUnits(c.gap, c.unit)} a week is unfilled now, in ${c.recurs} of ${weeks.length} weeks; with forecast demand the gap would be ${fmtUnits(c.forecastGap.low, c.unit)} to ${fmtUnits(c.forecastGap.high, c.unit)}.`
            : c.forecastGap.base > 0
              ? `No current gap, but the base forecast leaves ${fmtUnits(c.forecastGap.base, c.unit)} a week uncovered in ${c.forecastRecurs} of ${weeks.length} weeks.`
              : `Every current visit is covered, but backup is below the owner’s target: one absence would leave visits uncovered.`,
      };
    })
    .sort((a, b) => b.gap - a.gap || b.forecast.high - a.forecast.high || b.recurs - a.recurs);

  const result: CoverageResult = {
    modelVersion: MODEL_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    asOf: i.asOf,
    timezone: i.timezone,
    weeks,
    cells,
    areas,
    immediate,
    network,
    findings: [],
  };
  result.findings = findingsOf(i, result);
  return result;
}

function findingsOf(i: CoverageInputs, r: CoverageResult): string[] {
  const out: string[] = [];
  for (const c of r.cells) {
    if (c.staleDemand) out.push(`${c.label}: needs confirmation. The demand figures were last verified ${c.verifiedOn ? dateLabel(c.verifiedOn) : "never"}.`);
    else if (c.gap > 0)
      out.push(
        c.status === "confirm"
          ? `${c.label}: needs confirmation. ${fmtUnits(c.gap, c.unit)} a week looks unfilled, but availability that might cover it hasn’t been re-verified.`
          : `${c.label}: ${fmtUnits(c.gap, c.unit)} a week unfilled, with no confirmed suitable spare capacity.`,
      );
    else if (c.planned > 0 && c.surplus > 0) out.push(`${c.label}: covered, with ${fmtUnits(c.surplus, c.unit)} a week of matching spare (counted here only).`);
    else if (c.planned > 0 && c.status === "covered") out.push(`${c.label}: covered.`);
    if (c.gap <= 0 && c.backup.state === "short")
      out.push(`${c.label}: no current gap, but backup is fragile: ${c.backup.available} suitable backup against a target of ${c.backup.target}.`);
    if (c.estimate) out.push(`${c.label}: a coverage estimate. Confirm it in scheduling.`);
    for (const x of c.choices)
      out.push(
        `${c.label}: the participant’s chosen worker (${x.label}) is at “${SUPPLY_STATES[x.state].toLowerCase()}”: a choice to assess, not spare capacity.`,
      );
    if (c.unknown > 0) out.push(`${c.label}: ${c.unknown} unknown or paused ${c.unknown === 1 ? "need" : "needs"} to confirm: not assumed to be zero.`);
  }
  if (r.cells.some((c) => c.forecastGap.base > c.gap))
    out.push("Forecast demand is shown as a band beside the current gap. It never changes the current gap, and an outreach plan is never a service date.");
  if (!i.supply.length) out.push("No supply is recorded yet: nothing can count as spare capacity.");
  return out;
}

/** An absence: which current visits a worker's absence would leave, and what suitable backup could cover. */
export function absence(i: CoverageInputs, workerId: string) {
  const w = weeksOf(i)[0];
  const row = i.supply.find((s) => s.id === workerId);
  if (!w || !row) return null;
  const a = allocate(i, w);
  const spareLeft = new Map(a.afterCommitted);
  const affected = row.bookings
    .map((b) => {
      const c = i.demand.find((x) => x.id === b.cell);
      if (!c) return null;
      // Backup: other suitable windows, with hours left after committed need. Not this worker, and never a candidate.
      const vh = n(c.visitHours);
      let left = b.hours;
      let covered = 0;
      for (const p of a.pools) {
        if (p.row.id === row.id || a.checkOf(p, c).kind !== "ok") continue;
        const spare = spareLeft.get(p.key) ?? 0;
        const visits = Math.min(Math.floor(spare / vh + 1e-9), Math.ceil(left / vh - 1e-9));
        if (visits <= 0) continue;
        spareLeft.set(p.key, spare - visits * vh);
        covered += visits * vh;
        left -= visits * vh;
      }
      const lostUnits = toUnits(c, b.hours);
      const coveredUnits = Math.min(lostUnits, toUnits(c, covered));
      return { cell: c.id, label: cellLabel(i, c), unit: c.unit, lost: lostUnits, covered: coveredUnits, uncovered: round2(lostUnits - coveredUnits) };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return { worker: row.label, affected, uncovered: affected.some((x) => x.uncovered > 0) };
}

// ---------------------------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------------------------

const v = (x: Num) => (x === null ? "blank" : String(x));

/** What the person changed, in words: demand, bookings, supply states, availability and verification. */
export function inputChanges(a: CoverageInputs, b: CoverageInputs): string[] {
  const out: string[] = [];
  if (a.asOf !== b.asOf) out.push(`As of ${dateLabel(a.asOf)} → ${dateLabel(b.asOf)}.`);
  if (a.weeks !== b.weeks) out.push(`Planning horizon ${v(a.weeks)} → ${v(b.weeks)} weeks.`);
  if (a.freshness.days !== b.freshness.days) out.push(`Freshness rule ${v(a.freshness.days)} → ${v(b.freshness.days)} days.`);
  for (const cb of b.demand) {
    const ca = a.demand.find((x) => x.id === cb.id);
    const name = cellLabel(b, cb);
    if (!ca) {
      out.push(`Added a need: ${name}.`);
      continue;
    }
    for (const [k, label] of [
      ["planned", "confirmed planned"],
      ["booked", "booked"],
      ["arranging", "being arranged"],
      ["unknown", "unknown or paused"],
      ["backupTarget", "backup target"],
    ] as const)
      if (ca[k] !== cb[k]) out.push(`${name}: ${label} ${v(ca[k])} → ${v(cb[k])}.`);
    if (ca.forecast.low !== cb.forecast.low || ca.forecast.base !== cb.forecast.base || ca.forecast.high !== cb.forecast.high)
      out.push(
        `${name}: forecast ${v(ca.forecast.low)}/${v(ca.forecast.base)}/${v(ca.forecast.high)} → ${v(cb.forecast.low)}/${v(cb.forecast.base)}/${v(cb.forecast.high)}. The current gap doesn’t change: a forecast is a separate band.`,
      );
    if (ca.verifiedOn !== cb.verifiedOn) out.push(`${name}: demand verified ${ca.verifiedOn || "never"} → ${cb.verifiedOn || "never"}.`);
    if (windowLabel(ca.window) !== windowLabel(cb.window)) out.push(`${name}: window was ${windowLabel(ca.window)}.`);
  }
  for (const ca of a.demand) if (!b.demand.some((x) => x.id === ca.id)) out.push(`Removed a need: ${cellLabel(a, ca)}.`);
  for (const sb of b.supply) {
    const sa = a.supply.find((x) => x.id === sb.id);
    if (!sa) {
      out.push(
        `Added ${sb.label || "a supply row"} (${SUPPLY_STATES[sb.state].toLowerCase()}). A listing isn’t capacity until it’s approved, available and verified.`,
      );
      continue;
    }
    if (sa.state !== sb.state) out.push(`${sb.label}: ${SUPPLY_STATES[sa.state]} → ${SUPPLY_STATES[sb.state]}.`);
    if (sa.verifiedOn !== sb.verifiedOn) out.push(`${sb.label}: availability verified ${sa.verifiedOn || "never"} → ${sb.verifiedOn || "never"}.`);
    const slots = (s: SupplyRow) => s.slots.map((x) => `${windowLabel(x)} ${v(x.hours)} h ${AVAILABILITY[x.status].toLowerCase()}`).join("; ");
    if (slots(sa) !== slots(sb)) out.push(`${sb.label}: availability now ${slots(sb) || "none"}.`);
    if (sa.areas.join() !== sb.areas.join()) out.push(`${sb.label}: travels to ${sb.areas.map((x) => areaName(b, x)).join(", ") || "nowhere recorded"}.`);
  }
  for (const sa of a.supply) if (!b.supply.some((x) => x.id === sa.id)) out.push(`Removed ${sa.label}.`);
  return out;
}

/** What it did to the result, in words: gaps, newly usable capacity, backups and status. */
export function resultChanges(a: CoverageResult, b: CoverageResult): string[] {
  const out: string[] = [];
  for (const cb of b.cells) {
    const ca = a.cells.find((x) => x.id === cb.id);
    if (!ca) continue;
    if (ca.gap !== cb.gap) out.push(`${cb.label}: current gap ${fmtUnits(ca.gap, cb.unit)} → ${fmtUnits(cb.gap, cb.unit)}.`);
    if (ca.spare !== cb.spare) out.push(`${cb.label}: usable spare ${fmtUnits(ca.spare, cb.unit)} → ${fmtUnits(cb.spare, cb.unit)}.`);
    if (ca.forecastGap.base !== cb.forecastGap.base)
      out.push(`${cb.label}: base forecast gap ${fmtUnits(ca.forecastGap.base, cb.unit)} → ${fmtUnits(cb.forecastGap.base, cb.unit)}.`);
    if (ca.status !== cb.status) out.push(`${cb.label}: ${STATUS[ca.status].label} → ${STATUS[cb.status].label}.`);
    if (ca.backup.state !== cb.backup.state) out.push(`${cb.label}: ${BACKUP[ca.backup.state].toLowerCase()} → ${BACKUP[cb.backup.state].toLowerCase()}.`);
    const usable = (c: CellResult) => new Set(c.supply.filter((x) => x.use === "usable").map((x) => x.label));
    const now = [...usable(cb)].filter((x) => !usable(ca).has(x));
    if (now.length) out.push(`${cb.label}: newly usable: ${now.join(", ")}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Starting points and stored JSON
// ---------------------------------------------------------------------------------------------

export const blankCell = (id: string, area: string): DemandCell => ({
  id,
  service: "personalCare",
  capability: "",
  area,
  window: { days: [...WEEKDAYS], from: null, to: null },
  unit: "hours",
  visitHours: null,
  planned: null,
  booked: null,
  arranging: null,
  forecast: { low: null, base: null, high: null },
  unknown: null,
  neededFrom: "",
  preference: "none",
  backupTarget: null,
  continuity: "",
  source: "",
  owner: "",
  verifiedOn: "",
});

export const blankSupply = (id: string, label: string): SupplyRow => ({
  id,
  label,
  aggregate: true,
  service: "personalCare",
  capabilities: [],
  state: "approved",
  areas: [],
  slots: [{ id: "a1", days: [...WEEKDAYS], from: null, to: null, hours: null, status: "confirmed", effectiveFrom: "" }],
  verifiedOn: "",
  source: "",
  owner: "",
  preferredFor: "",
  onboardingWeeks: null,
  bookings: [],
});

/** A blank entry for "Plan my local area": one area, one need and one aggregate supply row, nothing filled in. */
export function blankInputs(asOf: string): CoverageInputs {
  return {
    asOf,
    timezone: "Australia/Brisbane",
    weeks: HORIZON.default,
    freshness: { days: null, setBy: "", from: "" },
    leadWeeks: null,
    areas: [{ id: "area-1", name: "", x: 50, y: 50 }],
    demand: [blankCell("need-1", "area-1")],
    supply: [blankSupply("row-1", "Supply row 1")],
  };
}

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw => (x && typeof x === "object" && !Array.isArray(x) ? (x as Raw) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max = 200) => (typeof x === "string" ? x.slice(0, max) : "");
const num = (x: unknown): Num => (typeof x === "number" && Number.isFinite(x) ? x : null);
const oneOf = <T extends string>(x: unknown, all: readonly T[], d: T): T => (all.includes(x as T) ? (x as T) : d);
const ID = /^[a-z0-9-]{1,40}$/;
const id = (x: unknown, d: string) => (typeof x === "string" && ID.test(x) ? x : d);
const date = (x: unknown) => (typeof x === "string" && DATE.test(x) ? x : "");
const dayList = (x: unknown) => DAYS.filter((d) => arr(x).includes(d));
const pct = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 50);

export function cleanInputs(x: unknown): CoverageInputs {
  const o = obj(x);
  const f = obj(o.freshness);
  return {
    asOf: date(o.asOf),
    timezone: str(o.timezone, 60) || "Australia/Brisbane",
    weeks: num(o.weeks),
    freshness: { days: num(f.days), setBy: str(f.setBy, 120), from: date(f.from) },
    leadWeeks: num(o.leadWeeks),
    areas: arr(o.areas)
      .slice(0, 12)
      .map((y, k) => {
        const a = obj(y);
        return { id: id(a.id, `area-${k + 1}`), name: str(a.name, 60), ...(str(a.note, 300) ? { note: str(a.note, 300) } : {}), x: pct(a.x), y: pct(a.y) };
      }),
    demand: arr(o.demand)
      .slice(0, 40)
      .map((y, k) => {
        const c = obj(y);
        const w = obj(c.window);
        const fc = obj(c.forecast);
        return {
          id: id(c.id, `need-${k + 1}`),
          service: oneOf(c.service, SERVICE_ORDER, "personalCare"),
          capability: oneOf(c.capability, ["", ...CAPABILITY_ORDER] as const, ""),
          area: str(c.area, 40),
          window: { days: dayList(w.days), from: num(w.from), to: num(w.to) },
          unit: oneOf(c.unit, ["hours", "visits"] as const, "hours"),
          visitHours: num(c.visitHours),
          planned: num(c.planned),
          booked: num(c.booked),
          arranging: num(c.arranging),
          forecast: { low: num(fc.low), base: num(fc.base), high: num(fc.high) },
          unknown: num(c.unknown),
          neededFrom: date(c.neededFrom),
          preference: oneOf(c.preference, Object.keys(PREFERENCES) as Preference[], "none"),
          backupTarget: num(c.backupTarget),
          continuity: str(c.continuity, 300),
          source: str(c.source, 200),
          owner: str(c.owner, 120),
          verifiedOn: date(c.verifiedOn),
          ...(str(c.note, 600) ? { note: str(c.note, 600) } : {}),
        };
      }),
    supply: arr(o.supply)
      .slice(0, 60)
      .map((y, k) => {
        const s = obj(y);
        return {
          id: id(s.id, `row-${k + 1}`),
          label: str(s.label, 80),
          aggregate: s.aggregate === true,
          service: oneOf(s.service, SERVICE_ORDER, "personalCare"),
          capabilities: CAPABILITY_ORDER.filter((c) => arr(s.capabilities).includes(c)),
          state: oneOf(s.state, STATE_ORDER, "candidate"),
          areas: [
            ...new Set(
              arr(s.areas)
                .filter((a): a is string => typeof a === "string")
                .map((a) => a.slice(0, 40)),
            ),
          ].slice(0, 12),
          slots: arr(s.slots)
            .slice(0, 8)
            .map((z, j) => {
              const a = obj(z);
              return {
                id: id(a.id, `a${j + 1}`),
                days: dayList(a.days),
                from: num(a.from),
                to: num(a.to),
                hours: num(a.hours),
                status: oneOf(a.status, Object.keys(AVAILABILITY) as AvailabilityStatus[], "confirmed"),
                effectiveFrom: date(a.effectiveFrom),
              };
            }),
          verifiedOn: date(s.verifiedOn),
          source: str(s.source, 200),
          owner: str(s.owner, 120),
          preferredFor: str(s.preferredFor, 40),
          onboardingWeeks: num(s.onboardingWeeks),
          bookings: arr(s.bookings)
            .slice(0, 12)
            .map((z) => obj(z))
            .filter((b) => typeof b.cell === "string" && typeof b.hours === "number" && Number.isFinite(b.hours))
            .map((b) => ({ cell: str(b.cell, 40), hours: Math.max(0, b.hours as number) })),
          ...(str(s.note, 400) ? { note: str(s.note, 400) } : {}),
        };
      }),
  };
}

/** The headline a saved plan keeps: totals by unit, never a person or an address. */
export const snapshotOf = (r: CoverageResult) => ({
  needs: r.cells.length,
  gapHours: round2(r.cells.filter((c) => c.unit === "hours").reduce((t, c) => t + c.gap, 0)),
  gapVisits: round2(r.cells.filter((c) => c.unit === "visits").reduce((t, c) => t + c.gap, 0)),
  immediate: r.immediate.length,
  confirm: r.cells.filter((c) => c.status === "confirm").length,
  fragile: r.cells.filter((c) => c.backup.state === "short").length,
});
