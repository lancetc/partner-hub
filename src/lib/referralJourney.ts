/*
  Referral Journey Calculator ("Which referrals become active clients?", docs/referral-journey.md): a deterministic
  cohort model that follows the same arrival cohort of enquiries, by referral source, through authorised
  introduction, a suitable pathway, the participant's choice of provider and agreement, the first delivered service,
  and whether starts are still active at an observation point. It sets relationship effort beside the starts it led
  to, and keeps case onboarding effort apart.

  The PRD asks to build from the Local Referral Studio's approved stage model and claim register. That Work Tool isn't
  in the Hub yet, so the stage model lives here, versioned as referral-stages-1, and is shared by every Referral
  Journey block, the story (fictional rows) and "Review my relationships" (a partner's own aggregate cohorts). When
  the Studio exists, this file's stage model is what it should own. No AI calculates anything.

    authorised_introduction_rate = authorised_introductions / distinct_enquiries
    agreement_rate               = agreements / distinct_enquiries_in_same_arrival_cohort
    service_start_rate           = first_services / distinct_enquiries_in_same_arrival_cohort
    stage_matched_start_rate     = first_services_from_selected_initial_stage
                                   / distinct_enquiries_from_that_initial_stage_in_the_same_cohort
    effort_hours_per_start       = recorded_relationship_effort_hours / first_services_in_the_same_cohort
    active_at_N_rate             = active_at_day_N / starts_with_at_least_N_days_of_observation

  Rules it keeps:
  - A zero denominator is "insufficient data": never 0 % and never infinity.
  - Every rate carries its numerator, denominator and cohort. Starts are counted in the month the enquiry arrived,
    never in the month they started, so a current-month start from a January enquiry is never divided by
    current-month enquiries.
  - One person counts once in an enquiry cohort. The primary source is a reviewed attribution if one is recorded, else
    the first authorised introduction; other contacts are assists. Contacts from different sources with no authorised
    introduction are "Unknown or multiple", which is a valid source.
  - The stage at first contact is stored apart from any later stage, and is never inferred from the referral source.
  - An open enquiry isn't a failure, and a person waiting for a funding allocation isn't a lost conversion. Enquiries
    younger than the comparison age are open, not yet mature.
  - An agreement isn't a delivered service.
  - Time to first service is a distribution. With exact dates (the fictional rows) it shows the median and range of
    those who started, with the still-open cases and their ages beside it. Grouped bands (manual cohorts) never
    produce an exact median.
  - Relationship effort and case onboarding effort are labelled apart; onboarding is never silently added. Hours are
    never turned into money or profit.
  - Continuity counts only starts old enough for the observation period. Exits are shown by reason: a death or a move
    to residential care isn't a failed referral.
  - Small samples and differing stage mixes say "too early to rank". There's no single best-referrer score.
  - Blank, unknown and zero are different: a blank count is an error to fix; "unknown" is kept out of the arithmetic
    and named; zero is zero. Counts can't exceed the distinct cohort, and mature starts can't exceed starts.
*/

export const MODEL_VERSION = "referral-journey-1";
/** Stands in for the Local Referral Studio's approved stage model and claim register, until that tool exists. */
export const STAGE_MODEL_VERSION = "referral-stages-1";

export const SOURCES = {
  gp: "GP practice",
  hospital: "Hospital discharge team",
  allied: "Allied health",
  community: "Community organisation",
  client: "Existing client recommendation",
  self: "Self or family, directly",
  other: "Another professional",
  unknown: "Unknown or multiple",
} as const;
export type Source = keyof typeof SOURCES;
export const SOURCE_ORDER = Object.keys(SOURCES) as Source[];
export const SOURCE_HINTS: Record<Source, string> = {
  gp: "A general practice: a GP, practice nurse or practice staff with the person’s authority.",
  hospital: "A hospital discharge or transition team.",
  allied: "A physiotherapist, occupational therapist or other allied health professional.",
  community: "A community organisation, seniors’ group or local service.",
  client: "An existing client or their family recommending the business.",
  self: "The person or their family, finding the business themselves.",
  other: "Another professional, a pharmacist say. Often an assist rather than the introduction.",
  unknown: "No single source can be attributed, or several mentioned it with no authorised introduction. A valid answer.",
};

/** Where a person is in the Support at Home journey when they first make contact. Stored apart from any later update. */
export const STAGES = {
  unknown: "Unknown",
  assessment: "Needs assessment",
  waiting: "Approved, waiting for allocation",
  allocated: "Allocated, choosing a provider",
  changing: "Receiving care, considering a change",
  urgent: "Urgent change",
} as const;
export type Stage = keyof typeof STAGES;
export const STAGE_ORDER = Object.keys(STAGES) as Stage[];
export const STAGE_HINTS: Record<Stage, string> = {
  unknown: "The stage wasn’t known at first contact. Counted, never guessed.",
  assessment: "Hasn’t been assessed yet, or is waiting for an assessment or its outcome. Can’t choose a provider yet.",
  waiting: "Approved for Support at Home but waiting for a funding allocation. Can’t start funded services until it arrives: waiting isn’t lost.",
  allocated: "Has an allocation and is choosing a provider. Ready to decide, in their own time.",
  changing: "Already receiving care and thinking about changing provider or arrangement.",
  urgent: "A time-sensitive change, often at hospital discharge, needing prompt coordination.",
};
/** The stages at which a person can choose a provider now. */
export const READY: readonly Stage[] = ["allocated", "changing", "urgent"];

/** The events between an enquiry and an active client, in the calculator's own words (PRD section 5). */
export const EVENTS = {
  enquiry: {
    label: "Enquiry",
    hint: "A distinct person or authorised supporter asks about support, or a professional raises an enquiry with authority. A handout download or a page view isn’t an enquiry.",
  },
  introduced: {
    label: "Authorised introduction",
    hint: "There’s permission for the person to be contacted through the approved process. A meeting with a GP practice is relationship activity, not a patient introduction.",
  },
  pathway: {
    label: "Suitable pathway",
    hint: "Needs, approval stage, preferences and the current service model considered through the authorised intake process. A lead score never decides eligibility.",
  },
  agreed: { label: "Agreement", hint: "The participant chooses the provider and enters the service agreement. Not yet a delivered service." },
  started: { label: "First service", hint: "The first delivered, agreed service, operationally verified." },
  active: {
    label: "Active at the observation point",
    hint: "Still receiving the service arrangement at the reviewed 30, 60 or 90-day point. Exits are shown by reason.",
  },
} as const;
export type FunnelStep = "introduced" | "pathway" | "agreed" | "started";
export const FUNNEL: FunnelStep[] = ["introduced", "pathway", "agreed", "started"];

export const CLOSE_REASONS = {
  choseOther: "Chose another provider (their choice)",
  delayed: "Decided not to go ahead now (their choice)",
  notSuitable: "Not a suitable pathway now",
  noAuthority: "No authority to contact, or couldn’t be reached",
  residential: "Moved to residential care",
  died: "Died",
  other: "Another reason",
  unknown: "Reason not recorded",
} as const;
export type CloseReason = keyof typeof CLOSE_REASONS;
export const CLOSE_ORDER = Object.keys(CLOSE_REASONS) as CloseReason[];
/** A valid exercise of the person's choice: never a target for follow-up pressure. */
export const CHOICE_REASONS: readonly CloseReason[] = ["choseOther", "delayed"];

export const EXIT_REASONS = {
  died: "Died",
  residential: "Moved to residential care",
  moved: "Moved out of the area",
  changedProvider: "Changed provider (their choice)",
  serviceIssue: "A service issue (worth reviewing)",
  other: "Another reason",
  unknown: "Reason not recorded",
} as const;
export type ExitReason = keyof typeof EXIT_REASONS;
export const EXIT_ORDER = Object.keys(EXIT_REASONS) as ExitReason[];

/** Why a person is waiting, and who owns that part of the delay. A referrer doesn't own a government wait. */
export const WAITS = {
  assessment: { label: "Waiting for an assessment or its outcome", owner: "The government assessment process" },
  funding: { label: "Waiting for a funding allocation", owner: "The government allocation (nobody local can speed it)" },
  choice: { label: "The person’s own decision or timing", owner: "The participant, in their own time" },
  intake: { label: "Intake and agreement work", owner: "The Care Partner and intake team" },
  capacity: { label: "Service capacity (no suitable worker or supplier yet)", owner: "Operations and the local supplier network" },
  handoff: { label: "A delayed handoff or missing information", owner: "The referrer and intake together" },
  unknown: { label: "Not recorded", owner: "Unknown" },
} as const;
export type WaitReason = keyof typeof WAITS;
export const WAIT_ORDER = Object.keys(WAITS) as WaitReason[];

export const BANDS = { d0_14: "0–14 days", d15_30: "15–30 days", d31_60: "31–60 days", d61: "Over 60 days", unknown: "Unknown" } as const;
export type Band = keyof typeof BANDS;
export const BAND_ORDER = Object.keys(BANDS) as Band[];
export const bandOf = (days: number): Band => (days <= 14 ? "d0_14" : days <= 30 ? "d15_30" : days <= 60 ? "d31_60" : "d61");

export const OBSERVATION = [30, 60, 90] as const;

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

/** A count: null is blank (an error to fix), never zero. */
export type Num = number | null;
/** A figure that may honestly be unknown: "unknown" is kept out of the arithmetic and named; null is blank. */
export type Amount = number | null | "unknown";

export type Contact = { source: Source; on: string; authorised: boolean };

/** One distinct person in an enquiry cohort (the fictional rows, or a future approved integration). Opaque id only. */
export type ReferralRecord = {
  id: string;
  area: string;
  /** The first enquiry: sets the arrival cohort. */
  enquiredOn: string;
  /** Every known contact about this person. The primary source comes from these; the rest are assists. */
  contacts: Contact[];
  /** A reviewed attribution rule's answer, when one was applied. */
  attribution: Source | "";
  initialStage: Stage;
  /** A later stage update, stored apart: it never changes the stage at first contact. */
  laterStage: Stage | "";
  introducedOn: string;
  pathwayOn: string;
  /** When a funding allocation arrived, if the person was waiting for one. */
  allocatedOn: string;
  agreedOn: string;
  startedOn: string;
  closed: CloseReason | "";
  closedOn: string;
  /** The main reason they're waiting (if open) or waited (if they started late). */
  wait: WaitReason | "";
  exitedOn: string;
  exitReason: ExitReason | "";
  /** A short, de-identified description of the handoff: no names, no clinical detail. */
  note?: string;
};

/** Effort for a source and cohort month. Relationship work and case onboarding are labelled apart. */
export type Effort = {
  meetings: Amount;
  travel: Amount;
  materials: Amount;
  followUp: Amount;
  /** Case onboarding hours: shown beside relationship effort, never added to it. */
  onboarding: Amount;
  /** Direct costs, only if voluntarily entered. Never converted to profit. */
  costs: Amount;
  /** Observed time (a diary or timesheet) rather than an estimate. */
  observed: boolean;
};
export const RELATIONSHIP_PARTS = {
  meetings: "Relationship meetings",
  travel: "Travel and outreach",
  materials: "Preparing approved material",
  followUp: "Relationship follow-up",
} as const;
export type RelationshipPart = keyof typeof RELATIONSHIP_PARTS;
export const PART_ORDER = Object.keys(RELATIONSHIP_PARTS) as RelationshipPart[];

export type EffortRow = { id: string; source: Source; month: string; effort: Effort };

/** One source's enquiries in one month and area, entered as counts (Review my relationships). Never a name. */
export type CohortRow = {
  id: string;
  source: Source;
  /** The month the enquiries arrived (YYYY-MM). */
  month: string;
  area: string;
  /** An optional private label the owner will recognise. Private to the business; never in analytics. */
  label: string;
  enquiries: Num;
  stages: Record<Stage, Num>;
  introduced: Num;
  pathway: Num;
  agreed: Num;
  started: Num;
  open: Num;
  closed: Num;
  closedReasons: { reason: CloseReason; count: Num }[];
  /** First services by the stage at first contact, for the stage-matched rate. "unknown" if not recorded. */
  startsByStage: Record<Stage, Amount>;
  /** Days from enquiry to first service, for those who started. */
  bands: Record<Band, Num>;
  /** Starts old enough for the observation period, and how many were still active at it. */
  matureStarts: Num;
  active: Num;
  exits: { reason: ExitReason; count: Num }[];
  effort: Effort;
  method: "manual" | "verified";
  extractedOn: string;
  duplicates: Amount;
};

export type ReferralInputs = {
  /** "records": de-identified individual rows with dates (the story). "aggregate": a source-by-month grid. */
  mode: "records" | "aggregate";
  asOf: string;
  timezone: string;
  /** The continuity observation point: 30, 60 or 90 days after the first service. */
  observationDays: Num;
  /** A cohort is compared at this age (days after enquiry). Younger enquiries are open, not yet mature. */
  matureAge: Num;
  /** Under this many mature enquiries, a source is "too early to rank". Set by the owner. */
  minSample: Num;
  areas: { id: string; name: string; note?: string }[];
  records: ReferralRecord[];
  effort: EffortRow[];
  rows: CohortRow[];
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
export const round1 = (v: number) => Math.round(v * 10) / 10;
const DAY = 86_400_000;
/** Whole days from a to b (ISO dates, read as UTC). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
export const monthOf = (iso: string) => iso.slice(0, 7);
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (m: string) => (MONTH.test(m) ? `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : "an unnamed month");
const monthEnd = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const dateLabel = (iso: string) =>
  DATE.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "no date";
export function periodLabel(months: string[]) {
  const m = [...months].sort();
  if (!m.length) return "No cohort chosen";
  if (m.length === 1) return `${monthLabel(m[0])} enquiries`;
  const [a, b] = [m[0], m.at(-1)!];
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${MONTH_NAMES[Number(a.slice(5, 7)) - 1]}–${monthLabel(b)} enquiries`
    : `${monthLabel(a)} to ${monthLabel(b)} enquiries`;
}
export const areaName = (i: Pick<ReferralInputs, "areas">, id: string) =>
  i.areas.find((a) => a.id === id)?.name || (id ? "an unnamed area" : "area not recorded");
const known = (a: Amount): number | null => (typeof a === "number" ? a : null);

// ---------------------------------------------------------------------------------------------
// Rates: numerator, denominator, and "insufficient data" for a zero denominator
// ---------------------------------------------------------------------------------------------

export type Rate = { num: number; den: number; value: number | null; text: string };
export const INSUFFICIENT = "insufficient data";

/** A share: "6/12 = 50%", or "insufficient data" when there's nothing to divide by. Never 0 % or infinity. */
export function rate(num: number, den: number): Rate {
  if (!(den > 0)) return { num, den, value: null, text: INSUFFICIENT };
  const value = num / den;
  return { num, den, value, text: `${num}/${den} = ${Math.round(value * 100)}%` };
}
/** Hours per start: "18 h / 6 starts = 3 h per start", or "insufficient data". */
export function perStart(hours: number | null, starts: number): Rate {
  if (hours === null || !(starts > 0)) return { num: hours ?? 0, den: starts, value: null, text: INSUFFICIENT };
  const value = hours / starts;
  return { num: hours, den: starts, value, text: `${round1(hours)} h / ${starts} ${starts === 1 ? "start" : "starts"} = ${round1(value)} h per start` };
}
export const pct = (r: Rate) => (r.value === null ? INSUFFICIENT : `${Math.round(r.value * 100)}%`);
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

// ---------------------------------------------------------------------------------------------
// Attribution: one person counts once
// ---------------------------------------------------------------------------------------------

export type Attribution = { source: Source; rule: "reviewed" | "authorised" | "single" | "multiple" | "none"; assists: Source[] };

/**
  The primary source for a person: a reviewed attribution if recorded; else the first authorised introduction; else
  the one source every contact came from; else "Unknown or multiple". Every other contact is an assist, never a second
  enquiry or a second conversion.
*/
export function attribute(r: Pick<ReferralRecord, "contacts" | "attribution">): Attribution {
  const sorted = [...r.contacts].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const others = (primary: Source) => {
    const out: Source[] = [];
    let skipped = false;
    for (const c of sorted) {
      if (!skipped && c.source === primary) {
        skipped = true;
        continue;
      }
      out.push(c.source);
    }
    return out;
  };
  if (r.attribution) return { source: r.attribution, rule: "reviewed", assists: others(r.attribution) };
  const first = sorted.find((c) => c.authorised);
  if (first) return { source: first.source, rule: "authorised", assists: others(first.source) };
  const kinds = new Set(sorted.map((c) => c.source));
  if (kinds.size === 1) return { source: sorted[0].source, rule: "single", assists: others(sorted[0].source) };
  if (!kinds.size) return { source: "unknown", rule: "none", assists: [] };
  return { source: "unknown", rule: "multiple", assists: sorted.map((c) => c.source) };
}

// ---------------------------------------------------------------------------------------------
// Validation: blank is not zero, and counts stay inside the cohort
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

export function validateInputs(i: ReferralInputs): InputError[] {
  const out: InputError[] = [];
  /** A required number. Counts of people (the default) must be whole. */
  const need = (v: Num | undefined, field: string, label: string, { min = 0, max = 100000, whole = true } = {}) => {
    if (v === null || v === undefined || Number.isNaN(v)) out.push({ field, message: `${label} is blank. Enter a number (0 if there were none).` });
    else if (v < min || v > max) out.push({ field, message: `${label} must be between ${min} and ${max}.` });
    else if (whole && !Number.isInteger(v)) out.push({ field, message: `${label} is a count: a whole number.` });
  };
  const maybe = (v: Amount, field: string, label: string) => {
    if (v === null) out.push({ field, message: `${label} is blank. Enter a number, 0, or mark it unknown.` });
    else if (typeof v === "number" && (v < 0 || !Number.isFinite(v))) out.push({ field, message: `${label} can’t be negative.` });
  };
  if (!DATE.test(i.asOf) || !Number.isFinite(Date.parse(i.asOf))) out.push({ field: "asOf", message: "Enter the date the figures are as of." });
  if (i.observationDays === null) out.push({ field: "observationDays", message: "Choose the continuity observation point: 30, 60 or 90 days." });
  else if (!(OBSERVATION as readonly number[]).includes(i.observationDays))
    out.push({ field: "observationDays", message: "The observation point must be 30, 60 or 90 days." });
  need(i.matureAge, "matureAge", "The comparison age (days after enquiry)", { min: 1, max: 365 });
  if (i.minSample === null)
    out.push({ field: "minSample", message: "The smallest sample to rank is blank. It’s set by the owner: enter their number of mature enquiries." });
  else need(i.minSample, "minSample", "The smallest sample to rank", { min: 1, max: 1000 });
  const areaIds = new Set(i.areas.map((a) => a.id));
  i.areas.forEach((a, k) => {
    if (!a.name.trim()) out.push({ field: `area.${a.id}.name`, message: `Area ${k + 1} needs a name.` });
  });
  const effort = (e: Effort, field: string, label: string) => {
    for (const p of PART_ORDER) maybe(e[p], `${field}.${p}`, `${label}: ${RELATIONSHIP_PARTS[p].toLowerCase()} hours`);
    maybe(e.onboarding, `${field}.onboarding`, `${label}: case onboarding hours`);
    maybe(e.costs, `${field}.costs`, `${label}: direct costs`);
  };

  if (i.mode === "records") {
    if (!i.records.length) out.push({ field: "records", message: "Add at least one enquiry." });
    const seen = new Set<string>();
    i.records.forEach((r, k) => {
      const name = `Enquiry ${r.id || k + 1}`;
      const f = (x: string) => `record.${r.id}.${x}`;
      if (!r.id) out.push({ field: f("id"), message: `Enquiry ${k + 1} needs an opaque id.` });
      else if (seen.has(r.id))
        out.push({ field: f("id"), message: `${name} appears twice. One person counts once: merge the rows and keep the other contact as an assist.` });
      seen.add(r.id);
      if (!DATE.test(r.enquiredOn)) out.push({ field: f("enquiredOn"), message: `${name}: the enquiry date is blank.` });
      if (r.area && !areaIds.has(r.area)) out.push({ field: f("area"), message: `${name}: its area isn’t in the list.` });
      if (!r.contacts.length) out.push({ field: f("contacts"), message: `${name}: record at least one contact, even if its source is unknown.` });
      r.contacts.forEach((c, j) => {
        if (!DATE.test(c.on)) out.push({ field: f(`contact.${j}`), message: `${name}: contact ${j + 1} needs a date.` });
      });
      const after = (
        x: "introducedOn" | "pathwayOn" | "allocatedOn" | "agreedOn" | "startedOn" | "closedOn" | "exitedOn",
        label: string,
        from = r.enquiredOn,
      ) => {
        const v = r[x];
        if (!v) return;
        if (!DATE.test(v)) out.push({ field: f(x), message: `${name}: the ${label} date isn’t a date.` });
        else if (DATE.test(from) && v < from) out.push({ field: f(x), message: `${name}: the ${label} date is before it could have happened.` });
        else if (DATE.test(i.asOf) && v > i.asOf) out.push({ field: f(x), message: `${name}: the ${label} date is after the as-of date.` });
      };
      after("introducedOn", "introduction");
      after("pathwayOn", "pathway");
      after("allocatedOn", "allocation");
      after("agreedOn", "agreement");
      after("startedOn", "first service", r.agreedOn || r.enquiredOn);
      after("closedOn", "closed");
      after("exitedOn", "exit", r.startedOn || r.enquiredOn);
      if (r.startedOn && !r.agreedOn)
        out.push({
          field: f("agreedOn"),
          message: `${name}: a first service follows an agreement. Record the agreement date (an agreement isn’t a service, and a service needs one).`,
        });
      if (r.startedOn && r.closed) out.push({ field: f("closed"), message: `${name}: it can’t both start and close without starting.` });
      if (r.closed && !r.closedOn) out.push({ field: f("closedOn"), message: `${name}: when did it close?` });
      if (!r.closed && r.closedOn) out.push({ field: f("closed"), message: `${name}: give the broad reason it closed.` });
      if (r.exitedOn && !r.startedOn) out.push({ field: f("exitedOn"), message: `${name}: only someone who started can exit.` });
      if (r.exitedOn && !r.exitReason) out.push({ field: f("exitReason"), message: `${name}: give the broad exit reason.` });
    });
    const sources = new Set(i.effort.map((e) => `${e.source}:${e.month}`));
    if (sources.size !== i.effort.length) out.push({ field: "effort", message: "Two effort rows share a source and month. Combine them." });
    for (const e of i.effort) {
      if (!MONTH.test(e.month)) out.push({ field: `effort.${e.id}.month`, message: `Effort for ${SOURCES[e.source]}: choose the month.` });
      effort(e.effort, `effort.${e.id}`, `Effort for ${SOURCES[e.source]}, ${monthLabel(e.month)}`);
    }
    return out;
  }

  if (!i.rows.length) out.push({ field: "rows", message: "Add at least one cohort row." });
  const keys = new Set<string>();
  i.rows.forEach((r, k) => {
    const name = `${r.label || SOURCES[r.source]}, ${monthLabel(r.month)}${r.area ? `, ${areaName(i, r.area)}` : ""}`;
    const f = (x: string) => `row.${r.id}.${x}`;
    const key = `${r.source}:${r.month}:${r.area}:${r.label}`;
    if (keys.has(key))
      out.push({ field: f("source"), message: `${name}: another row has the same source, month, area and label. Combine them so nobody counts twice.` });
    keys.add(key);
    if (!MONTH.test(r.month)) out.push({ field: f("month"), message: `Row ${k + 1}: choose the month the enquiries arrived.` });
    else if (DATE.test(i.asOf) && `${r.month}-01` > i.asOf) out.push({ field: f("month"), message: `${name}: the month is after the as-of date.` });
    if (r.area && !areaIds.has(r.area)) out.push({ field: f("area"), message: `${name}: its area isn’t in the list.` });
    need(r.enquiries, f("enquiries"), `${name}: distinct enquiries`);
    const cap = r.enquiries ?? Infinity;
    for (const s of STAGE_ORDER) need(r.stages[s], f(`stages.${s}`), `${name}: ${STAGES[s].toLowerCase()} at first contact`);
    const stageSum = STAGE_ORDER.reduce((t, s) => t + (r.stages[s] ?? 0), 0);
    if (stageSum > cap)
      out.push({ field: f("stages.unknown"), message: `${name}: the stage counts add to ${stageSum}, more than the ${cap} distinct enquiries.` });
    for (const x of ["introduced", "pathway", "agreed", "started", "open", "closed"] as const) {
      need(
        r[x],
        f(x),
        `${name}: ${x === "introduced" ? "authorised introductions" : x === "pathway" ? "suitable pathway" : x === "agreed" ? "agreements" : x === "started" ? "first services" : x === "open" ? "still open" : "closed"}`,
      );
      if ((r[x] ?? 0) > cap) out.push({ field: f(x), message: `${name}: ${r[x]} is more than the ${cap} distinct enquiries.` });
    }
    if ((r.started ?? 0) > (r.agreed ?? Infinity))
      out.push({ field: f("started"), message: `${name}: more first services than agreements. A first service follows an agreement.` });
    const accounted = (r.started ?? 0) + (r.open ?? 0) + (r.closed ?? 0);
    if (accounted > cap)
      out.push({ field: f("open"), message: `${name}: started, open and closed add to ${accounted}, more than the ${cap} distinct enquiries.` });
    r.closedReasons.forEach((c, j) => need(c.count, f(`closedReasons.${j}`), `${name}: closed, ${CLOSE_REASONS[c.reason].toLowerCase()}`));
    const reasons = r.closedReasons.reduce((t, c) => t + (c.count ?? 0), 0);
    if (reasons > (r.closed ?? Infinity))
      out.push({ field: f("closedReasons.0"), message: `${name}: the closed reasons add to ${reasons}, more than ${r.closed} closed.` });
    for (const s of STAGE_ORDER) {
      maybe(r.startsByStage[s], f(`startsByStage.${s}`), `${name}: first services from ${STAGES[s].toLowerCase()}`);
      const v = known(r.startsByStage[s]);
      if (v !== null && v > (r.stages[s] ?? Infinity))
        out.push({
          field: f(`startsByStage.${s}`),
          message: `${name}: ${v} first services from ${STAGES[s].toLowerCase()}, but only ${r.stages[s]} arrived at that stage.`,
        });
    }
    const byStage = STAGE_ORDER.reduce((t, s) => t + (known(r.startsByStage[s]) ?? 0), 0);
    if (byStage > (r.started ?? Infinity))
      out.push({ field: f("startsByStage.unknown"), message: `${name}: first services by stage add to ${byStage}, more than ${r.started}.` });
    for (const b of BAND_ORDER) need(r.bands[b], f(`bands.${b}`), `${name}: started in ${BANDS[b].toLowerCase()}`);
    const banded = BAND_ORDER.reduce((t, b) => t + (r.bands[b] ?? 0), 0);
    if (banded > (r.started ?? Infinity))
      out.push({ field: f("bands.unknown"), message: `${name}: the timing bands add to ${banded}, more than ${r.started} first services.` });
    need(r.matureStarts, f("matureStarts"), `${name}: starts old enough for the observation point`);
    need(r.active, f("active"), `${name}: still active at the observation point`);
    if ((r.matureStarts ?? 0) > (r.started ?? Infinity))
      out.push({ field: f("matureStarts"), message: `${name}: ${r.matureStarts} mature starts, more than the ${r.started} total starts.` });
    if ((r.active ?? 0) > (r.matureStarts ?? Infinity))
      out.push({ field: f("active"), message: `${name}: ${r.active} still active, more than the ${r.matureStarts} starts old enough to count.` });
    r.exits.forEach((x, j) => need(x.count, f(`exits.${j}`), `${name}: exits, ${EXIT_REASONS[x.reason].toLowerCase()}`));
    const exits = r.exits.reduce((t, x) => t + (x.count ?? 0), 0);
    if (r.matureStarts !== null && r.active !== null && exits > r.matureStarts - r.active)
      out.push({ field: f("exits.0"), message: `${name}: ${exits} exits, but only ${r.matureStarts - r.active} mature starts weren’t active.` });
    effort(r.effort, f("effort"), name);
    maybe(r.duplicates, f("duplicates"), `${name}: possible duplicates`);
    if (r.extractedOn && !DATE.test(r.extractedOn)) out.push({ field: f("extractedOn"), message: `${name}: the extraction date isn’t a date.` });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------------------------

export type Filter = { sources?: Source[]; months?: string[]; stage?: Stage | ""; area?: string };

export type EffortResult = {
  /** Recorded relationship hours, by part. "unknown" where a cohort didn't record it. */
  parts: Record<RelationshipPart, number | "unknown">;
  /** Recorded relationship hours (known parts only), or null if none is recorded. */
  relationship: number | null;
  included: RelationshipPart[];
  missing: RelationshipPart[];
  onboarding: number | "unknown" | null;
  costs: number | "unknown" | null;
  perStart: Rate;
  onboardingPerStart: Rate;
  observed: boolean;
  note: string;
};

export type Timing = {
  /** Exact dates (the fictional rows): a median and range. Grouped bands: a distribution only. */
  exact: boolean;
  started: number;
  days: number[];
  median: number | null;
  min: number | null;
  max: number | null;
  bands: Record<Band, number>;
  /** For each start with exact dates: total days, and the part before and after a funding allocation. */
  segments: { id: string; total: number; before: number | "n/a" | "unknown"; after: number | "unknown" }[];
  /** Still-open enquiries and their ages: never silently dropped. */
  open: { id: string; age: number; wait: WaitReason | ""; stage: Stage }[];
  note: string;
};

export type SourceResult = {
  source: Source | "all";
  label: string;
  enquiries: number;
  /** Enquiries at least the comparison age old. */
  mature: number;
  immature: number;
  stages: Record<Stage, number>;
  unstaged: number;
  funnel: Record<FunnelStep, { count: number; rate: Rate }>;
  open: number;
  closed: number;
  closedReasons: { reason: CloseReason; count: number }[];
  unaccounted: number;
  startRate: Rate;
  agreementRate: Rate;
  introductionRate: Rate;
  /** Started within the comparison age, among enquiries at least that old (exact dates only). */
  startRateAtAge: Rate | null;
  stageMatched: Record<Stage, Rate>;
  /** First services among those who could choose a provider at first contact (allocated, considering a change, urgent). */
  readyMatched: Rate;
  waits: Record<WaitReason, number>;
  timing: Timing;
  effort: EffortResult;
  continuity: { days: number; starts: number; mature: number; active: number; rate: Rate; exits: { reason: ExitReason; count: number }[] };
  assists: number;
  quality: { methods: ("manual" | "verified")[]; extractedOn: string[]; duplicates: number | "unknown"; notes: string[] };
  tooEarly: boolean;
  caution: string[];
};

export type ReferralResult = {
  mode: ReferralInputs["mode"];
  asOf: string;
  timezone: string;
  months: string[];
  period: string;
  observationDays: number;
  matureAge: number;
  minSample: number;
  sources: SourceResult[];
  all: SourceResult;
  stageMixDiffers: boolean;
  warnings: string[];
};

type Acc = {
  enquiries: number;
  mature: number;
  stages: Record<Stage, number>;
  funnel: Record<FunnelStep, number>;
  open: number;
  closed: number;
  closedReasons: Record<CloseReason, number>;
  startsByStage: Record<Stage, number | "unknown">;
  atAge: { num: number; den: number } | null;
  bands: Record<Band, number>;
  days: number[] | null;
  segments: Timing["segments"];
  openAges: Timing["open"];
  waits: Record<WaitReason, number>;
  matureStarts: number;
  active: number;
  exits: Record<ExitReason, number>;
  effort: {
    parts: Record<RelationshipPart, number | "unknown">;
    onboarding: number | "unknown" | null;
    costs: number | "unknown" | null;
    observed: boolean;
    any: boolean;
  };
  assists: number;
  methods: Set<"manual" | "verified">;
  extracted: Set<string>;
  duplicates: number | "unknown";
};

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const emptyAcc = (exact: boolean): Acc => ({
  enquiries: 0,
  mature: 0,
  stages: zeros(STAGE_ORDER),
  funnel: zeros(FUNNEL),
  open: 0,
  closed: 0,
  closedReasons: zeros(CLOSE_ORDER),
  startsByStage: zeros(STAGE_ORDER),
  atAge: exact ? { num: 0, den: 0 } : null,
  bands: zeros(BAND_ORDER),
  days: exact ? [] : null,
  segments: [],
  openAges: [],
  waits: zeros(WAIT_ORDER),
  matureStarts: 0,
  active: 0,
  exits: zeros(EXIT_ORDER),
  effort: { parts: zeros(PART_ORDER), onboarding: null, costs: null, observed: true, any: false },
  assists: 0,
  methods: new Set(),
  extracted: new Set(),
  duplicates: 0,
});
/** Adds a figure that may be unknown: one unknown makes the total unknown (named), never a partial sum passed off as whole. */
const addAmount = (a: number | "unknown" | null, b: Amount): number | "unknown" | null =>
  b === "unknown" || a === "unknown" ? "unknown" : b === null ? a : (a ?? 0) + b;

function addEffort(acc: Acc, e: Effort) {
  acc.effort.any = true;
  for (const p of PART_ORDER) {
    const v = e[p];
    const cur = acc.effort.parts[p];
    // A part one cohort didn't record stays "unknown" for the total: it's named, never counted as zero.
    acc.effort.parts[p] = v === "unknown" || v === null || cur === "unknown" ? "unknown" : cur + v;
  }
  acc.effort.onboarding = addAmount(acc.effort.onboarding, e.onboarding);
  acc.effort.costs = addAmount(acc.effort.costs, e.costs);
  if (!e.observed) acc.effort.observed = false;
}

function finish(source: Source | "all", acc: Acc, extra: { minSample: number; matureAge: number; obs: number; splitNote: string }): SourceResult {
  const started = acc.funnel.started;
  const relationshipParts = PART_ORDER.filter((p) => acc.effort.parts[p] !== "unknown");
  const relationship = acc.effort.any && relationshipParts.length ? relationshipParts.reduce((t, p) => t + (acc.effort.parts[p] as number), 0) : null;
  const missing = acc.effort.any ? PART_ORDER.filter((p) => acc.effort.parts[p] === "unknown") : [...PART_ORDER];
  const onboarding = acc.effort.any ? acc.effort.onboarding : null;
  const effort: EffortResult = {
    parts: acc.effort.parts,
    relationship,
    included: acc.effort.any ? relationshipParts : [],
    missing,
    onboarding,
    costs: acc.effort.any ? acc.effort.costs : null,
    perStart: perStart(extra.splitNote ? null : relationship, started),
    onboardingPerStart: perStart(extra.splitNote || typeof onboarding !== "number" ? null : onboarding, started),
    observed: acc.effort.observed,
    note: extra.splitNote
      ? extra.splitNote
      : !acc.effort.any
        ? "No relationship effort recorded for this cohort."
        : missing.length
          ? `Includes ${relationshipParts.map((p) => RELATIONSHIP_PARTS[p].toLowerCase()).join(", ") || "nothing"}. Not recorded, so not included: ${missing.map((p) => RELATIONSHIP_PARTS[p].toLowerCase()).join(", ")}.`
          : `Includes ${PART_ORDER.map((p) => RELATIONSHIP_PARTS[p].toLowerCase()).join(", ")}. Case onboarding is shown separately.`,
  };
  const days = acc.days ?? [];
  const exact = acc.days !== null;
  const unbanded = exact ? 0 : Math.max(0, started - BAND_ORDER.reduce((t, b) => t + acc.bands[b], 0));
  const bands = { ...acc.bands, unknown: acc.bands.unknown + unbanded };
  const timing: Timing = {
    exact,
    started,
    days: [...days].sort((a, b) => a - b),
    median: exact ? median(days) : null,
    min: exact && days.length ? Math.min(...days) : null,
    max: exact && days.length ? Math.max(...days) : null,
    bands,
    segments: acc.segments,
    open: [...acc.openAges].sort((a, b) => b.age - a.age),
    note: exact
      ? days.length
        ? `Among the ${days.length} who started. ${acc.open} still open, shown with their ages.`
        : "Nobody in this cohort has started yet."
      : "Grouped bands from manual cohorts: a distribution, with no exact median.",
  };
  const stageMatched = Object.fromEntries(
    STAGE_ORDER.map((s) => {
      const n = acc.startsByStage[s];
      return [s, n === "unknown" ? { num: 0, den: acc.stages[s], value: null, text: `${INSUFFICIENT} (not recorded by stage)` } : rate(n, acc.stages[s])];
    }),
  ) as Record<Stage, Rate>;
  const readyStarts = READY.map((st) => acc.startsByStage[st]);
  const readyDen = READY.reduce((t, st) => t + acc.stages[st], 0);
  const readyMatched = readyStarts.includes("unknown")
    ? { num: 0, den: readyDen, value: null, text: `${INSUFFICIENT} (not recorded by stage)` }
    : rate(
        (readyStarts as number[]).reduce((t, n) => t + n, 0),
        readyDen,
      );
  const exitsTotal = EXIT_ORDER.reduce((t, x) => t + acc.exits[x], 0);
  const notActive = acc.matureStarts - acc.active;
  const exits = EXIT_ORDER.filter((x) => acc.exits[x] > 0).map((x) => ({ reason: x, count: acc.exits[x] }));
  if (notActive > exitsTotal) exits.push({ reason: "unknown", count: notActive - exitsTotal });
  const tooEarly = acc.mature < extra.minSample;
  const caution: string[] = [];
  if (source !== "all" && !acc.enquiries && acc.assists)
    caution.push(
      `Assists only: mentioned in ${acc.assists} ${acc.assists === 1 ? "enquiry" : "enquiries"} attributed to another source. Not a second enquiry, and not a conversion.`,
    );
  else if (source !== "all" && tooEarly)
    caution.push(
      `Too early to rank: ${acc.mature} mature ${acc.mature === 1 ? "enquiry" : "enquiries"}, fewer than ${extra.minSample}. It can still show the stages people arrive at, where they wait and what each handoff needed.`,
    );
  const immature = acc.enquiries - acc.mature;
  if (immature > 0)
    caution.push(
      `${immature} ${immature === 1 ? "enquiry is" : "enquiries are"} under ${extra.matureAge} days old: open, not yet mature. The current rate isn’t a final conversion.`,
    );
  // Only those still open: someone who started after a funding wait isn't waiting any more.
  const waitingFunding = acc.openAges.filter((o) => o.wait === "funding").length;
  if (waitingFunding > 0) caution.push(`${waitingFunding} waiting for a funding allocation: open, not lost, and not the referrer’s doing.`);
  const unstaged = Math.max(0, acc.enquiries - STAGE_ORDER.reduce((t, s) => t + acc.stages[s], 0));
  const closedKnown = CLOSE_ORDER.reduce((t, c) => t + acc.closedReasons[c], 0);
  const closedReasons = CLOSE_ORDER.filter((c) => acc.closedReasons[c] > 0).map((c) => ({ reason: c, count: acc.closedReasons[c] }));
  if (acc.closed > closedKnown) closedReasons.push({ reason: "unknown", count: acc.closed - closedKnown });
  const unaccounted = Math.max(0, acc.enquiries - started - acc.open - acc.closed);
  const notes: string[] = [];
  if (unstaged) notes.push(`${unstaged} with no stage recorded: shown as unknown.`);
  if (unaccounted) notes.push(`${unaccounted} not recorded as started, open or closed.`);
  if (acc.duplicates === "unknown") notes.push("Possible duplicates not checked.");
  else if (acc.duplicates > 0) notes.push(`${acc.duplicates} possible ${acc.duplicates === 1 ? "duplicate" : "duplicates"} flagged.`);
  if (source === "unknown") notes.push("Unknown or multiple is a valid source: no single introduction can be attributed.");
  return {
    source,
    label: source === "all" ? "All sources" : SOURCES[source],
    enquiries: acc.enquiries,
    mature: acc.mature,
    immature,
    stages: { ...acc.stages, unknown: acc.stages.unknown + unstaged },
    unstaged,
    funnel: Object.fromEntries(FUNNEL.map((k) => [k, { count: acc.funnel[k], rate: rate(acc.funnel[k], acc.enquiries) }])) as SourceResult["funnel"],
    open: acc.open,
    closed: acc.closed,
    closedReasons,
    unaccounted,
    startRate: rate(started, acc.enquiries),
    agreementRate: rate(acc.funnel.agreed, acc.enquiries),
    introductionRate: rate(acc.funnel.introduced, acc.enquiries),
    startRateAtAge: acc.atAge ? rate(acc.atAge.num, acc.atAge.den) : null,
    stageMatched,
    readyMatched,
    waits: acc.waits,
    timing,
    effort,
    continuity: { days: extra.obs, starts: started, mature: acc.matureStarts, active: acc.active, rate: rate(acc.active, acc.matureStarts), exits },
    assists: acc.assists,
    quality: { methods: [...acc.methods].sort(), extractedOn: [...acc.extracted].sort(), duplicates: acc.duplicates, notes },
    tooEarly: source !== "all" && tooEarly,
    caution,
  };
}

/** The cohort months present in the inputs, oldest first. */
export function cohortMonths(i: ReferralInputs): string[] {
  const m = i.mode === "records" ? i.records.map((r) => monthOf(r.enquiredOn)) : i.rows.map((r) => r.month);
  return [...new Set(m.filter((x) => MONTH.test(x)))].sort();
}

/** Calculates the comparison. Call only with inputs that pass validateInputs. */
export function calculate(i: ReferralInputs, f: Filter = {}): ReferralResult {
  const obs = i.observationDays ?? 90;
  const matureAge = i.matureAge ?? 90;
  const minSample = i.minSample ?? 1;
  const months = f.months?.length ? [...f.months].sort() : cohortMonths(i);
  const inMonths = (m: string) => months.includes(m);
  const sourceOk = (s: Source) => !f.sources?.length || f.sources.includes(s);
  const areaOk = (a: string) => !f.area || a === f.area;
  const warnings: string[] = [];
  const accs = new Map<Source, Acc>();
  const all = emptyAcc(i.mode === "records");
  const accFor = (s: Source) => {
    if (!accs.has(s)) accs.set(s, emptyAcc(i.mode === "records"));
    return accs.get(s)!;
  };
  let splitNote = "";

  if (i.mode === "records") {
    for (const r of i.records) {
      if (!inMonths(monthOf(r.enquiredOn)) || !areaOk(r.area)) continue;
      if (f.stage && r.initialStage !== f.stage) continue;
      const at = attribute(r);
      // Assists are counted for each other source mentioned, whatever its own filter.
      for (const s of new Set(at.assists)) if (s !== at.source && sourceOk(s)) accFor(s).assists += 1;
      if (!sourceOk(at.source)) continue;
      for (const a of [accFor(at.source), all]) {
        const age = daysBetween(r.enquiredOn, i.asOf);
        a.enquiries += 1;
        const mature = age >= matureAge;
        if (mature) a.mature += 1;
        a.stages[r.initialStage] += 1;
        if (r.introducedOn) a.funnel.introduced += 1;
        if (r.pathwayOn) a.funnel.pathway += 1;
        if (r.agreedOn) a.funnel.agreed += 1;
        if (r.startedOn) {
          a.funnel.started += 1;
          (a.startsByStage[r.initialStage] as number) += 1;
          const d = daysBetween(r.enquiredOn, r.startedOn);
          a.days!.push(d);
          a.bands[bandOf(d)] += 1;
          const waited = r.initialStage === "assessment" || r.initialStage === "waiting" || r.initialStage === "unknown";
          a.segments.push({
            id: r.id,
            total: d,
            before: !waited ? "n/a" : r.allocatedOn ? daysBetween(r.enquiredOn, r.allocatedOn) : "unknown",
            after: !waited ? d : r.allocatedOn ? daysBetween(r.allocatedOn, r.startedOn) : "unknown",
          });
          if (r.wait) a.waits[r.wait] += 1;
          if (mature && d <= matureAge) a.atAge!.num += 1;
          if (daysBetween(r.startedOn, i.asOf) >= obs) {
            a.matureStarts += 1;
            const point = addDays(r.startedOn, obs);
            if (r.exitedOn && r.exitedOn < point) a.exits[r.exitReason || "unknown"] += 1;
            else a.active += 1;
          }
        } else if (r.closed) {
          a.closed += 1;
          a.closedReasons[r.closed] += 1;
        } else {
          a.open += 1;
          a.openAges.push({ id: r.id, age, wait: r.wait, stage: r.initialStage });
          if (r.wait) a.waits[r.wait] += 1;
        }
        if (mature) a.atAge!.den += 1;
        a.methods.add("verified");
      }
    }
    // Effort is recorded by source and month, not by person: it can't be split by stage or area.
    if (f.stage || f.area)
      splitNote = `Relationship effort is recorded by source and month, not by ${f.stage ? "stage" : "area"}: clear that filter to see it.`;
    for (const e of i.effort) {
      if (!inMonths(e.month) || !sourceOk(e.source)) continue;
      addEffort(accFor(e.source), e.effort);
      addEffort(all, e.effort);
    }
  } else {
    if (f.stage) warnings.push("Manual cohorts record first services by stage only: the stage-matched rates show each stage; the funnel isn’t split by stage.");
    for (const r of i.rows) {
      if (!inMonths(r.month) || !areaOk(r.area) || !sourceOk(r.source)) continue;
      const age = daysBetween(monthEnd(r.month), i.asOf);
      for (const a of [accFor(r.source), all]) {
        const n = r.enquiries ?? 0;
        a.enquiries += n;
        // A month's cohort is mature once its last day is at least the comparison age old.
        if (age >= matureAge) a.mature += n;
        for (const s of STAGE_ORDER) {
          a.stages[s] += r.stages[s] ?? 0;
          const v = r.startsByStage[s];
          const cur = a.startsByStage[s];
          a.startsByStage[s] = v === "unknown" || v === null || cur === "unknown" ? "unknown" : cur + v;
        }
        a.funnel.introduced += r.introduced ?? 0;
        a.funnel.pathway += r.pathway ?? 0;
        a.funnel.agreed += r.agreed ?? 0;
        a.funnel.started += r.started ?? 0;
        a.open += r.open ?? 0;
        a.closed += r.closed ?? 0;
        for (const c of r.closedReasons) a.closedReasons[c.reason] += c.count ?? 0;
        for (const b of BAND_ORDER) a.bands[b] += r.bands[b] ?? 0;
        a.matureStarts += r.matureStarts ?? 0;
        a.active += r.active ?? 0;
        for (const x of r.exits) a.exits[x.reason] += x.count ?? 0;
        addEffort(a, r.effort);
        a.methods.add(r.method);
        if (r.extractedOn) a.extracted.add(r.extractedOn);
        const d = r.duplicates;
        a.duplicates = d === "unknown" || d === null || a.duplicates === "unknown" ? "unknown" : a.duplicates + d;
      }
    }
  }

  const extra = { minSample, matureAge, obs, splitNote };
  const sources = SOURCE_ORDER.filter((s) => accs.has(s) && (accs.get(s)!.enquiries > 0 || accs.get(s)!.assists > 0 || accs.get(s)!.effort.any)).map((s) =>
    finish(s, accs.get(s)!, extra),
  );
  // Different starting stages make overall rates unlike: say so, and point to the stage-matched rates.
  const share = (x: SourceResult) => (x.enquiries ? READY.reduce((t, s) => t + x.stages[s], 0) / x.enquiries : null);
  const shares = sources.filter((x) => x.source !== "unknown" && x.enquiries > 0).map(share) as number[];
  const stageMixDiffers = shares.length > 1 && Math.max(...shares) - Math.min(...shares) >= 0.3;
  if (stageMixDiffers)
    warnings.push(
      "The sources’ starting stages differ: some people arrive before a funding allocation, others ready to choose. Compare stage-matched rates, not overall rates.",
    );
  if (sources.some((x) => x.tooEarly))
    warnings.push("Some sources are too early to rank: their samples are small. Read what they show, not where they’d sit in a list.");
  return {
    mode: i.mode,
    asOf: i.asOf,
    timezone: i.timezone,
    months,
    period: periodLabel(months),
    observationDays: obs,
    matureAge,
    minSample,
    sources,
    all: finish("all", all, extra),
    stageMixDiffers,
    warnings,
  };
}

/** Two sources can be compared (not ranked) only when both have enough mature enquiries. */
export const comparable = (a: SourceResult, b: SourceResult) => !a.tooEarly && !b.tooEarly;

/**
  The calendar-month view a busy principal might reach for: starts this month against enquiries this month. It
  isn't a cohort rate, so it never gives one: it says how many of the month's starts came from earlier cohorts.
*/
export function calendarMonth(i: ReferralInputs, month: string) {
  const enquiries = i.records.filter((r) => monthOf(r.enquiredOn) === month).length;
  const starts = i.records.filter((r) => r.startedOn && monthOf(r.startedOn) === month);
  const sameCohort = starts.filter((r) => monthOf(r.enquiredOn) === month).length;
  return {
    month,
    enquiries,
    starts: starts.length,
    sameCohort,
    earlierCohorts: starts.length - sameCohort,
    rate: null,
    note: `${starts.length} first services in ${monthLabel(month)}, ${starts.length - sameCohort} from earlier enquiries: not a conversion rate for ${monthLabel(month)}’s ${enquiries} enquiries.`,
  };
}

// ---------------------------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------------------------

/** What changed in the inputs, in words. */
export function inputChanges(a: ReferralInputs, b: ReferralInputs): string[] {
  const out: string[] = [];
  if (a.asOf !== b.asOf) out.push(`As of ${dateLabel(a.asOf)} → ${dateLabel(b.asOf)}.`);
  if (a.observationDays !== b.observationDays) out.push(`Observation point ${a.observationDays ?? "blank"} → ${b.observationDays ?? "blank"} days.`);
  if (a.matureAge !== b.matureAge) out.push(`Comparison age ${a.matureAge ?? "blank"} → ${b.matureAge ?? "blank"} days.`);
  if (a.minSample !== b.minSample) out.push(`Smallest sample to rank ${a.minSample ?? "blank"} → ${b.minSample ?? "blank"}.`);
  if (b.mode === "records") {
    const added = b.records.filter((r) => !a.records.some((x) => x.id === r.id));
    if (added.length)
      out.push(`${added.length} new ${added.length === 1 ? "enquiry" : "enquiries"} (${periodLabel([...new Set(added.map((r) => monthOf(r.enquiredOn)))])}).`);
    for (const r of b.records) {
      const p = a.records.find((x) => x.id === r.id);
      if (!p) continue;
      if (r.allocatedOn && !p.allocatedOn) out.push(`${r.id}: a funding allocation arrived (${dateLabel(r.allocatedOn)}).`);
      if (r.agreedOn && !p.agreedOn) out.push(`${r.id}: agreed (${dateLabel(r.agreedOn)}).`);
      if (r.startedOn && !p.startedOn)
        out.push(`${r.id}: first service (${dateLabel(r.startedOn)}), counted in its ${monthLabel(monthOf(r.enquiredOn))} cohort.`);
      if (r.closed && !p.closed) out.push(`${r.id}: closed, ${CLOSE_REASONS[r.closed].toLowerCase()}.`);
      if (r.exitedOn && !p.exitedOn) out.push(`${r.id}: exited, ${EXIT_REASONS[r.exitReason || "unknown"].toLowerCase()}.`);
      if (r.laterStage !== p.laterStage && r.laterStage)
        out.push(`${r.id}: now ${STAGES[r.laterStage].toLowerCase()} (the stage at first contact stays ${STAGES[r.initialStage].toLowerCase()}).`);
    }
    return out;
  }
  for (const r of b.rows) {
    const p = a.rows.find((x) => x.id === r.id);
    const name = `${r.label || SOURCES[r.source]}, ${monthLabel(r.month)}`;
    if (!p) {
      out.push(`Added ${name}.`);
      continue;
    }
    for (const [k, label] of [
      ["enquiries", "enquiries"],
      ["introduced", "authorised introductions"],
      ["agreed", "agreements"],
      ["started", "first services"],
      ["open", "still open"],
      ["closed", "closed"],
      ["matureStarts", "mature starts"],
      ["active", "still active"],
    ] as const)
      if (p[k] !== r[k]) out.push(`${name}: ${label} ${p[k] ?? "blank"} → ${r[k] ?? "blank"}.`);
  }
  for (const p of a.rows) if (!b.rows.some((x) => x.id === p.id)) out.push(`Removed ${p.label || SOURCES[p.source]}, ${monthLabel(p.month)}.`);
  return out;
}

/** What changed in the result, by source. */
export function resultChanges(a: ReferralResult, b: ReferralResult): string[] {
  const out: string[] = [];
  for (const sb of b.sources) {
    const sa = a.sources.find((x) => x.source === sb.source);
    if (!sa) {
      out.push(`${sb.label}: new in this comparison.`);
      continue;
    }
    if (sa.enquiries !== sb.enquiries) out.push(`${sb.label}: enquiries ${sa.enquiries} → ${sb.enquiries}.`);
    if (sa.startRate.text !== sb.startRate.text) out.push(`${sb.label}: first services ${sa.startRate.text} → ${sb.startRate.text}.`);
    if (sa.effort.perStart.text !== sb.effort.perStart.text)
      out.push(`${sb.label}: relationship effort ${sa.effort.perStart.text} → ${sb.effort.perStart.text}.`);
    if (sa.continuity.rate.text !== sb.continuity.rate.text)
      out.push(`${sb.label}: active at ${sb.continuity.days} days ${sa.continuity.rate.text} → ${sb.continuity.rate.text}.`);
    if (sa.tooEarly !== sb.tooEarly) out.push(`${sb.label}: ${sb.tooEarly ? "now too early to rank" : "now enough mature enquiries to compare"}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Starting points and stored JSON
// ---------------------------------------------------------------------------------------------

const blankStages = (): Record<Stage, Num> => Object.fromEntries(STAGE_ORDER.map((s) => [s, null])) as Record<Stage, Num>;
export const blankEffort = (): Effort => ({
  meetings: null,
  travel: null,
  materials: null,
  followUp: null,
  onboarding: null,
  costs: "unknown",
  observed: false,
});

export const blankRow = (id: string, month: string): CohortRow => ({
  id,
  source: "gp",
  month,
  area: "",
  label: "",
  enquiries: null,
  stages: blankStages(),
  introduced: null,
  pathway: null,
  agreed: null,
  started: null,
  open: null,
  closed: null,
  closedReasons: [],
  startsByStage: Object.fromEntries(STAGE_ORDER.map((s) => [s, "unknown"])) as Record<Stage, Amount>,
  bands: Object.fromEntries(BAND_ORDER.map((b) => [b, null])) as Record<Band, Num>,
  matureStarts: null,
  active: null,
  exits: [],
  effort: blankEffort(),
  method: "manual",
  extractedOn: "",
  duplicates: "unknown",
});

/** A blank entry for "Review my relationships": one cohort row, nothing filled in. Never the story's figures. */
export function blankInputs(asOf: string): ReferralInputs {
  return {
    mode: "aggregate",
    asOf,
    timezone: "Australia/Brisbane",
    observationDays: 90,
    matureAge: 90,
    minSample: null,
    areas: [],
    records: [],
    effort: [],
    rows: [blankRow("row-1", asOf.slice(0, 7))],
  };
}

/** Sets this row's blank counts to zero: only when the owner asks, never on its own. */
export function zeroBlanks(r: CohortRow): CohortRow {
  const z = (v: Num) => v ?? 0;
  return {
    ...r,
    enquiries: z(r.enquiries),
    stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, z(r.stages[s])])) as Record<Stage, Num>,
    introduced: z(r.introduced),
    pathway: z(r.pathway),
    agreed: z(r.agreed),
    started: z(r.started),
    open: z(r.open),
    closed: z(r.closed),
    bands: Object.fromEntries(BAND_ORDER.map((b) => [b, z(r.bands[b])])) as Record<Band, Num>,
    matureStarts: z(r.matureStarts),
    active: z(r.active),
    closedReasons: r.closedReasons.map((c) => ({ ...c, count: z(c.count) })),
    exits: r.exits.map((x) => ({ ...x, count: z(x.count) })),
    effort: { ...r.effort, ...Object.fromEntries(PART_ORDER.map((p) => [p, r.effort[p] ?? 0])), onboarding: r.effort.onboarding ?? 0 },
  };
}

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw => (x && typeof x === "object" && !Array.isArray(x) ? (x as Raw) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max = 200) => (typeof x === "string" ? x.slice(0, max) : "");
const num = (x: unknown): Num => (typeof x === "number" && Number.isFinite(x) ? x : null);
const amount = (x: unknown): Amount => (x === "unknown" ? "unknown" : num(x));
const oneOf = <T extends string>(x: unknown, all: readonly T[], d: T): T => (all.includes(x as T) ? (x as T) : d);
const ID = /^[A-Za-z0-9-]{1,40}$/;
const id = (x: unknown, d: string) => (typeof x === "string" && ID.test(x) ? x : d);
const date = (x: unknown) => (typeof x === "string" && DATE.test(x) ? x : "");
const month = (x: unknown) => (typeof x === "string" && MONTH.test(x) ? x : "");

function cleanEffort(x: unknown): Effort {
  const e = obj(x);
  return {
    meetings: amount(e.meetings),
    travel: amount(e.travel),
    materials: amount(e.materials),
    followUp: amount(e.followUp),
    onboarding: amount(e.onboarding),
    costs: amount(e.costs),
    observed: e.observed === true,
  };
}

export function cleanInputs(x: unknown): ReferralInputs {
  const o = obj(x);
  const obsDays = num(o.observationDays);
  return {
    mode: oneOf(o.mode, ["records", "aggregate"] as const, "aggregate"),
    asOf: date(o.asOf),
    timezone: str(o.timezone, 60) || "Australia/Brisbane",
    observationDays: obsDays,
    matureAge: num(o.matureAge),
    minSample: num(o.minSample),
    areas: arr(o.areas)
      .slice(0, 12)
      .map((y, k) => {
        const a = obj(y);
        return { id: id(a.id, `area-${k + 1}`), name: str(a.name, 60), ...(str(a.note, 300) ? { note: str(a.note, 300) } : {}) };
      }),
    records: arr(o.records)
      .slice(0, 200)
      .map((y, k) => {
        const r = obj(y);
        return {
          id: id(r.id, `R-${k + 1}`),
          area: str(r.area, 40),
          enquiredOn: date(r.enquiredOn),
          contacts: arr(r.contacts)
            .slice(0, 6)
            .map((z) => {
              const c = obj(z);
              return { source: oneOf(c.source, SOURCE_ORDER, "unknown"), on: date(c.on), authorised: c.authorised === true };
            }),
          attribution: oneOf(r.attribution, ["", ...SOURCE_ORDER] as const, ""),
          initialStage: oneOf(r.initialStage, STAGE_ORDER, "unknown"),
          laterStage: oneOf(r.laterStage, ["", ...STAGE_ORDER] as const, ""),
          introducedOn: date(r.introducedOn),
          pathwayOn: date(r.pathwayOn),
          allocatedOn: date(r.allocatedOn),
          agreedOn: date(r.agreedOn),
          startedOn: date(r.startedOn),
          closed: oneOf(r.closed, ["", ...CLOSE_ORDER] as const, ""),
          closedOn: date(r.closedOn),
          wait: oneOf(r.wait, ["", ...WAIT_ORDER] as const, ""),
          exitedOn: date(r.exitedOn),
          exitReason: oneOf(r.exitReason, ["", ...EXIT_ORDER] as const, ""),
          ...(str(r.note, 400) ? { note: str(r.note, 400) } : {}),
        };
      }),
    effort: arr(o.effort)
      .slice(0, 120)
      .map((y, k) => {
        const e = obj(y);
        return { id: id(e.id, `effort-${k + 1}`), source: oneOf(e.source, SOURCE_ORDER, "unknown"), month: month(e.month), effort: cleanEffort(e.effort) };
      }),
    rows: arr(o.rows)
      .slice(0, 120)
      .map((y, k) => {
        const r = obj(y);
        const st = obj(r.stages);
        const sb = obj(r.startsByStage);
        const bd = obj(r.bands);
        return {
          id: id(r.id, `row-${k + 1}`),
          source: oneOf(r.source, SOURCE_ORDER, "unknown"),
          month: month(r.month),
          area: str(r.area, 40),
          label: str(r.label, 60),
          enquiries: num(r.enquiries),
          stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, num(st[s])])) as Record<Stage, Num>,
          introduced: num(r.introduced),
          pathway: num(r.pathway),
          agreed: num(r.agreed),
          started: num(r.started),
          open: num(r.open),
          closed: num(r.closed),
          closedReasons: arr(r.closedReasons)
            .slice(0, CLOSE_ORDER.length)
            .map((z) => obj(z))
            .map((c) => ({ reason: oneOf(c.reason, CLOSE_ORDER, "unknown"), count: num(c.count) })),
          startsByStage: Object.fromEntries(STAGE_ORDER.map((s) => [s, sb[s] === undefined ? "unknown" : amount(sb[s])])) as Record<Stage, Amount>,
          bands: Object.fromEntries(BAND_ORDER.map((b) => [b, num(bd[b])])) as Record<Band, Num>,
          matureStarts: num(r.matureStarts),
          active: num(r.active),
          exits: arr(r.exits)
            .slice(0, EXIT_ORDER.length)
            .map((z) => obj(z))
            .map((x) => ({ reason: oneOf(x.reason, EXIT_ORDER, "unknown"), count: num(x.count) })),
          effort: cleanEffort(r.effort),
          method: oneOf(r.method, ["manual", "verified"] as const, "manual"),
          extractedOn: date(r.extractedOn),
          duplicates: r.duplicates === undefined ? "unknown" : amount(r.duplicates),
        };
      }),
  };
}

/** The headline a saved review keeps: totals only, never a source label, a name or a note. */
export const snapshotOf = (r: ReferralResult) => ({
  sources: r.sources.length,
  enquiries: r.all.enquiries,
  starts: r.all.funnel.started.count,
  open: r.all.open,
  tooEarly: r.sources.filter((s) => s.tooEarly).length,
});
