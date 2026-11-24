import {
  dollars,
  forecast,
  hoursPerFte,
  HORIZON,
  initialClients,
  MODEL_VERSION,
  planningWindow,
  type Adjustment,
  type Forecast,
  type GrowthCase,
  type HiringInputs,
  type HiringOption,
} from "./hiringModel";
import { decisionWindow, WINDOW_VERSION, type DecisionWindow, type WindowInput } from "./hiringWindow";

/*
  Hiring Runway Decision Lab (docs/hiring-runway-lab.md): a Magazine block where a learner works through a fictional
  Care Partner business story (Maya, 35 participants, one coordinator), compares capacity, operating result and cash
  across hiring options, commits a decision, gets new information, revises, and reads a debrief. It teaches how to
  justify a decision, not the one right hire.

  Everything here is pure: the server, the learner's page and the editor's preview run the same calculation core
  (lib/hiringModel) and the same rubric. Nothing needs AI. Every figure is fictional and labelled so, and the block
  never asks for or stores a learner's real business figures.

  What learners' browsers get before they've earned it: never the event (until their first decision is in), the
  rubric's keywords, the feedback wording or the reviewed alternatives (until the debrief).
*/

/** 2: the decision window across the growth cases, sensitivity, the classification mix and the contact guardrail (hiringWindow). */
export const LAB_VERSION = "hiring-lab-2";
export const RUBRIC_VERSION = "hiring-rubric-1";
export const FICTIONAL_NOTICE =
  "Fictional case: Maya, her business, the agreement and every figure are invented for practice. They aren’t Trilogy Care pricing, staffing norms or a hiring recommendation.";
export const FUNDING_NOTE =
  "Support at Home care-management funding is pooled at the registered provider’s service-delivery-branch level. It isn’t this partner’s fee: her income comes from her own (fictional) agreement.";

// ---------------------------------------------------------------------------------------------
// The case: what an author writes
// ---------------------------------------------------------------------------------------------

/** The case inputs an author sets, each with its label and unit. */
export const INPUTS = {
  newPerMonth: { label: "New active participants", unit: "a month" },
  exitsPerMonth: { label: "Exits", unit: "a month" },
  onboardingHours: { label: "Onboarding work", unit: "hours per new participant" },
  reviewHours: { label: "Reviews and escalations", unit: "hours a month" },
  currentFte: { label: "Coordinators now", unit: "FTE" },
  paidWeeklyHours: { label: "Paid hours", unit: "hours a week per FTE" },
  availability: { label: "Available after leave", unit: "share of paid time" },
  productive: { label: "Spent on participant work", unit: "share of available time" },
  threshold: { label: "Planning threshold", unit: "share of available hours" },
  incomePerClient: { label: "Partner income (fictional agreement)", unit: "$ per active participant a month" },
  paymentLagMonths: { label: "Payment lag", unit: "months after the service month" },
  openingReceivables: { label: "Opening receivables", unit: "$ due in each delayed month" },
  staffCostPerFte: { label: "Loaded coordinator cost", unit: "$ per FTE a month" },
  variableCostPerClient: { label: "Cost per participant", unit: "$ a month" },
  fixedOverhead: { label: "Fixed overhead", unit: "$ a month" },
  ownerPay: { label: "Owner remuneration", unit: "$ a month" },
  openingCash: { label: "Opening cash", unit: "$" },
  reserve: { label: "Minimum cash reserve", unit: "$" },
} as const;
export type InputKey = keyof typeof INPUTS;
export const BAND_LABELS = { standard: "Standard work", higher: "Higher work", intensive: "Intensive work" } as const;
export type BandKey = keyof typeof BAND_LABELS;
/** A figure an evidence card states, which has to match the model's input. Band figures are "band.standard.count" style. */
export type FigureKey = InputKey | `band.${BandKey}.${"count" | "hours"}`;

export type EvidenceCard = {
  id: string;
  title: string;
  kind: "agreement" | "workload" | "cash" | "other";
  /** Where it's from, in the story: "Maya’s agreement (fictional), clause 4". */
  source: string;
  /** What it establishes, for the author and the debrief. */
  establishes: string;
  /** What the learner reads, one paragraph or row per line. */
  body: string;
  /** Figures it states, checked against the case inputs before publishing. */
  figures: { key: FigureKey; value: number }[];
};

/** An assumption the learner may change while exploring, within the author's range. */
export type Editable = { key: InputKey; min: number; max: number; step: number };

export const DIMENSIONS = {
  workload: "Workload",
  income: "Contractual income",
  economics: "Economics",
  timing: "Timing",
  protection: "Participant and staff protection",
  revision: "Revision",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export const RATING = ["Worth another look", "Partly there", "Strong"] as const;

export const MISCONCEPTIONS = {
  "public-funding-as-fee": "Treated public care-management funding as the partner’s fee",
  "ignores-negative-cash": "Didn’t account for cash going negative",
  "profit-over-capacity": "Treated a profitable no-hire forecast as safe while workload is over the threshold",
} as const;
export type Misconception = keyof typeof MISCONCEPTIONS;

export const ACTIONS = {
  recruit: "Start recruitment",
  temporary: "Temporary capacity",
  pace: "Pace intake",
  workflow: "Validate a workflow change",
  monitor: "Monitor",
} as const;
export type ActionKey = keyof typeof ACTIONS;

export type HiringLabData = {
  title: string;
  intro: string;
  /** The story version this attempt is read against: "maya-1". A new version for any change to facts. */
  storyVersion: string;
  assessment: "formative" | "assessed";
  identity: { audience: string; objective: string; behaviour: string; owner: string };
  story: {
    /** The recurring character's name, kept in the character library. */
    character: string;
    role: string;
    situation: string;
    /** Maya's question. */
    dilemma: string;
    /** An optional follow-up chapter (a later block or course). */
    followUp: string;
  };
  /** The evidence cards (named "cards": every block already has `evidence` for its sources). */
  cards: EvidenceCard[];
  inputs: HiringInputs;
  editable: Editable[];
  options: HiringOption[];
  growth: GrowthCase[];
  /**
    Optional, added with the decision window (lab 2). Left out, a case reads exactly as before.
    - classifications: participants in Support at Home classifications 1 to 8, for context only. They never set hours,
      income or a hire; the work bands do. When given they must add up to the caseload.
    - contactDuty: the fictional agreement assigns the monthly direct care-management contact to the business, so
      months above the threshold are shown as a service risk to that contact.
    - leadSpread: months recruitment may run over its stated lead, the window's uncertainty band (default 1).
  */
  classifications?: number[];
  contactDuty?: boolean;
  leadSpread?: number;
  /** How the learner's combinable actions change the forecast. */
  actions: {
    temporary: { label: string; fromMonth: number; months: number; hours: number; cost: number };
    pace: { label: string; fromMonth: number; extraNew: number };
    workflow: { label: string; fromMonth: number; share: number; setupCost: number };
  };
  event: {
    title: string;
    story: string;
    source: string;
    adjustments: Adjustment[];
    /** The assumptions that changed, in words. */
    changed: string[];
    /** Words that show a revision engaged with this event ("leave", "payment"). */
    keywords: string[];
  };
  feedback: {
    dimensions: Record<Dim, { keywords: string[]; strong: string; partly: string; weak: string }>;
    alternatives: { id: string; label: string; plan: Plan; why: string }[];
    nextStep: string;
  };
  governance: {
    signal: string;
    whySimulation: string;
    whyNow: string;
    alternatives: string;
    evaluation: string;
    measure: string;
    owner: string;
    finance: string;
    operations: string;
    partnerships: string;
    privacy: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
    sources: { title: string; url: string }[];
    /** The verified partner-growth theme this responds to (Problem desk id), for the decision register. Optional. */
    themeId?: string;
    /** The latest review decision for the register: keep, revise, retarget or withdraw. Optional. */
    review?: "" | "keep" | "revise" | "retarget" | "withdraw";
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's plan: combinable actions, read through the model
// ---------------------------------------------------------------------------------------------

export type Plan = {
  recruit: boolean;
  /** The hire option chosen, by id. */
  optionId: string;
  startMonth: number;
  temporary: boolean;
  pace: boolean;
  workflow: boolean;
  monitor: boolean;
};
export type Decision = Plan & {
  /** Which income the learner used: the fictional agreement, the public 10%, or not sure. */
  incomeBasis: "agreement" | "public" | "unsure" | "";
  rationale: string;
  /** What evidence would change the plan. */
  changeIf: string;
};
export const emptyPlan = (): Plan => ({ recruit: false, optionId: "", startMonth: 1, temporary: false, pace: false, workflow: false, monitor: false });
export const emptyDecision = (): Decision => ({ ...emptyPlan(), incomeBasis: "", rationale: "", changeIf: "" });

export const expectedCase = (d: Pick<HiringLabData, "growth">) => d.growth.find((g) => g.id === "expected") ?? d.growth[0];
export const noneOption = (d: Pick<HiringLabData, "options">): HiringOption =>
  d.options.find((o) => o.kind === "none") ?? {
    id: "none",
    label: "Keep current team",
    kind: "none",
    fte: 0,
    startMonth: 1,
    leadMonths: 0,
    rampMonths: 0,
    oneOffCost: 0,
    savingShare: 0,
    savingFromMonth: 1,
  };

/** The model's option and adjustments for a plan. */
export function planModel(d: Pick<HiringLabData, "options" | "actions">, p: Plan): { option: HiringOption; adjustments: Adjustment[] } {
  const hire = p.recruit ? d.options.find((o) => o.id === p.optionId && o.kind === "hire") : undefined;
  const option = hire ? { ...hire, startMonth: Math.max(1, Math.min(HORIZON, Math.round(p.startMonth) || 1)) } : noneOption(d);
  const adjustments: Adjustment[] = [];
  const a = d.actions;
  if (p.temporary)
    adjustments.push({ kind: "temporary", fromMonth: a.temporary.fromMonth, months: a.temporary.months, hours: a.temporary.hours, cost: a.temporary.cost });
  if (p.pace) adjustments.push({ kind: "intake", fromMonth: a.pace.fromMonth, extraNew: a.pace.extraNew });
  if (p.workflow) adjustments.push({ kind: "saving", fromMonth: a.workflow.fromMonth, share: a.workflow.share, setupCost: a.workflow.setupCost });
  return { option, adjustments };
}

/** A plan's 12-month forecast under a growth case, with or without the event. */
export function planForecast(d: HiringLabData, p: Plan, growthId?: string, withEvent = false): Forecast {
  const { option, adjustments } = planModel(d, p);
  const g = d.growth.find((x) => x.id === growthId) ?? expectedCase(d);
  return forecast(d.inputs, option, g, withEvent ? [...adjustments, ...d.event.adjustments] : adjustments);
}

/** Every option under a growth case (optionally with the event): what the option cards compare. */
export function compareOptions(d: Pick<HiringLabData, "inputs" | "options" | "growth">, growthId: string, inputs = d.inputs, extra: Adjustment[] = []) {
  const g = d.growth.find((x) => x.id === growthId) ?? expectedCase(d);
  return d.options.map((o) => ({ option: o, f: forecast(inputs, o, g, extra) }));
}

/** A plan in words: "Start recruitment for Add 0.6 FTE in Month 1, with temporary capacity and monitoring". */
export function planSummary(d: Pick<HiringLabData, "options" | "actions">, p: Plan) {
  const parts: string[] = [];
  const hire = d.options.find((o) => o.id === p.optionId);
  if (p.recruit && hire) parts.push(`${ACTIONS.recruit.toLowerCase()} (${hire.label}) in Month ${p.startMonth}`);
  if (p.temporary) parts.push(d.actions.temporary.label.toLowerCase());
  if (p.pace) parts.push(d.actions.pace.label.toLowerCase());
  if (p.workflow) parts.push(d.actions.workflow.label.toLowerCase());
  if (p.monitor) parts.push("monitor");
  if (!parts.length) return "No change yet";
  const s = parts.join(", ");
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------------------------
// Checking a case: everything must reconcile before it can publish
// ---------------------------------------------------------------------------------------------

export function figureValue(i: HiringInputs, key: FigureKey): number | undefined {
  if (key.startsWith("band.")) {
    const [, band, what] = key.split(".") as [string, BandKey, "count" | "hours"];
    return i.bands[band]?.[what];
  }
  return i[key as InputKey];
}

/** What's missing or doesn't reconcile, field by field. An incomplete or invalid case can't publish. */
export function caseProblems(d: HiringLabData): string[] {
  const out: string[] = [];
  const t = d.title || "The Hiring Runway lab";
  const i = d.inputs;
  const bandSum = initialClients(i);
  if (!d.storyVersion) out.push(`${t}: give the story a version (for example “maya-1”).`);
  if (!d.story.character || !d.story.dilemma) out.push(`${t}: the story needs its character and her question.`);
  if (bandSum <= 0) out.push(`${t}: the caseload is empty. Add participants to at least one work band.`);
  for (const b of Object.keys(BAND_LABELS) as BandKey[]) {
    const x = i.bands[b];
    if (!Number.isInteger(x.count) || x.count < 0) out.push(`${t}: ${BAND_LABELS[b]} participants must be a whole number, zero or more.`);
    if (!(x.hours >= 0)) out.push(`${t}: ${BAND_LABELS[b]} hours can’t be negative.`);
  }
  for (const k of Object.keys(INPUTS) as InputKey[]) {
    if (!Number.isFinite(i[k])) out.push(`${t}: ${INPUTS[k].label} is missing (${INPUTS[k].unit}).`);
    else if (k !== "openingCash" && i[k] < 0) out.push(`${t}: ${INPUTS[k].label} can’t be negative.`);
  }
  const between = (k: InputKey, lo: number, hi: number) => {
    const v = i[k];
    if (!Number.isFinite(v) || v < lo || v > hi) out.push(`${t}: ${INPUTS[k].label} must be between ${lo} and ${hi} (${INPUTS[k].unit}).`);
  };
  between("availability", 0.01, 1);
  between("productive", 0.01, 1);
  between("threshold", 0.1, 1.5);
  between("paidWeeklyHours", 1, 80);
  between("currentFte", 0, 20);
  between("paymentLagMonths", 0, 6);
  between("incomePerClient", 0.01, 100_000);
  between("staffCostPerFte", 1, 100_000);
  if (hoursPerFte(i) * i.currentFte <= 0) out.push(`${t}: the current team has no available hours, so there’s nothing to compare.`);
  if (!d.options.some((o) => o.kind === "none")) out.push(`${t}: include a “keep current team” option.`);
  if (d.options.filter((o) => o.kind === "hire").length < 1) out.push(`${t}: include at least one hiring option.`);
  if (d.options.length < 2) out.push(`${t}: compare at least two options.`);
  for (const o of d.options) {
    if (o.kind === "hire" && !(o.fte > 0)) out.push(`${t}: “${o.label}” adds no FTE.`);
    if (o.startMonth < 1 || o.startMonth > HORIZON || o.leadMonths < 0 || o.rampMonths < 0)
      out.push(`${t}: “${o.label}” has a start, lead or ramp outside the 12 months.`);
    if (o.kind === "workflow" && !(o.savingShare > 0 && o.savingShare < 1)) out.push(`${t}: “${o.label}” needs a saving between 0 and 1.`);
  }
  const ids = new Set<string>();
  for (const o of d.options) {
    if (ids.has(o.id)) out.push(`${t}: two options share the id “${o.id}”.`);
    ids.add(o.id);
  }
  const exp = d.growth.find((g) => g.id === "expected");
  if (!exp || exp.newDelta !== 0 || exp.exitDelta !== 0 || exp.complexity !== 1)
    out.push(`${t}: keep an “expected” growth case that uses the case exactly as entered.`);
  if (d.growth.length < 2) out.push(`${t}: give at least two growth cases to compare.`);
  if (d.cards.length < 3) out.push(`${t}: give the three evidence cards: the agreement, the workload sample and the cost and cash sheet.`);
  for (const c of d.cards)
    for (const f of c.figures) {
      const v = figureValue(i, f.key);
      if (v === undefined) out.push(`${t}: “${c.title}” states a figure the model doesn’t have (${f.key}).`);
      else if (Math.abs(v - f.value) > 1e-9) out.push(`${t}: “${c.title}” says ${f.value} for ${labelOf(f.key)}, but the case uses ${v}. Make them match.`);
    }
  if (!d.event.title || !d.event.story || !d.event.adjustments.length) out.push(`${t}: the new information needs its story and at least one change.`);
  for (const a of d.event.adjustments) {
    const m = a.kind === "leave" ? a.month : a.fromMonth;
    if (m < 1 || m > HORIZON) out.push(`${t}: the new information changes Month ${m}, outside the 12 months.`);
  }
  for (const k of DIM_ORDER) if (!d.feedback.dimensions[k]?.keywords.length) out.push(`${t}: the rubric’s ${DIMENSIONS[k]} needs words to look for.`);
  if (!d.feedback.alternatives.length) out.push(`${t}: give at least one reviewed, defensible plan to compare with.`);
  for (const alt of d.feedback.alternatives)
    if (alt.plan.recruit && !d.options.some((o) => o.id === alt.plan.optionId && o.kind === "hire"))
      out.push(`${t}: “${alt.label}” recruits for an option that isn’t in the case.`);
  // The classification mix is context: when it's given it has to describe the same caseload, all eight of them.
  if (d.classifications?.length) {
    const total = d.classifications.reduce((n, c) => n + c, 0);
    if (d.classifications.length !== 8 || d.classifications.some((c) => !Number.isInteger(c) || c < 0))
      out.push(`${t}: give the classification mix as whole numbers for all eight classifications.`);
    else if (total > 0 && total !== bandSum)
      out.push(`${t}: the classification mix adds up to ${total}, but the caseload is ${bandSum}. Make them describe the same participants.`);
  }
  return out;
}
const labelOf = (k: FigureKey) =>
  k.startsWith("band.") ? `${BAND_LABELS[k.split(".")[1] as BandKey]} ${k.split(".")[2]}` : INPUTS[k as InputKey].label.toLowerCase();

/** The decision window for a case (lib/hiringWindow): every growth case, with the learner's what-ifs and any revealed event. */
export function labWindowInput(d: HiringLabData, inputs: HiringInputs = d.inputs, extra: Adjustment[] = [], hireId?: string): WindowInput {
  return {
    inputs,
    options: d.options,
    growth: d.growth,
    baseId: expectedCase(d).id,
    adjustments: extra,
    leadSpread: d.leadSpread,
    contactDuty: d.contactDuty,
    hireId,
  };
}
export const labWindow = (d: HiringLabData, inputs: HiringInputs = d.inputs, extra: Adjustment[] = [], hireId?: string): DecisionWindow =>
  decisionWindow(labWindowInput(d, inputs, extra, hireId));

/**
  The reviewed decision-window fixture: Maya's expected case must give the reviewed window. Pressure in Month 3
  (Month 1 when faster, none when slower), a recruitment start that's already late, so interim capacity while
  recruiting; 0.6 FTE above the reserve with its monthly result back above zero from Month 6; 1.0 FTE below the reserve
  from Month 5. If the rules change and these don't hold, nothing publishes until someone reviews why.
*/
export function windowFixturesPass() {
  const w = decisionWindow({ inputs: MAYA_INPUTS, options: MAYA_OPTIONS, growth: MAYA_GROWTH });
  const o = (id: string) => w.options.find((x) => x.id === id)!;
  return (
    w.version === WINDOW_VERSION &&
    w.cases.map((c) => c.capacityMonth).join(",") === ",3,1" &&
    w.recruit?.late === true &&
    w.recommendation.kind === "interim-and-recruit" &&
    o("add-06").firstReserveBreach === null &&
    o("add-06").breakEven === 6 &&
    o("add-10").firstReserveBreach === 5 &&
    // Never a client count: the window is in months, under its stated assumptions.
    !/\b\d+ (clients|participants)\b/.test(`${w.recommendation.headline} ${w.recommendation.factors.join(" ")}`)
  );
}

/** Who has to sign off before learners see it: the owner, Finance, Operations/Quality, Partnerships and privacy, with the date. */
export const labApproved = (d: Pick<HiringLabData, "governance">) => {
  const g = d.governance;
  return Boolean(g.owner && g.finance && g.operations && g.partnerships && g.privacy && g.approvedOn);
};

/** What "Publish anyway" can't waive: sign-off, a review date in date, a complete reconciled case, and the model's fixtures. */
export function labHardProblems(d: HiringLabData, today: string): string[] {
  const out: string[] = [];
  if (!labApproved(d)) out.push(`“${d.title}”: record the content owner, the Finance, Operations/Quality, Partnerships and privacy reviewers, and the date.`);
  if (d.governance.reviewBy && d.governance.reviewBy < today)
    out.push(`“${d.title}” was due for review on ${d.governance.reviewBy}. Confirm its facts are current.`);
  out.push(...caseProblems(d));
  if (!modelFixturesPass()) out.push("The hiring model’s reviewed fixtures don’t pass, so no Hiring Runway lab can be published.");
  if (!windowFixturesPass()) out.push("The decision window’s reviewed fixture doesn’t pass, so no Hiring Runway lab can be published.");
  return out;
}

/**
  The reviewed fixture: the Maya prototype case must reproduce the reference results. If the model changes and these
  don't hold, nothing publishes until someone reviews why.
*/
export const MAYA_INPUTS: HiringInputs = {
  bands: { standard: { count: 20, hours: 1.5 }, higher: { count: 10, hours: 2.5 }, intensive: { count: 5, hours: 4 } },
  newPerMonth: 3,
  exitsPerMonth: 1,
  onboardingHours: 3,
  reviewHours: 6,
  currentFte: 1,
  paidWeeklyHours: 38,
  availability: 0.9,
  productive: 0.8,
  threshold: 0.85,
  incomePerClient: 360,
  paymentLagMonths: 1,
  openingReceivables: 12_600,
  staffCostPerFte: 7_550,
  variableCostPerClient: 20,
  fixedOverhead: 1_250,
  ownerPay: 2_500,
  openingCash: 26_720,
  reserve: 10_000,
};
const hireOption = (id: string, label: string, fte: number): HiringOption => ({
  id,
  label,
  kind: "hire",
  fte,
  startMonth: 1,
  leadMonths: 2,
  rampMonths: 2,
  oneOffCost: 4_000,
  savingShare: 0,
  savingFromMonth: 1,
});
export const MAYA_OPTIONS: HiringOption[] = [
  {
    id: "current",
    label: "Keep current team",
    kind: "none",
    fte: 0,
    startMonth: 1,
    leadMonths: 0,
    rampMonths: 0,
    oneOffCost: 0,
    savingShare: 0,
    savingFromMonth: 1,
  },
  hireOption("add-06", "Add 0.6 FTE", 0.6),
  hireOption("add-10", "Add 1.0 FTE", 1),
  {
    id: "workflow",
    label: "Improve workflow",
    kind: "workflow",
    fte: 0,
    startMonth: 1,
    leadMonths: 0,
    rampMonths: 0,
    oneOffCost: 2_500,
    savingShare: 0.15,
    savingFromMonth: 2,
  },
];
export const MAYA_GROWTH: GrowthCase[] = [
  { id: "slower", label: "Slower", newDelta: -1, exitDelta: 1, complexity: 1, describe: "One fewer new participant and one more exit each month." },
  { id: "expected", label: "Expected", newDelta: 0, exitDelta: 0, complexity: 1, describe: "The case exactly as given." },
  {
    id: "faster",
    label: "Faster and more complex",
    newDelta: 1,
    exitDelta: 0,
    complexity: 1.1,
    describe: "One more new participant each month, and 10% more recurring work.",
  },
];

export function modelFixturesPass() {
  const g = MAYA_GROWTH[1];
  const at = (id: string) =>
    forecast(
      MAYA_INPUTS,
      MAYA_OPTIONS.find((o) => o.id === id)!,
      g,
    );
  const none = at("current");
  const six = at("add-06");
  const one = at("add-10");
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  return (
    none.firstPressure === 3 &&
    six.monthsAbove === 0 &&
    near(six.lowestCash, 18_160) &&
    one.monthsAbove === 0 &&
    near(one.lowestCash, -1_670) &&
    // No available capacity is its own state, never a percentage.
    forecast({ ...MAYA_INPUTS, currentFte: 0 }, MAYA_OPTIONS[0], g).months[0].noCapacity
  );
}

// ---------------------------------------------------------------------------------------------
// Parsing what an author saved
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const n = (v: unknown, d = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d;
const int = (v: unknown, d = 0) => Math.round(n(v, d));
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const words = (v: unknown, max = 60) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, max))
        .slice(0, 30)
    : [];

function parseInputs(o: Raw): HiringInputs {
  const b = obj(o.bands);
  const band = (k: BandKey): { count: number; hours: number } => ({ count: Math.max(0, int(obj(b[k]).count)), hours: Math.max(0, n(obj(b[k]).hours)) });
  const out = { bands: { standard: band("standard"), higher: band("higher"), intensive: band("intensive") } } as HiringInputs;
  // A missing figure stays missing (NaN), so the check below names it rather than a default hiding it.
  for (const k of Object.keys(INPUTS) as InputKey[]) out[k] = n(o[k], Number.NaN);
  return out;
}
function parseOption(o: Raw, i: number): HiringOption {
  const kind = o.kind === "hire" || o.kind === "workflow" ? o.kind : "none";
  return {
    id: typeof o.id === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(o.id) ? o.id : `option-${i + 1}`,
    label: typeof o.label === "string" ? o.label.slice(0, 60) : `Option ${i + 1}`,
    kind,
    fte: kind === "hire" ? Math.max(0, Math.min(5, n(o.fte))) : 0,
    startMonth: Math.max(1, Math.min(HORIZON, int(o.startMonth, 1))),
    leadMonths: Math.max(0, Math.min(HORIZON, int(o.leadMonths))),
    rampMonths: Math.max(0, Math.min(HORIZON, int(o.rampMonths))),
    oneOffCost: Math.max(0, n(o.oneOffCost)),
    savingShare: kind === "workflow" ? Math.max(0, Math.min(0.95, n(o.savingShare))) : 0,
    savingFromMonth: Math.max(1, Math.min(HORIZON, int(o.savingFromMonth, 1))),
  };
}
function parseAdjustment(o: Raw): Adjustment | null {
  const m = (v: unknown) => Math.max(1, Math.min(HORIZON, int(v, 1)));
  switch (o.kind) {
    case "leave":
      return { kind: "leave", month: m(o.month), hours: Math.max(0, n(o.hours)) };
    case "intake":
      return { kind: "intake", fromMonth: m(o.fromMonth), extraNew: Math.max(-20, Math.min(20, int(o.extraNew))) };
    case "paymentDelay":
      return { kind: "paymentDelay", fromMonth: m(o.fromMonth), extraMonths: Math.max(0, Math.min(6, int(o.extraMonths))) };
    case "temporary":
      return {
        kind: "temporary",
        fromMonth: m(o.fromMonth),
        months: Math.max(1, Math.min(HORIZON, int(o.months, 1))),
        hours: Math.max(0, n(o.hours)),
        cost: Math.max(0, n(o.cost)),
      };
    case "saving":
      return { kind: "saving", fromMonth: m(o.fromMonth), share: Math.max(0, Math.min(0.95, n(o.share))), setupCost: Math.max(0, n(o.setupCost)) };
    default:
      return null;
  }
}
export function cleanPlan(raw: unknown, d: Pick<HiringLabData, "options">): Plan {
  const o = obj(raw);
  const hire = d.options.find((x) => x.id === o.optionId && x.kind === "hire");
  return {
    recruit: o.recruit === true && Boolean(hire),
    optionId: hire?.id ?? "",
    startMonth: Math.max(1, Math.min(HORIZON, int(o.startMonth, 1))),
    temporary: o.temporary === true,
    pace: o.pace === true,
    workflow: o.workflow === true,
    monitor: o.monitor === true,
  };
}

/**
  The block's fields, checked. Publishing needs a complete case: a story and version, caseload bands, sensible
  capacity and money figures, a keep-current-team option and at least one hire, an expected growth case, three
  evidence cards whose figures match the case, the new information, the rubric's words and a reviewed alternative.
*/
export function parseHiringLab(o: Raw, where: string, h: ParseHelpers): HiringLabData {
  const { str, idOf, list, unfinished } = h;
  const id = obj(o.identity);
  const st = obj(o.story);
  const ac = obj(o.actions);
  const ev = obj(o.event);
  const fb = obj(o.feedback);
  const gv = obj(o.governance);
  const dims = obj(fb.dimensions);
  const inputs = parseInputs(obj(o.inputs));
  const options = list(o.options, where, "option", 8).map(parseOption);
  const growth = list(o.growth, where, "growth case", 5).map((g, i) => ({
    id: typeof g.id === "string" && /^[a-z0-9-]{1,30}$/.test(g.id) ? g.id : `case-${i + 1}`,
    label: typeof g.label === "string" ? g.label.slice(0, 40) : `Case ${i + 1}`,
    newDelta: Math.max(-20, Math.min(20, int(g.newDelta))),
    exitDelta: Math.max(-20, Math.min(20, int(g.exitDelta))),
    complexity: Math.max(0.5, Math.min(2, n(g.complexity, 1))),
    describe: typeof g.describe === "string" ? g.describe.slice(0, 200) : "",
  }));
  const keys = new Set<string>([...Object.keys(INPUTS), ...(Object.keys(BAND_LABELS) as BandKey[]).flatMap((b) => [`band.${b}.count`, `band.${b}.hours`])]);
  const data: HiringLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 400 }) ?? "",
    storyVersion: typeof o.storyVersion === "string" ? o.storyVersion.slice(0, 40) : "",
    assessment: o.assessment === "assessed" ? "assessed" : "formative",
    identity: {
      audience: str(id.audience, `${where} audience`, { max: 120 }) ?? "",
      objective: str(id.objective, `${where} objective`, { max: 300 }) ?? "",
      behaviour: str(id.behaviour, `${where} behaviour`, { max: 300 }) ?? "",
      owner: str(id.owner, `${where} owner`, { max: 120 }) ?? "",
    },
    story: {
      character: str(st.character, `${where} character`, { max: 60 }) ?? "",
      role: str(st.role, `${where} role`, { max: 120 }) ?? "",
      situation: str(st.situation, `${where} situation`, { max: 1200 }) ?? "",
      dilemma: str(st.dilemma, `${where} question`, { max: 300 }) ?? "",
      followUp: str(st.followUp, `${where} follow-up`, { max: 300 }) ?? "",
    },
    cards: list(o.cards, where, "evidence card", 6).map((c, i) => ({
      id: idOf(c.id, `${where} evidence ${i + 1}`),
      title: str(c.title, `${where} evidence ${i + 1} title`, { required: true, max: 120 }) ?? "",
      kind: c.kind === "agreement" || c.kind === "workload" || c.kind === "cash" ? c.kind : "other",
      source: str(c.source, `${where} evidence ${i + 1} source`, { max: 160 }) ?? "",
      establishes: str(c.establishes, `${where} evidence ${i + 1} purpose`, { max: 300 }) ?? "",
      body: str(c.body, `${where} evidence ${i + 1}`, { max: 3000 }) ?? "",
      figures: (Array.isArray(c.figures) ? c.figures : [])
        .map(obj)
        .filter((f) => typeof f.key === "string" && keys.has(f.key))
        .slice(0, 20)
        .map((f) => ({ key: f.key as FigureKey, value: n(f.value) })),
    })),
    inputs,
    editable: (Array.isArray(o.editable) ? o.editable : [])
      .map(obj)
      .filter((e) => typeof e.key === "string" && e.key in INPUTS)
      .slice(0, 8)
      .map((e) => {
        const min = n(e.min);
        const max = Math.max(min, n(e.max, min));
        return { key: e.key as InputKey, min, max, step: n(e.step, 1) > 0 ? n(e.step, 1) : 1 };
      }),
    options,
    growth,
    actions: {
      temporary: {
        label: typeof obj(ac.temporary).label === "string" ? String(obj(ac.temporary).label).slice(0, 80) : "Temporary capacity",
        fromMonth: Math.max(1, Math.min(HORIZON, int(obj(ac.temporary).fromMonth, 3))),
        months: Math.max(1, Math.min(HORIZON, int(obj(ac.temporary).months, 3))),
        hours: Math.max(0, n(obj(ac.temporary).hours)),
        cost: Math.max(0, n(obj(ac.temporary).cost)),
      },
      pace: {
        label: typeof obj(ac.pace).label === "string" ? String(obj(ac.pace).label).slice(0, 80) : "Pace intake",
        fromMonth: Math.max(1, Math.min(HORIZON, int(obj(ac.pace).fromMonth, 2))),
        extraNew: Math.max(-20, Math.min(0, int(obj(ac.pace).extraNew, -1))),
      },
      workflow: {
        label: typeof obj(ac.workflow).label === "string" ? String(obj(ac.workflow).label).slice(0, 80) : "Validate a workflow change",
        fromMonth: Math.max(1, Math.min(HORIZON, int(obj(ac.workflow).fromMonth, 2))),
        share: Math.max(0, Math.min(0.95, n(obj(ac.workflow).share, 0.1))),
        setupCost: Math.max(0, n(obj(ac.workflow).setupCost)),
      },
    },
    event: {
      title: str(ev.title, `${where} new information title`, { max: 120 }) ?? "",
      story: str(ev.story, `${where} new information`, { max: 1500 }) ?? "",
      source: str(ev.source, `${where} new information source`, { max: 160 }) ?? "",
      adjustments: (Array.isArray(ev.adjustments) ? ev.adjustments : [])
        .map((a) => parseAdjustment(obj(a)))
        .filter((a): a is Adjustment => a !== null)
        .slice(0, 6),
      changed: words(ev.changed, 160),
      keywords: words(ev.keywords),
    },
    feedback: {
      dimensions: Object.fromEntries(
        DIM_ORDER.map((k) => {
          const x = obj(dims[k]);
          return [
            k,
            {
              keywords: words(x.keywords),
              strong: typeof x.strong === "string" ? x.strong.slice(0, 600) : "",
              partly: typeof x.partly === "string" ? x.partly.slice(0, 600) : "",
              weak: typeof x.weak === "string" ? x.weak.slice(0, 600) : "",
            },
          ];
        }),
      ) as HiringLabData["feedback"]["dimensions"],
      alternatives: list(fb.alternatives, where, "reviewed plan", 4).map((a, i) => ({
        id: typeof a.id === "string" && /^[a-z0-9-]{1,40}$/.test(a.id) ? a.id : `alt-${i + 1}`,
        label: typeof a.label === "string" ? a.label.slice(0, 120) : `Plan ${i + 1}`,
        plan: cleanPlan(a.plan, { options }),
        why: typeof a.why === "string" ? a.why.slice(0, 600) : "",
      })),
      nextStep: typeof fb.nextStep === "string" ? fb.nextStep.slice(0, 300) : "",
    },
    classifications: Array.isArray(o.classifications) ? Array.from({ length: 8 }, (_, k) => Math.max(0, int((o.classifications as unknown[])[k]))) : undefined,
    contactDuty: o.contactDuty === true,
    leadSpread: Math.max(0, Math.min(6, int(o.leadSpread, 1))),
    governance: {
      themeId: typeof gv.themeId === "string" ? gv.themeId.slice(0, 80) : "",
      review: gv.review === "keep" || gv.review === "revise" || gv.review === "retarget" || gv.review === "withdraw" ? gv.review : "",
      signal: str(gv.signal, `${where} verified signal`, { max: 600 }) ?? "",
      whySimulation: str(gv.whySimulation, `${where} why a simulation`, { max: 600 }) ?? "",
      whyNow: str(gv.whyNow, `${where} why now`, { max: 600 }) ?? "",
      alternatives: str(gv.alternatives, `${where} alternatives considered`, { max: 600 }) ?? "",
      evaluation: str(gv.evaluation, `${where} evaluation`, { max: 600 }) ?? "",
      measure: str(gv.measure, `${where} work measure`, { max: 300 }) ?? "",
      owner: str(gv.owner, `${where} content owner`, { max: 120 }) ?? "",
      finance: str(gv.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
      operations: str(gv.operations, `${where} Operations/Quality reviewer`, { max: 120 }) ?? "",
      partnerships: str(gv.partnerships, `${where} Partnerships reviewer`, { max: 120 }) ?? "",
      privacy: str(gv.privacy, `${where} privacy reviewer`, { max: 120 }) ?? "",
      approvedOn: date(gv.approvedOn),
      effectiveFrom: date(gv.effectiveFrom),
      reviewBy: date(gv.reviewBy),
      sources: (Array.isArray(gv.sources) ? gv.sources : [])
        .map(obj)
        .filter((s) => typeof s.url === "string" && /^https:\/\//.test(s.url))
        .slice(0, 6)
        .map((s) => ({ title: typeof s.title === "string" ? s.title.slice(0, 160) : String(s.url), url: String(s.url) })),
    },
  };
  for (const p of caseProblems(data)) unfinished(`${where}: ${p}`);
  return data;
}

/** The learner's copy: the story, evidence and model, without the new information, the rubric or the reviewed plans. */
export function hiringForReaders<T extends HiringLabData>(b: T): T {
  return {
    ...b,
    event: { title: "", story: "", source: "", adjustments: [], changed: [], keywords: [] },
    feedback: {
      dimensions: Object.fromEntries(
        DIM_ORDER.map((k) => [k, { keywords: [] as string[], strong: "", partly: "", weak: "" }]),
      ) as HiringLabData["feedback"]["dimensions"],
      alternatives: [],
      nextStep: "",
    },
  };
}

/** A copy with ids of its own, so two labs in one course never share an evidence id. */
export function freshHiringLab(data: HiringLabData, tag = Math.random().toString(36).slice(2, 7)): HiringLabData {
  const c = structuredClone(data);
  const re = (id: string) => `${id.replace(/-b[a-z0-9]{5}$/, "")}-b${tag}`;
  return { ...c, cards: c.cards.map((e) => ({ ...e, id: re(e.id) })) };
}

// ---------------------------------------------------------------------------------------------
// The learner's attempt
// ---------------------------------------------------------------------------------------------

export const STAGES = ["The pressure", "The evidence", "Explore", "Decide", "New information", "Revisit and debrief"] as const;

export type HiringState = {
  /** 0 the story; 1 exploring; 2 first decision in (the new information shown); 3 revised (the debrief). */
  stage: 0 | 1 | 2 | 3;
  opened: string[];
  growthId: string;
  optionId: string;
  /** The learner's what-if edits to the authored assumptions, within range. Fictional only. */
  edits: Partial<Record<InputKey, number>>;
  /** The option cards were compared under at least these growth cases. */
  compared: string[];
  /** Lab 2: the sensitivity table and the calculation basis were opened. Absent on older attempts (read as none). */
  views: ("sensitivity" | "basis")[];
  initial: Decision | null;
  revised: Decision | null;
  retries: number;
};
export const emptyHiringState = (d: Pick<HiringLabData, "growth" | "options">): HiringState => ({
  stage: 0,
  opened: [],
  growthId: expectedCase(d).id,
  optionId: d.options.find((o) => o.kind === "hire")?.id ?? d.options[0]?.id ?? "",
  edits: {},
  compared: [],
  views: [],
  initial: null,
  revised: null,
  retries: 0,
});

export function cleanDecision(raw: unknown, d: Pick<HiringLabData, "options">): Decision {
  const o = obj(raw);
  return {
    ...cleanPlan(o, d),
    incomeBasis: o.incomeBasis === "agreement" || o.incomeBasis === "public" || o.incomeBasis === "unsure" ? o.incomeBasis : "",
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 2000) : "",
    changeIf: typeof o.changeIf === "string" ? o.changeIf.slice(0, 1000) : "",
  };
}

export function cleanHiringState(d: HiringLabData, raw: unknown): HiringState {
  const o = obj(raw);
  const empty = emptyHiringState(d);
  const edits: Partial<Record<InputKey, number>> = {};
  for (const e of d.editable) {
    const v = obj(o.edits)[e.key];
    if (typeof v === "number" && Number.isFinite(v)) edits[e.key] = Math.max(e.min, Math.min(e.max, v));
  }
  const ev = new Set(d.cards.map((x) => x.id));
  const gs = new Set(d.growth.map((g) => g.id));
  return {
    stage: o.stage === 3 ? 3 : o.stage === 2 ? 2 : o.stage === 1 ? 1 : 0,
    opened: (Array.isArray(o.opened) ? o.opened : []).filter((x): x is string => typeof x === "string" && ev.has(x)).slice(0, 12),
    growthId: typeof o.growthId === "string" && gs.has(o.growthId) ? o.growthId : empty.growthId,
    optionId: typeof o.optionId === "string" && d.options.some((x) => x.id === o.optionId) ? o.optionId : empty.optionId,
    edits,
    compared: (Array.isArray(o.compared) ? o.compared : []).filter((x): x is string => typeof x === "string" && gs.has(x)).slice(0, 5),
    views: (Array.isArray(o.views) ? o.views : []).filter((x): x is "sensitivity" | "basis" => x === "sensitivity" || x === "basis").slice(0, 2),
    initial: o.initial ? cleanDecision(o.initial, d) : null,
    revised: o.revised ? cleanDecision(o.revised, d) : null,
    retries: Number.isInteger(o.retries) ? Math.max(0, Math.min(50, o.retries as number)) : 0,
  };
}

/** The case's inputs with the learner's what-if edits: for exploring only. Feedback reads the authored case. */
export function exploreInputs(d: HiringLabData, s: Pick<HiringState, "edits">): HiringInputs {
  return { ...d.inputs, ...(s.edits as Partial<HiringInputs>) };
}

/** What's still needed before a decision can be committed. */
export function decisionProblems(d: HiringLabData, x: Decision, kind: "initial" | "revised"): string[] {
  const out: string[] = [];
  const any = x.recruit || x.temporary || x.pace || x.workflow || x.monitor;
  if (!any) out.push("Choose at least one action.");
  if (x.recruit && !d.options.some((o) => o.id === x.optionId && o.kind === "hire")) out.push("Choose which hire to recruit for.");
  if (!x.incomeBasis) out.push(`Say which figure you used for ${d.story.character || "the business"}’s income.`);
  if (x.rationale.trim().length < 30)
    out.push(kind === "initial" ? "Explain your plan in a sentence or two." : "Explain what you changed, or why you kept the plan.");
  if (x.changeIf.trim().length < 10) out.push("Say what evidence would change your plan.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// The debrief: authored criteria, structured choices and computed values. No AI score.
// ---------------------------------------------------------------------------------------------

const mentions = (text: string, keywords: string[]) => {
  const t = text.toLowerCase();
  return keywords.some((k) => k && t.includes(k.toLowerCase()));
};

export type DimResult = { dim: Dim; rating: 0 | 1 | 2; text: string };
export type Comparison = {
  before: Forecast;
  after: Forecast;
  /** Months whose capacity verdict changed with the new information. */
  movedPressure: number[];
  cashChange: number;
};

/** Fills {tokens} in authored feedback with the calculated values: every figure traces to the model. */
export function fillTemplate(text: string, v: Record<string, string>) {
  return text.replace(/\{([a-zA-Z0-9.]+)\}/g, (all, k: string) => v[k] ?? all);
}

export function compareBeforeAfter(d: HiringLabData, p: Plan): Comparison {
  const before = planForecast(d, p, undefined, false);
  const after = planForecast(d, p, undefined, true);
  return {
    before,
    after,
    movedPressure: after.months.filter((m, i) => m.pressure !== before.months[i].pressure).map((m) => m.month),
    cashChange: after.lowestCash - before.lowestCash,
  };
}

export function buildHiringDebrief(d: HiringLabData, s: HiringState) {
  const initial = s.initial ?? emptyDecision();
  const revised = s.revised ?? initial;
  const expected = expectedCase(d);
  const none = forecast(d.inputs, noneOption(d), expected);
  const hires = d.options.filter((o) => o.kind === "hire");
  const lead = hires[0]?.leadMonths ?? 0;
  const ramp = hires[0]?.rampMonths ?? 0;
  const window = planningWindow(none.firstPressure, lead, ramp);
  const yours = compareBeforeAfter(d, revised);
  const first = compareBeforeAfter(d, initial);
  const plan = yours.after;
  const capacityAction = revised.recruit || revised.temporary || revised.pace || revised.workflow;
  const text = `${revised.rationale} ${revised.changeIf}`;
  const allText = `${initial.rationale} ${initial.changeIf} ${text}`;
  const fb = d.feedback.dimensions;
  const opened = (kind: EvidenceCard["kind"]) => d.cards.some((e) => e.kind === kind && s.opened.includes(e.id));
  const values: Record<string, string> = {
    "plan.lowestCash": dollars(plan.lowestCash),
    "plan.lowestCashMonth": String(plan.lowestCashMonth),
    "plan.monthsAbove": String(plan.monthsAbove),
    "plan.operating12": dollars(plan.operating12),
    "plan.firstPressure": plan.firstPressure ? `Month ${plan.firstPressure}` : "no month",
    "none.firstPressure": none.firstPressure ? `Month ${none.firstPressure}` : "no month",
    "none.operating12": dollars(none.operating12),
    reserve: dollars(d.inputs.reserve),
    window: window === null ? "no planning window" : window < 1 ? "before Month 1" : `Month ${window}`,
    character: d.story.character,
  };
  const rate = (k: Dim, r: 0 | 1 | 2): DimResult => ({ dim: k, rating: r, text: fillTemplate([fb[k].weak, fb[k].partly, fb[k].strong][r], values) });

  // Workload: weighted hours, onboarding and review work; acts before the threshold is breached.
  const workloadHits = [opened("workload"), none.firstPressure === null || capacityAction, mentions(allText, fb.workload.keywords)].filter(Boolean).length;
  // Contractual income: read the agreement, kept separate from public funding.
  const incomeRating: 0 | 1 | 2 = revised.incomeBasis === "agreement" ? (opened("agreement") ? 2 : 1) : 0;
  // Economics: operating result versus receipts and cash. Names cash, receipts or the reserve, and the plan's cash doesn't go negative.
  const cashAware = mentions(allText, fb.economics.keywords);
  const econHits = [cashAware, plan.lowestCash >= 0].filter(Boolean).length;
  // Timing: recruitment lead and ramp, with interim cover if pressure comes first.
  const timely = revised.recruit && window !== null && revised.startMonth <= Math.max(1, window);
  const covered = plan.monthsAbove === 0;
  const timingRating: 0 | 1 | 2 =
    (revised.recruit && (timely || revised.temporary)) || (!revised.recruit && capacityAction && covered)
      ? covered || plan.monthsAbove <= 1
        ? 2
        : 1
      : capacityAction
        ? 1
        : 0;
  // Protection: guardrails for participants and staff, and a way to monitor.
  const protectHits = [revised.monitor || revised.temporary || revised.pace, mentions(allText, fb.protection.keywords)].filter(Boolean).length;
  // Revision: engaged with the new information and named an assumption to revisit.
  const revHits = [mentions(`${revised.rationale}`, [...d.event.keywords, ...fb.revision.keywords]), revised.changeIf.trim().length >= 10].filter(
    Boolean,
  ).length;

  const dims: DimResult[] = [
    rate("workload", (workloadHits >= 3 ? 2 : workloadHits === 2 ? 1 : 0) as 0 | 1 | 2),
    rate("income", incomeRating),
    rate("economics", (econHits === 2 ? 2 : econHits) as 0 | 1 | 2),
    rate("timing", timingRating),
    rate("protection", protectHits as 0 | 1 | 2),
    rate("revision", revHits as 0 | 1 | 2),
  ];
  const misconceptions: Misconception[] = [];
  if (initial.incomeBasis === "public" || revised.incomeBasis === "public") misconceptions.push("public-funding-as-fee");
  if (plan.lowestCash < 0 && !cashAware) misconceptions.push("ignores-negative-cash");
  if (!capacityAction && plan.monthsAbove > 0) misconceptions.push("profit-over-capacity");

  const alternatives = d.feedback.alternatives.map((a) => ({ ...a, summary: planSummary(d, a.plan), f: planForecast(d, a.plan, undefined, true) }));
  return {
    labVersion: LAB_VERSION,
    windowVersion: WINDOW_VERSION,
    /** The decision window for the case as given, with the new information: what the debrief compares the plan with. */
    range: labWindow(d, d.inputs, d.event.adjustments, revised.recruit ? revised.optionId : undefined),
    modelVersion: MODEL_VERSION,
    rubricVersion: RUBRIC_VERSION,
    storyVersion: d.storyVersion,
    window,
    none,
    yours,
    first,
    dims,
    score: dims.reduce((x, y) => x + y.rating, 0),
    misconceptions,
    alternatives,
    changed: d.event.changed,
    nextStep: d.feedback.nextStep,
  };
}
export type HiringDebrief = ReturnType<typeof buildHiringDebrief>;
