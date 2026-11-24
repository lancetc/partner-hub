/*
  The Workload Lens ("Where does a coordinator’s week go?", docs/workload-lens.md): a deterministic time model for a
  Care Partner business's coordination work. It keeps two things apart:

  - the observed weeks (what actually filled them): working capacity, unique task hours, unrecorded time, and the
    reviewed causes of rework laid over the top; and
  - the forward plan (what the coming week needs): recurring work, onboarding, known exceptional work, team and
    operational duties and a contingency reserve, against working capacity.

  Everything here is pure, shared by the story (fictional figures) and "Map my team’s week" (a partner's own
  aggregate figures), the learner's page, the server and the editor. No AI calculates or classifies anything.

  Rules it keeps:
  - Every task has one primary category, so its time is counted once. Cause tags are an overlay: a 40-minute family
    call about a missed service is 40 minutes of conversation, and the same 40 minutes shows in the missed-service
    overlay. The overlay is never added to the total.
  - Duties (training, internal meetings) appear once: in observed task hours when observed, in planned demand when
    planned. They're never also taken off capacity.
  - Negative unrecorded time means overlapping entries or an overrun, not a slow worker. Positive unrecorded time is
    time nobody wrote down, not idle time.
  - Blank, "not measured" and zero are three different things. A blank is an error to fix; "not measured" is kept
    out of the hours and counted as a data-quality gap; zero is zero.
  - A change only reduces the affected, reviewed tasks it names, by the learner's own conservative estimate, capped
    at what was observed. It's a modelled figure, never a realised saving.
  - One week is an illustration; two or three are a few; four or more are a sample. A range is reported beside any
    average, and the model never gives a permanent staffing verdict.
*/

export const MODEL_VERSION = "workload-lens-1";
export const TAXONOMY_VERSION = "workload-taxonomy-1";

/** The primary work categories. Each task has exactly one: it partitions the week's time once. */
export const CATEGORIES = {
  onboarding: "New-client onboarding",
  review: "Planned review and care planning",
  conversation: "Participant or family conversation",
  change: "Service change and scheduling",
  supplier: "Supplier coordination",
  escalation: "Incident or clinical escalation",
  documentation: "Documentation and handoff",
  team: "Team management and training",
  other: "Other work",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];
/** What each category means, so a tag means the same thing in every article and every business. */
export const CATEGORY_HINTS: Record<Category, string> = {
  onboarding: "Welcoming a new client: first visits, agreements, setting up services and the first weeks’ follow-up.",
  review: "Scheduled care reviews, care plan updates and the preparation they need.",
  conversation: "Calls, visits and messages with a participant, family member or supporter, whatever prompted them.",
  change: "Changing, adding, pausing or rescheduling services, including rostering around a change in need.",
  supplier: "Arranging, confirming and following up suppliers and workers, including invoices with them.",
  escalation: "Responding to an incident, a clinical concern, a hospital admission or discharge, through the escalation process.",
  documentation: "Notes, records, handoffs to colleagues or Trilogy Care, and the admin that goes with them.",
  team: "Training, team meetings, supervision and the business’s own operational duties.",
  other: "Anything that doesn’t fit above. If a lot lands here, the taxonomy may need a reviewed new category.",
};

export const PLANNED = {
  planned: "Planned",
  unplanned: "Unplanned",
  recurring: "Known recurring",
} as const;
export type PlannedState = keyof typeof PLANNED;

/** Why a task happened. Descriptive: more than one may apply, but the time still counts once. */
export const CAUSES = {
  needChanged: "Client need changed",
  missedService: "Missed service",
  invoiceCorrection: "Invoice or data correction",
  unclearHandoff: "Unclear handoff",
  systemFriction: "System friction",
  supplierAvailability: "Supplier availability",
  policyQuestion: "Policy question",
  noRework: "No rework cause",
  unknown: "Unknown",
} as const;
export type Cause = keyof typeof CAUSES;
export const CAUSE_ORDER = Object.keys(CAUSES) as Cause[];

/** Set by a person who reviewed the task: never by the model. An empathetic conversation is never waste by default. */
export const REWORK = {
  avoidable: "Reviewed avoidable rework",
  necessary: "Necessary follow-up",
  uncertain: "Uncertain",
} as const;
export type ReworkStatus = keyof typeof REWORK;

/** Whose duty it is: a planning label, not a legal determination. */
export const OWNERS = {
  partner: "Partner business",
  trilogy: "Trilogy Care",
  supplier: "Supplier",
  shared: "Shared",
  confirm: "To confirm",
} as const;
export type Owner = keyof typeof OWNERS;

export const WEEK_KINDS = {
  ordinary: "An ordinary week",
  quiet: "Unusually quiet",
  pressured: "Unusually pressured",
  unknown: "Not sure",
} as const;
export type WeekKind = keyof typeof WEEK_KINDS;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

/** A number field that may be blank. null is blank: never read as zero. */
export type Num = number | null;
/** A duration: minutes, blank (null: not entered yet, an error), or "unknown" (deliberately not measured). */
export type Duration = number | null | "unknown";

export type Task = {
  id: string;
  /** Anonymous and short: "Family call after a missed visit". Never a participant's or worker's name. */
  label: string;
  category: Category;
  planned: PlannedState;
  causes: Cause[];
  rework: ReworkStatus;
  owner: Owner;
  /** 0 Monday … 4 Friday; null: across the week (an aggregate row). */
  day: number | null;
  /** How many times (an aggregate row: 12 supplier calls). Blank is an error; one task is 1. */
  count: Num;
  /** Minutes each. */
  minutes: Duration;
  /** A short line of story for the chart's detail (fictional case only). */
  detail?: string;
  /** Whether it had to happen promptly (an escalation, a safety follow-up) or could be rescheduled. */
  prompt?: boolean;
};

export type ObservedWeek = {
  id: string;
  label: string;
  kind: WeekKind;
  /** The team's rostered working hours that week. */
  rostered: Num;
  leave: Num;
  /** Other genuine unavailability (a medical appointment, a power outage): not duties, which are tasks. */
  unavailable: Num;
  /** Partner-owned tasks overdue or displaced at the end of the week. */
  overdue: Num;
  tasks: Task[];
};

export type ForwardPlan = {
  rostered: Num;
  leave: Num;
  unavailable: Num;
  /** Recurring client work a week (reviews, check-ins, scheduling, supplier follow-up). */
  recurring: Num;
  starts: Num;
  hoursPerStart: Num;
  /** Known exceptional commitments (a hospital discharge, an audit). */
  exceptional: Num;
  /** Planned team and operational duties: training, meetings, the business's own admin. */
  duties: Num;
  /** Time kept back for urgent changes and unplanned needs. */
  reserve: Num;
};

export const INTERVENTION_KINDS = {
  process: "Fix a named source of repeat work",
  jobaid: "Use an approved Job Aid or template",
  reassign: "Move a duty to the right owner, by agreement",
  cover: "Add temporary coordinator capacity",
  supplier: "Change a supplier arrangement",
  hiring: "Explore recruitment in Hiring Runway",
} as const;
export type InterventionKind = keyof typeof INTERVENTION_KINDS;

export type Intervention = {
  id: string;
  label: string;
  kind: InterventionKind;
  /** The tasks it can touch: a cause (for rework), a category, or both. */
  cause?: Cause;
  category?: Category;
  /** The conservative estimate: how many occurrences a week it would change, and minutes each. */
  occurrences: Num;
  minutesEach: Num;
  /** Temporary cover: hours added a week. */
  coverHours?: Num;
  owner: string;
  /** What would show the estimate was right. */
  evidence: string;
  /** Whether it's in the plan now. */
  active: boolean;
};

export type Guardrail = { id: string; label: string; value: Num; unit: string };

export type WorkloadInputs = {
  weeks: ObservedWeek[];
  plan: ForwardPlan;
  interventions: Intervention[];
  /** Quality guardrails that stay beside the hours: overdue reviews, late callbacks, escalations waiting. */
  guardrails: Guardrail[];
};

// ---------------------------------------------------------------------------------------------
// Validation: blank is not zero
// ---------------------------------------------------------------------------------------------

export type InputError = { field: string; message: string };

export function validateInputs(i: WorkloadInputs): InputError[] {
  const out: InputError[] = [];
  const need = (v: Num | undefined, field: string, label: string, { min = 0, max = 1000 } = {}) => {
    if (v === null || v === undefined || Number.isNaN(v)) out.push({ field, message: `${label} is blank. Enter a number (0 if there’s none).` });
    else if (v < min || v > max) out.push({ field, message: `${label} must be between ${min} and ${max}.` });
  };
  if (!i.weeks.length) out.push({ field: "weeks", message: "Add at least one observed week." });
  i.weeks.forEach((w, k) => {
    const name = w.label || `Week ${k + 1}`;
    need(w.rostered, `week.${w.id}.rostered`, `${name}: rostered hours`, { max: 400 });
    need(w.leave, `week.${w.id}.leave`, `${name}: leave`, { max: 400 });
    need(w.unavailable, `week.${w.id}.unavailable`, `${name}: other unavailability`, { max: 400 });
    if ((w.leave ?? 0) + (w.unavailable ?? 0) > (w.rostered ?? 0))
      out.push({ field: `week.${w.id}.leave`, message: `${name}: leave and unavailability are more than the rostered hours.` });
    w.tasks.forEach((t) => {
      const tl = `${name}, “${t.label || "a task"}”`;
      need(t.count, `task.${w.id}.${t.id}.count`, `${tl}: how many`, { max: 500 });
      if (t.minutes === null || (typeof t.minutes === "number" && Number.isNaN(t.minutes)))
        out.push({ field: `task.${w.id}.${t.id}.minutes`, message: `${tl}: minutes are blank. Enter them, or mark them “not measured”.` });
      else if (typeof t.minutes === "number" && (t.minutes < 0 || t.minutes > 600))
        out.push({ field: `task.${w.id}.${t.id}.minutes`, message: `${tl}: minutes must be between 0 and 600.` });
    });
  });
  const p = i.plan;
  need(p.rostered, "plan.rostered", "The plan’s rostered hours", { max: 400 });
  need(p.leave, "plan.leave", "The plan’s leave", { max: 400 });
  need(p.unavailable, "plan.unavailable", "The plan’s other unavailability", { max: 400 });
  need(p.recurring, "plan.recurring", "Recurring client work", { max: 400 });
  need(p.starts, "plan.starts", "Planned starts", { max: 50 });
  need(p.hoursPerStart, "plan.hoursPerStart", "Onboarding hours per start", { max: 40 });
  need(p.exceptional, "plan.exceptional", "Known exceptional work", { max: 400 });
  need(p.duties, "plan.duties", "Team and operational duties", { max: 400 });
  need(p.reserve, "plan.reserve", "The contingency reserve", { max: 400 });
  i.interventions
    .filter((x) => x.active)
    .forEach((x) => {
      if (x.kind === "cover") need(x.coverHours ?? null, `change.${x.id}.coverHours`, `“${x.label}”: cover hours`, { max: 100 });
      else if (x.kind !== "hiring") {
        need(x.occurrences, `change.${x.id}.occurrences`, `“${x.label}”: occurrences a week`, { max: 200 });
        need(x.minutesEach, `change.${x.id}.minutesEach`, `“${x.label}”: minutes each`, { max: 600 });
      }
    });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------------------------

const n = (v: Num | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;
/** A task's hours, or null when it wasn't measured. */
export const taskHours = (t: Task): number | null => (typeof t.minutes === "number" ? (n(t.count) * t.minutes) / 60 : null);

const zeroBy = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export type WeekResult = {
  id: string;
  label: string;
  kind: WeekKind;
  rostered: number;
  leave: number;
  unavailable: number;
  /** rostered − leave − unavailable */
  capacity: number;
  /** Σ unique measured task hours */
  observed: number;
  /** capacity − observed. Negative: overlap or overrun. Positive: unrecorded, not idle. */
  unclassified: number;
  /** Σ hours of tasks a person reviewed as avoidable rework. */
  reworkTagged: number;
  /** The same reviewed rework, by the category it sits in (an overlay on the category bars). */
  reworkByCategory: Record<Category, number>;
  /** And by cause: what the reviewed rework came from. */
  reworkByCause: Record<Cause, number>;
  byCategory: Record<Category, number>;
  byPlanned: Record<PlannedState, number>;
  /** The overlay: hours by cause. A task with two causes shows in both; the overlay isn't a total. */
  byCause: Record<Cause, number>;
  byDay: { day: number | null; planned: number; unplanned: number; recurring: number }[];
  /** Tasks whose time wasn't measured: kept out of the hours, never read as zero. */
  unmeasured: number;
  overdue: number | null;
  /** The double-count check: categories and planned states each sum to the observed total. */
  partitionOk: boolean;
};

export type Range = { min: number; max: number; mean: number; spread: number };
export type Evidence = "single" | "few" | "sample";
export const EVIDENCE: Record<Evidence, string> = {
  single: "One week: an illustration for discussion, not a forecast",
  few: "A few weeks: shows variation, too few to call a pattern",
  sample: "A sample of weeks: a pattern worth testing",
};

export type PlanResult = {
  capacity: number;
  onboarding: number;
  /** recurring + onboarding + exceptional + duties + reserve, before any change */
  demand: number;
  headroom: number;
  /** The modelled hours each active change would affect, and the cover it adds. */
  changes: { id: string; label: string; kind: InterventionKind; modelled: number; eligible: number; capped: boolean; cover: number }[];
  modelled: number;
  cover: number;
  /** After the active changes: demand − modelled, capacity + cover. */
  demandAfter: number;
  capacityAfter: number;
  headroomAfter: number;
};

export type WorkloadResult = {
  modelVersion: string;
  taxonomyVersion: string;
  weeks: WeekResult[];
  sample: number;
  evidence: Evidence;
  observed: Range;
  capacity: Range;
  unclassified: Range;
  /** The categories that moved most between weeks (largest spread first). */
  varied: { category: Category; min: number; max: number; spread: number }[];
  /** Averages across the sampled weeks, by category and cause: labelled as averages wherever shown. */
  avgByCategory: Record<Category, number>;
  avgByCause: Record<Cause, number>;
  avgReworkByCause: Record<Cause, number>;
  plan: PlanResult;
  findings: string[];
};

function weekResult(w: ObservedWeek): WeekResult {
  const byCategory = zeroBy(CATEGORY_ORDER);
  const byPlanned = zeroBy(Object.keys(PLANNED) as PlannedState[]);
  const byCause = zeroBy(CAUSE_ORDER);
  const reworkByCategory = zeroBy(CATEGORY_ORDER);
  const reworkByCause = zeroBy(CAUSE_ORDER);
  const days = new Map<number | null, { day: number | null; planned: number; unplanned: number; recurring: number }>();
  let observed = 0;
  let rework = 0;
  let unmeasured = 0;
  for (const t of w.tasks) {
    const h = taskHours(t);
    if (h === null) {
      unmeasured += 1;
      continue;
    }
    observed += h;
    byCategory[t.category] += h;
    byPlanned[t.planned] += h;
    // The overlay: each distinct cause once per task. A task with no cause shows under "no rework cause".
    for (const c of new Set(t.causes.length ? t.causes : (["noRework"] as Cause[]))) byCause[c] += h;
    if (t.rework === "avoidable") {
      rework += h;
      reworkByCategory[t.category] += h;
      for (const c of new Set(t.causes)) reworkByCause[c] += h;
    }
    const d = days.get(t.day) ?? { day: t.day, planned: 0, unplanned: 0, recurring: 0 };
    d[t.planned] += h;
    days.set(t.day, d);
  }
  const capacity = n(w.rostered) - n(w.leave) - n(w.unavailable);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const r2 = <K extends string>(r: Record<K, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v as number)])) as Record<K, number>;
  return {
    id: w.id,
    label: w.label,
    kind: w.kind,
    rostered: n(w.rostered),
    leave: n(w.leave),
    unavailable: n(w.unavailable),
    capacity: round2(capacity),
    observed: round2(observed),
    unclassified: round2(capacity - observed),
    reworkTagged: round2(rework),
    reworkByCategory: r2(reworkByCategory),
    reworkByCause: r2(reworkByCause),
    byCategory: r2(byCategory),
    byPlanned: r2(byPlanned),
    byCause: r2(byCause),
    byDay: [...days.values()]
      .sort((a, b) => (a.day ?? 9) - (b.day ?? 9))
      .map((d) => ({ ...d, planned: round2(d.planned), unplanned: round2(d.unplanned), recurring: round2(d.recurring) })),
    unmeasured,
    overdue: w.overdue,
    partitionOk: Math.abs(sum(byCategory) - observed) < 1e-6 && Math.abs(sum(byPlanned) - observed) < 1e-6,
  };
}

const range = (xs: number[]): Range => {
  if (!xs.length) return { min: 0, max: 0, mean: 0, spread: 0 };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return { min: round2(min), max: round2(max), mean: round2(xs.reduce((a, b) => a + b, 0) / xs.length), spread: round2(max - min) };
};

/** The tasks a change can touch: reviewed tasks only, never all calls or all clients. */
export function eligibleTask(t: Task, x: Intervention): boolean {
  if (x.cause && !t.causes.includes(x.cause)) return false;
  if (x.category && t.category !== x.category) return false;
  if (!x.cause && !x.category) return false;
  // Moving a duty: tasks someone has said belong to another owner, or need the owner confirmed.
  if (x.kind === "reassign") return t.owner !== "partner";
  // Everything else: tasks a person reviewed as avoidable rework.
  return t.rework === "avoidable";
}

function planResult(i: WorkloadInputs): PlanResult {
  const p = i.plan;
  const capacity = n(p.rostered) - n(p.leave) - n(p.unavailable);
  const onboarding = n(p.starts) * n(p.hoursPerStart);
  const demand = n(p.recurring) + onboarding + n(p.exceptional) + n(p.duties) + n(p.reserve);
  const W = Math.max(1, i.weeks.length);
  // Each task's average weekly hours, still available to be changed. Two changes aimed at the same tasks share them:
  // between them they can never affect more than was observed.
  const left = new Map<string, number>();
  for (const w of i.weeks) for (const t of w.tasks) left.set(`${w.id}/${t.id}`, (taskHours(t) ?? 0) / W);
  const changes = i.interventions
    .filter((x) => x.active)
    .map((x) => {
      if (x.kind === "cover") return { id: x.id, label: x.label, kind: x.kind, modelled: 0, eligible: 0, capped: false, cover: round2(n(x.coverHours)) };
      if (x.kind === "hiring") return { id: x.id, label: x.label, kind: x.kind, modelled: 0, eligible: 0, capped: false, cover: 0 };
      // What was observed, on average, in the tasks it can touch: the most it could ever change.
      const keys = i.weeks.flatMap((w) => w.tasks.filter((t) => eligibleTask(t, x)).map((t) => `${w.id}/${t.id}`));
      const eligible = keys.reduce((a, k) => a + (left.get(k) ?? 0), 0);
      const estimate = (n(x.occurrences) * n(x.minutesEach)) / 60;
      const modelled = Math.min(estimate, eligible);
      // Take it off those tasks in proportion, so a later change sees only what's left.
      if (eligible > 0) for (const k of keys) left.set(k, (left.get(k) ?? 0) * (1 - modelled / eligible));
      return { id: x.id, label: x.label, kind: x.kind, modelled: round2(modelled), eligible: round2(eligible), capped: estimate > eligible + 1e-9, cover: 0 };
    });
  const modelled = changes.reduce((a, c) => a + c.modelled, 0);
  const cover = changes.reduce((a, c) => a + c.cover, 0);
  return {
    capacity: round2(capacity),
    onboarding: round2(onboarding),
    demand: round2(demand),
    headroom: round2(capacity - demand),
    changes,
    modelled: round2(modelled),
    cover: round2(cover),
    demandAfter: round2(demand - modelled),
    capacityAfter: round2(capacity + cover),
    headroomAfter: round2(capacity + cover - (demand - modelled)),
  };
}

const h = (v: number) => `${round1(v)} h`;

export function calculate(i: WorkloadInputs): WorkloadResult {
  const weeks = i.weeks.map(weekResult);
  const sample = weeks.length;
  const evidence: Evidence = sample <= 1 ? "single" : sample < 4 ? "few" : "sample";
  const avg = <K extends string>(keys: readonly K[], pick: (w: WeekResult) => Record<K, number>) =>
    Object.fromEntries(keys.map((k) => [k, round2(weeks.reduce((a, w) => a + pick(w)[k], 0) / Math.max(1, sample))])) as Record<K, number>;
  const varied = CATEGORY_ORDER.map((category) => {
    const r = range(weeks.map((w) => w.byCategory[category]));
    return { category, min: r.min, max: r.max, spread: r.spread };
  })
    .filter((x) => x.spread > 0)
    .sort((a, b) => b.spread - a.spread)
    .slice(0, 3);
  const plan = planResult(i);
  const observed = range(weeks.map((w) => w.observed));
  const result: WorkloadResult = {
    modelVersion: MODEL_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    weeks,
    sample,
    evidence,
    observed,
    capacity: range(weeks.map((w) => w.capacity)),
    unclassified: range(weeks.map((w) => w.unclassified)),
    varied: sample > 1 ? varied : [],
    avgByCategory: avg(CATEGORY_ORDER, (w) => w.byCategory),
    avgByCause: avg(CAUSE_ORDER, (w) => w.byCause),
    avgReworkByCause: avg(CAUSE_ORDER, (w) => w.reworkByCause),
    plan,
    findings: [],
  };
  result.findings = findingsOf(result);
  return result;
}

function findingsOf(r: WorkloadResult): string[] {
  const out: string[] = [];
  for (const w of r.weeks) {
    if (w.unclassified < 0)
      out.push(
        `${w.label}: the tasks add up to ${h(-w.unclassified)} more than the ${h(w.capacity)} available. That points to overlapping entries or an overrun (working late), not to anyone being unproductive.`,
      );
    if (w.unmeasured)
      out.push(
        `${w.label}: ${w.unmeasured} ${w.unmeasured === 1 ? "task wasn’t" : "tasks weren’t"} measured. They’re kept out of the hours, not counted as zero.`,
      );
  }
  if (r.sample === 1) out.push("One week is shown. Treat anything drawn from it as an illustrative scenario, not a forecast for every week.");
  else
    out.push(
      `${r.sample} weeks sampled: observed work ranged from ${h(r.observed.min)} to ${h(r.observed.max)} (average ${h(r.observed.mean)}). The average alone isn’t a staffing verdict${r.evidence === "few" ? "; a few weeks can’t show whether this is the usual pattern" : ""}.`,
    );
  if (r.varied[0]) out.push(`What varied most: ${CATEGORIES[r.varied[0].category].toLowerCase()}, from ${h(r.varied[0].min)} to ${h(r.varied[0].max)} a week.`);
  const per = r.sample > 1 ? " a week, on average" : "";
  // Rework, by what caused it: where a process change might help.
  const topRework = CAUSE_ORDER.filter((c) => c !== "noRework" && c !== "unknown")
    .map((c) => [c, r.avgReworkByCause[c]] as const)
    .sort((a, b) => b[1] - a[1])[0];
  if (topRework && topRework[1] > 0)
    out.push(`The largest source of reviewed rework is ${CAUSES[topRework[0]].toLowerCase()}: ${h(topRework[1])}${per}, already inside the category totals.`);
  // A change in someone's needs is necessary work, never rework: said so, so it isn't read as a problem to cut.
  if (r.avgByCause.needChanged > 0)
    out.push(`${h(r.avgByCause.needChanged)}${per} followed a change in a client’s needs: necessary work, not something to cut.`);
  const p = r.plan;
  if (p.headroom < 0) out.push(`The coming week’s plan, with its reserve, needs ${h(-p.headroom)} more than the ${h(p.capacity)} available.`);
  if (p.changes.length)
    out.push(
      p.headroomAfter < 0
        ? `With the changes tested, it’s still ${h(-p.headroomAfter)} short (modelled, not realised).`
        : `With the changes tested, it has ${h(p.headroomAfter)} of headroom (modelled, not realised: check it against the evidence named).`,
    );
  return out;
}

// ---------------------------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------------------------

const sign = (v: number) => `${v > 0 ? "+" : "−"}${round1(Math.abs(v))} h`;
const dur = (m: Duration) => (m === "unknown" ? "not measured" : m === null ? "blank" : `${m} min`);

/** What the person changed, in words: tags, durations, counts, the plan and the changes tried. */
export function inputChanges(a: WorkloadInputs, b: WorkloadInputs): string[] {
  const out: string[] = [];
  for (const wb of b.weeks) {
    const wa = a.weeks.find((x) => x.id === wb.id);
    if (!wa) {
      out.push(`Added ${wb.label || "a week"}.`);
      continue;
    }
    for (const k of ["rostered", "leave", "unavailable"] as const)
      if (wa[k] !== wb[k]) out.push(`${wb.label}: ${k === "unavailable" ? "other unavailability" : k} ${wa[k] ?? "blank"} → ${wb[k] ?? "blank"} h.`);
    for (const tb of wb.tasks) {
      const ta = wa.tasks.find((x) => x.id === tb.id);
      if (!ta) {
        out.push(`${wb.label}: added “${tb.label || "a task"}”.`);
        continue;
      }
      const name = `${wb.label}, “${tb.label}”`;
      const causesA = [...ta.causes].sort().join(",");
      const causesB = [...tb.causes].sort().join(",");
      if (causesA !== causesB)
        out.push(
          `${name}: cause tags now ${tb.causes.map((c) => CAUSES[c].toLowerCase()).join(", ") || "none"}. The category totals don’t change: causes are an overlay.`,
        );
      if (ta.rework !== tb.rework) out.push(`${name}: rework status ${REWORK[ta.rework].toLowerCase()} → ${REWORK[tb.rework].toLowerCase()}.`);
      if (ta.category !== tb.category)
        out.push(`${name}: moved from ${CATEGORIES[ta.category].toLowerCase()} to ${CATEGORIES[tb.category].toLowerCase()}. The week’s total doesn’t change.`);
      if (ta.minutes !== tb.minutes || ta.count !== tb.count) {
        const before = taskHours(ta);
        const after = taskHours(tb);
        const delta = before !== null && after !== null ? ` (${sign(after - before)} on ${wb.label}’s total)` : "";
        out.push(`${name}: ${ta.count ?? "blank"} × ${dur(ta.minutes)} → ${tb.count ?? "blank"} × ${dur(tb.minutes)}${delta}.`);
      }
      if (ta.planned !== tb.planned) out.push(`${name}: ${PLANNED[ta.planned].toLowerCase()} → ${PLANNED[tb.planned].toLowerCase()}.`);
      if (ta.owner !== tb.owner) out.push(`${name}: duty owner ${OWNERS[ta.owner].toLowerCase()} → ${OWNERS[tb.owner].toLowerCase()}.`);
    }
    for (const ta of wa.tasks) if (!wb.tasks.some((x) => x.id === ta.id)) out.push(`${wb.label}: removed “${ta.label}”.`);
  }
  for (const wa of a.weeks) if (!b.weeks.some((x) => x.id === wa.id)) out.push(`Removed ${wa.label}.`);
  const P: [keyof ForwardPlan, string][] = [
    ["rostered", "rostered hours"],
    ["leave", "leave"],
    ["unavailable", "other unavailability"],
    ["recurring", "recurring client work"],
    ["starts", "planned starts"],
    ["hoursPerStart", "onboarding hours per start"],
    ["exceptional", "known exceptional work"],
    ["duties", "team and operational duties"],
    ["reserve", "contingency reserve"],
  ];
  for (const [k, label] of P) if (a.plan[k] !== b.plan[k]) out.push(`The plan’s ${label}: ${a.plan[k] ?? "blank"} → ${b.plan[k] ?? "blank"}.`);
  for (const xb of b.interventions) {
    const xa = a.interventions.find((x) => x.id === xb.id);
    if (!xa) out.push(`Added the change “${xb.label}”.`);
    else {
      if (xa.active !== xb.active) out.push(`${xb.active ? "Tried" : "Took off"} “${xb.label}”.`);
      if (xa.occurrences !== xb.occurrences || xa.minutesEach !== xb.minutesEach)
        out.push(
          `“${xb.label}”: estimate ${xa.occurrences ?? "blank"} × ${xa.minutesEach ?? "blank"} min → ${xb.occurrences ?? "blank"} × ${xb.minutesEach ?? "blank"} min a week.`,
        );
      if ((xa.coverHours ?? null) !== (xb.coverHours ?? null)) out.push(`“${xb.label}”: cover ${xa.coverHours ?? "blank"} → ${xb.coverHours ?? "blank"} h.`);
    }
  }
  return out;
}

/** What it did to the result, in words. */
export function resultChanges(a: WorkloadResult, b: WorkloadResult): string[] {
  const out: string[] = [];
  for (const wb of b.weeks) {
    const wa = a.weeks.find((x) => x.id === wb.id);
    if (!wa) continue;
    if (wa.observed !== wb.observed)
      out.push(`${wb.label}: observed work ${h(wa.observed)} → ${h(wb.observed)}; unrecorded time ${h(wa.unclassified)} → ${h(wb.unclassified)}.`);
    if (wa.reworkTagged !== wb.reworkTagged)
      out.push(`${wb.label}: reviewed avoidable rework ${h(wa.reworkTagged)} → ${h(wb.reworkTagged)} (inside the total, not added to it).`);
  }
  if (a.plan.headroomAfter !== b.plan.headroomAfter)
    out.push(`The coming week’s headroom: ${h(a.plan.headroomAfter)} → ${h(b.plan.headroomAfter)} (modelled).`);
  if (a.plan.modelled !== b.plan.modelled)
    out.push(`Hours the changes would affect: ${h(a.plan.modelled)} → ${h(b.plan.modelled)} a week (modelled, not a realised saving).`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Starting points and stored JSON
// ---------------------------------------------------------------------------------------------

/** A blank entry for "Map my team’s week": one week, a row for each category, nothing filled in. */
export function blankInputs(): WorkloadInputs {
  return {
    weeks: [blankWeek("w1", "Week 1")],
    plan: {
      rostered: null,
      leave: null,
      unavailable: null,
      recurring: null,
      starts: null,
      hoursPerStart: null,
      exceptional: null,
      duties: null,
      reserve: null,
    },
    interventions: [],
    guardrails: [
      { id: "overdue-reviews", label: "Partner-owned reviews overdue", value: null, unit: "reviews" },
      { id: "late-callbacks", label: "Callbacks later than promised this week", value: null, unit: "callbacks" },
      { id: "escalations", label: "Escalations waiting for a response", value: null, unit: "escalations" },
    ],
  };
}

/** A week with one aggregate row per category: count × observed average minutes, all blank. */
export function blankWeek(id: string, label: string): ObservedWeek {
  return {
    id,
    label,
    kind: "ordinary",
    rostered: null,
    leave: null,
    unavailable: null,
    overdue: null,
    tasks: CATEGORY_ORDER.map((c) => ({
      id: c,
      label: CATEGORIES[c],
      category: c,
      planned: c === "review" || c === "onboarding" || c === "team" ? "planned" : "unplanned",
      causes: [],
      rework: "uncertain",
      owner: "partner",
      day: null,
      count: null,
      minutes: null,
    })),
  };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const ID = /^[a-z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const duration = (v: unknown): Duration => (v === "unknown" ? "unknown" : num(v));

export function cleanTask(v: unknown, k: number): Task {
  const t = obj(v);
  const day = typeof t.day === "number" && Number.isInteger(t.day) && t.day >= 0 && t.day <= 4 ? t.day : null;
  return {
    id: id(t.id, `t${k + 1}`),
    label: str(t.label, 120),
    category: oneOf(t.category, CATEGORY_ORDER, "other"),
    planned: oneOf(t.planned, Object.keys(PLANNED) as PlannedState[], "unplanned"),
    causes: [...new Set(arr(t.causes).filter((c): c is Cause => typeof c === "string" && c in CAUSES))].slice(0, 4),
    rework: oneOf(t.rework, Object.keys(REWORK) as ReworkStatus[], "uncertain"),
    owner: oneOf(t.owner, Object.keys(OWNERS) as Owner[], "partner"),
    day,
    count: "count" in t ? num(t.count) : 1,
    minutes: duration(t.minutes),
    ...(str(t.detail, 400) ? { detail: str(t.detail, 400) } : {}),
    ...(typeof t.prompt === "boolean" ? { prompt: t.prompt } : {}),
  };
}

export function cleanInputs(v: unknown): WorkloadInputs {
  const o = obj(v);
  const p = obj(o.plan);
  return {
    weeks: arr(o.weeks)
      .slice(0, 8)
      .map((x, k) => {
        const w = obj(x);
        return {
          id: id(w.id, `w${k + 1}`),
          label: str(w.label, 60) || `Week ${k + 1}`,
          kind: oneOf(w.kind, Object.keys(WEEK_KINDS) as WeekKind[], "unknown"),
          rostered: num(w.rostered),
          leave: num(w.leave),
          unavailable: num(w.unavailable),
          overdue: num(w.overdue),
          tasks: arr(w.tasks).slice(0, 80).map(cleanTask),
        };
      }),
    plan: {
      rostered: num(p.rostered),
      leave: num(p.leave),
      unavailable: num(p.unavailable),
      recurring: num(p.recurring),
      starts: num(p.starts),
      hoursPerStart: num(p.hoursPerStart),
      exceptional: num(p.exceptional),
      duties: num(p.duties),
      reserve: num(p.reserve),
    },
    interventions: arr(o.interventions)
      .slice(0, 10)
      .map((x, k) => {
        const c = obj(x);
        const cause = typeof c.cause === "string" && c.cause in CAUSES ? (c.cause as Cause) : undefined;
        const category = typeof c.category === "string" && c.category in CATEGORIES ? (c.category as Category) : undefined;
        const kind = oneOf(c.kind, Object.keys(INTERVENTION_KINDS) as InterventionKind[], "process");
        return {
          id: id(c.id, `x${k + 1}`),
          label: str(c.label, 160),
          kind,
          ...(cause ? { cause } : {}),
          ...(category ? { category } : {}),
          occurrences: num(c.occurrences),
          minutesEach: num(c.minutesEach),
          ...(kind === "cover" ? { coverHours: num(c.coverHours) } : {}),
          owner: str(c.owner, 80),
          evidence: str(c.evidence, 400),
          active: c.active === true,
        };
      }),
    guardrails: arr(o.guardrails)
      .slice(0, 6)
      .map((x, k) => {
        const g = obj(x);
        return { id: id(g.id, `g${k + 1}`), label: str(g.label, 120), value: num(g.value), unit: str(g.unit, 30) };
      }),
  };
}

/** The headline a saved scenario keeps: aggregate hours only, never a person. */
export const snapshotOf = (r: WorkloadResult) => ({
  sample: r.sample,
  observedMin: r.observed.min,
  observedMax: r.observed.max,
  reworkAvg: round2(r.weeks.reduce((a, w) => a + w.reworkTagged, 0) / Math.max(1, r.sample)),
  headroom: r.plan.headroom,
  headroomAfter: r.plan.headroomAfter,
  modelled: r.plan.modelled,
});
