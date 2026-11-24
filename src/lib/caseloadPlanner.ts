import {
  dollars,
  forecast,
  HORIZON,
  initialClients,
  MODEL_VERSION,
  planningWindow,
  type Forecast,
  type GrowthCase,
  type HiringInputs,
  type HiringOption,
  type Month,
} from "./hiringModel";

/*
  Caseload-to-Margin & Hiring Capacity Calculator (docs/caseload-margin-calculator.md): the Work Tool's fields, plans and
  explanations, on top of the shared model (lib/hiringModel). Pure: the page, the server (saved plans, the workbook) and
  the tests all run this same code. No AI, no I/O.

  A plan is either the fictional example (Maya's prototype case, every figure invented) or a business's own plan. A
  business plan starts with no income and no costs: the fictional $360 never carries into a real plan. Fields can be
  blank; a blank is never read as a verified zero. Capacity needs only the caseload and work fields. Operating result,
  cash and affordability need the income and the money fields, and say "Revenue unknown" until they're there.

  The answer is a planning window under stated assumptions, never a hiring order or a clients-per-coordinator ratio.
*/

export const PLANNER_VERSION = "caseload-planner-1";
export const FICTIONAL_NOTICE =
  "Fictional example: the business, its agreement and every figure are invented. They aren’t Trilogy Care pricing, benchmarks, staffing norms or a hiring recommendation.";
export const FUNDING_NOTE =
  "Support at Home care-management funding is pooled at the registered provider’s service-delivery-branch level. It isn’t your fee: your income is what your own agreement with Trilogy Care says.";
export const BASIS_NOTE = "All figures are monthly, in AUD, before GST and tax.";

// ---------------------------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------------------------

export const GROUPS = { caseload: "Caseload", work: "Work and team", money: "Money", hiring: "Hiring" } as const;
export type Group = keyof typeof GROUPS;

/** capacity: needed for the workload forecast. money: needed for operating result and cash. optional: blank is fine. */
type Need = "capacity" | "money" | "income" | "optional";
type FieldDef = { group: Group; label: string; unit: string; need: Need; pct?: boolean; whole?: boolean; min?: number; max?: number; help?: string };

export const FIELDS = {
  standardCount: { group: "caseload", label: "Standard-work participants", unit: "active participants", need: "capacity", whole: true },
  higherCount: { group: "caseload", label: "Higher-work participants", unit: "active participants", need: "capacity", whole: true },
  intensiveCount: { group: "caseload", label: "Intensive-work participants", unit: "active participants", need: "capacity", whole: true },
  newPerMonth: { group: "caseload", label: "New active participants", unit: "a month", need: "capacity" },
  exitsPerMonth: { group: "caseload", label: "Exits", unit: "a month", need: "capacity" },
  mixStandard: {
    group: "caseload",
    label: "New participants in standard work",
    unit: "% of new participants",
    need: "optional",
    pct: true,
    help: "Leave the three mix fields blank if new participants look like today’s caseload.",
  },
  mixHigher: { group: "caseload", label: "New participants in higher work", unit: "% of new participants", need: "optional", pct: true },
  mixIntensive: { group: "caseload", label: "New participants in intensive work", unit: "% of new participants", need: "optional", pct: true },

  standardHours: {
    group: "work",
    label: "Standard work",
    unit: "hours per participant a month",
    need: "capacity",
    help: "Recurring coordination work you’ve observed: contact, planning, liaison, notes. Not onboarding or reviews (below).",
  },
  higherHours: { group: "work", label: "Higher work", unit: "hours per participant a month", need: "capacity" },
  intensiveHours: { group: "work", label: "Intensive work", unit: "hours per participant a month", need: "capacity" },
  onboardingHours: { group: "work", label: "Onboarding", unit: "hours per new participant", need: "capacity", help: "Falls in the month they start." },
  reviewHours: { group: "work", label: "Reviews and escalations", unit: "hours a month, across the caseload", need: "capacity" },
  currentFte: { group: "work", label: "Coordinators now", unit: "FTE", need: "capacity" },
  paidWeeklyHours: { group: "work", label: "Paid hours", unit: "hours a week per FTE", need: "capacity" },
  availability: {
    group: "work",
    label: "Available after leave",
    unit: "% of paid time",
    need: "capacity",
    pct: true,
    max: 100,
    help: "Take leave and public holidays out here, once.",
  },
  productive: {
    group: "work",
    label: "Spent on participant work",
    unit: "% of available time",
    need: "capacity",
    pct: true,
    max: 100,
    help: "Take training, admin and supervision out here, once. Don’t take leave out again.",
  },
  threshold: {
    group: "work",
    label: "Planning threshold",
    unit: "% of available hours",
    need: "capacity",
    pct: true,
    min: 1,
    max: 100,
    help: "Your own choice of how full is too full to keep a safe buffer. Not a staffing standard.",
  },

  income: {
    group: "money",
    label: "Agreement income",
    unit: "$ (see basis)",
    need: "income",
    help: "From your current agreement with Trilogy Care and your Finance records. Never the public care-management funding.",
  },
  paymentLagMonths: { group: "money", label: "Payment lag", unit: "months after the service month", need: "money", whole: true, max: 6 },
  receivable1: { group: "money", label: "Opening receivables due in Month 1", unit: "$", need: "optional" },
  receivable2: { group: "money", label: "Opening receivables due in Month 2", unit: "$", need: "optional" },
  receivable3: { group: "money", label: "Opening receivables due in Month 3", unit: "$", need: "optional" },
  staffCostPerFte: { group: "money", label: "Loaded coordinator cost", unit: "$ per FTE a month (pay, super, on-costs)", need: "money" },
  variableCostPerClient: { group: "money", label: "Cost per participant", unit: "$ a month", need: "money" },
  fixedOverhead: { group: "money", label: "Fixed overhead", unit: "$ a month", need: "money" },
  ownerPay: { group: "money", label: "Owner remuneration", unit: "$ a month", need: "money" },
  openingCash: { group: "money", label: "Opening cash", unit: "$", need: "money", min: -1e9 },
  reserve: { group: "money", label: "Minimum cash reserve", unit: "$", need: "money" },

  startMonth: { group: "hiring", label: "Recruitment starts", unit: "month (1 to 12)", need: "capacity", whole: true, min: 1, max: 12 },
  leadMonths: { group: "hiring", label: "Recruitment lead time", unit: "months to join", need: "capacity", whole: true, max: 12 },
  rampMonths: { group: "hiring", label: "Ramp to full productivity", unit: "months", need: "capacity", whole: true, max: 12 },
  recruitCost: { group: "hiring", label: "Recruitment and setup", unit: "$ once, when recruitment starts", need: "money" },
  savingShare: {
    group: "hiring",
    label: "Workflow saving",
    unit: "% of recurring hours",
    need: "optional",
    pct: true,
    max: 60,
    help: "Hypothetical until you’ve shown it protects required tasks and outcomes.",
  },
  savingFromMonth: { group: "hiring", label: "Saving starts", unit: "month", need: "optional", whole: true, min: 1, max: 12 },
  workflowCost: { group: "hiring", label: "Workflow setup", unit: "$ once", need: "optional" },
} satisfies Record<string, FieldDef>;
export type FieldKey = keyof typeof FIELDS;
export const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];
export const fieldsIn = (g: Group) => FIELD_KEYS.filter((k) => FIELDS[k].group === g);
const def = (k: FieldKey): FieldDef => FIELDS[k];

export const PROVENANCE = { entered: "Entered", estimated: "Estimated", verified: "Verified" } as const;
export type ProvenanceStatus = keyof typeof PROVENANCE;
export type Provenance = { status: ProvenanceStatus; source: string; date: string };

export const INCOME_BASES = {
  "per-participant": "Per active participant a month",
  "fixed-monthly": "A fixed amount a month",
} as const;
export type IncomeBasis = keyof typeof INCOME_BASES;

/** Support at Home's eight ongoing classifications: recorded for context only. They never set hours or income. */
export const CLASSIFICATIONS = 8;

export type GrowthEdit = { newDelta: number; exitDelta: number; complexity: number };

/** Everything a plan holds. Values are as entered: null is blank, never a verified zero. */
export type Plan = {
  kind: "example" | "business";
  values: Record<FieldKey, number | null>;
  provenance: Partial<Record<FieldKey, Provenance>>;
  incomeBasis: IncomeBasis;
  /** The slower and faster cases, as changes from the base. The expected case is the base exactly. */
  slower: GrowthEdit;
  faster: GrowthEdit;
  /** The workflow change has been checked to protect required tasks and outcomes. */
  workflowChecked: boolean;
  /** Participants in each Support at Home classification, 1 to 8: recorded only. */
  classifications: (number | null)[];
};

const blankValues = () => Object.fromEntries(FIELD_KEYS.map((k) => [k, null])) as Record<FieldKey, number | null>;

/** The fictional example: the reference prototype's case, which the reviewed fixture must reproduce. */
export function fictionalExample(): Plan {
  const values: Record<FieldKey, number | null> = {
    ...blankValues(),
    standardCount: 20,
    higherCount: 10,
    intensiveCount: 5,
    newPerMonth: 3,
    exitsPerMonth: 1,
    standardHours: 1.5,
    higherHours: 2.5,
    intensiveHours: 4,
    onboardingHours: 3,
    reviewHours: 6,
    currentFte: 1,
    paidWeeklyHours: 38,
    availability: 90,
    productive: 80,
    threshold: 85,
    income: 360,
    paymentLagMonths: 1,
    receivable1: 12_600,
    staffCostPerFte: 7_550,
    variableCostPerClient: 20,
    fixedOverhead: 1_250,
    ownerPay: 2_500,
    openingCash: 26_720,
    reserve: 10_000,
    startMonth: 1,
    leadMonths: 2,
    rampMonths: 2,
    recruitCost: 4_000,
    savingShare: 15,
    savingFromMonth: 2,
    workflowCost: 2_500,
  };
  return {
    kind: "example",
    values,
    provenance: Object.fromEntries(
      FIELD_KEYS.filter((k) => values[k] !== null).map((k) => [k, { status: "estimated", source: "Fictional example", date: "" }]),
    ),
    incomeBasis: "per-participant",
    slower: { newDelta: -1, exitDelta: 1, complexity: 1 },
    faster: { newDelta: 1, exitDelta: 0, complexity: 1.1 },
    workflowChecked: false,
    classifications: Array(CLASSIFICATIONS).fill(null),
  };
}

/**
  A new business plan: only the structure is filled, each marked "estimated" so it's checked. Caseload, income,
  costs and cash start blank: nothing fictional carries over.
*/
export function blankPlan(): Plan {
  const estimates: Partial<Record<FieldKey, number>> = {
    paidWeeklyHours: 38,
    availability: 90,
    productive: 80,
    threshold: 85,
    paymentLagMonths: 1,
    startMonth: 1,
    leadMonths: 2,
    rampMonths: 2,
    savingFromMonth: 2,
  };
  return {
    kind: "business",
    values: { ...blankValues(), ...estimates },
    provenance: Object.fromEntries(
      Object.keys(estimates).map((k) => [k, { status: "estimated", source: "Starting estimate: replace with your own", date: "" }]),
    ),
    incomeBasis: "per-participant",
    slower: { newDelta: -1, exitDelta: 1, complexity: 1 },
    faster: { newDelta: 1, exitDelta: 0, complexity: 1.1 },
    workflowChecked: false,
    classifications: Array(CLASSIFICATIONS).fill(null),
  };
}

// ---------------------------------------------------------------------------------------------
// Checking and reading a plan
// ---------------------------------------------------------------------------------------------

/** Why a value can't be used, or null when it can. A blank is reported by the caller, not here. */
export function fieldProblem(k: FieldKey, v: number | null): string | null {
  if (v === null) return null;
  const d = def(k);
  if (!Number.isFinite(v)) return "Enter a number.";
  const min = d.min ?? 0;
  if (v < min) return min === 0 ? "Can’t be negative." : `At least ${min}.`;
  if (d.max !== undefined && v > d.max) return `At most ${d.max}.`;
  if (d.whole && !Number.isInteger(v)) return "A whole number.";
  return null;
}

const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const edit = (raw: unknown, fallback: GrowthEdit): GrowthEdit => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (finite(v) === null ? d : Math.min(hi, Math.max(lo, finite(v)!)));
  return {
    newDelta: clamp(o.newDelta, -50, 50, fallback.newDelta),
    exitDelta: clamp(o.exitDelta, -50, 50, fallback.exitDelta),
    complexity: clamp(o.complexity, 0.5, 2, fallback.complexity),
  };
};

/** A plan as saved or sent: only known fields, numbers or blanks, short provenance notes. Never trusts the shape it's given. */
export function cleanPlan(raw: unknown): Plan {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = o.kind === "example" ? fictionalExample() : blankPlan();
  const values = (o.values && typeof o.values === "object" ? o.values : {}) as Record<string, unknown>;
  const prov = (o.provenance && typeof o.provenance === "object" ? o.provenance : {}) as Record<string, unknown>;
  return {
    kind: o.kind === "example" ? "example" : "business",
    values: Object.fromEntries(FIELD_KEYS.map((k) => [k, k in values ? finite(values[k]) : base.values[k]])) as Record<FieldKey, number | null>,
    provenance: Object.fromEntries(
      FIELD_KEYS.flatMap((k) => {
        const p = prov[k] as Record<string, unknown> | undefined;
        if (!p || typeof p !== "object") return [];
        const status = (Object.keys(PROVENANCE) as ProvenanceStatus[]).find((s) => s === p.status) ?? "entered";
        return [[k, { status, source: text(p.source, 160), date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.date)) ? String(p.date) : "" }]];
      }),
    ),
    incomeBasis: o.incomeBasis === "fixed-monthly" ? "fixed-monthly" : "per-participant",
    slower: edit(o.slower, base.slower),
    faster: edit(o.faster, base.faster),
    workflowChecked: o.workflowChecked === true,
    classifications: Array.from({ length: CLASSIFICATIONS }, (_, i) => {
      const v = finite(Array.isArray(o.classifications) ? o.classifications[i] : null);
      return v !== null && v >= 0 ? Math.round(v) : null;
    }),
  };
}

export const growthCases = (p: Pick<Plan, "slower" | "faster">): GrowthCase[] => {
  const say = (e: GrowthEdit, word: string) => {
    const parts = [
      e.newDelta ? `${Math.abs(e.newDelta)} ${e.newDelta > 0 ? "more" : "fewer"} new participant${Math.abs(e.newDelta) === 1 ? "" : "s"}` : "",
      e.exitDelta ? `${Math.abs(e.exitDelta)} ${e.exitDelta > 0 ? "more" : "fewer"} exit${Math.abs(e.exitDelta) === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    const intake = parts.length ? `${parts.join(" and ")} each month than your base` : "The same intake as your base";
    const work = e.complexity !== 1 ? `, and ${Math.round(Math.abs(e.complexity - 1) * 100)}% ${e.complexity > 1 ? "more" : "less"} recurring work` : "";
    return `${word}: ${intake}${work}.`;
  };
  return [
    { id: "slower", label: "Slower", ...p.slower, describe: say(p.slower, "Slower") },
    { id: "expected", label: "Expected", newDelta: 0, exitDelta: 0, complexity: 1, describe: "Expected: exactly your base assumptions." },
    { id: "faster", label: "Faster and more complex", ...p.faster, describe: say(p.faster, "Faster") },
  ];
};

export const OPTION_IDS = ["current", "add-06", "add-10", "workflow"] as const;
export type OptionId = (typeof OPTION_IDS)[number];
export const OPTION_LABELS: Record<OptionId, string> = {
  current: "Keep current team",
  "add-06": "Add 0.6 FTE",
  "add-10": "Add 1.0 FTE",
  workflow: "Improve workflow",
};

export type Reading =
  | { ok: false; missing: FieldKey[]; invalid: { key: FieldKey; problem: string }[] }
  | {
      ok: true;
      inputs: HiringInputs;
      options: HiringOption[];
      /** Income is entered: operating result can be shown. */
      revenueKnown: boolean;
      /** Income, costs and cash are all entered: cash and affordability can be shown. */
      moneyKnown: boolean;
      /** Money fields still blank, which keep the financial view hidden. */
      moneyMissing: FieldKey[];
      /** Income isn't marked verified: financial figures are illustrative. */
      illustrative: boolean;
    };

/**
  A plan, read for the model. Capacity fields must all be there and valid; otherwise the reading says which, and the
  page keeps showing its last good result. Blank income or money fields don't stop the capacity forecast, they hide the
  financial conclusions instead (they're run as zero only so the hours still calculate).
*/
export function readPlan(p: Plan): Reading {
  const v = p.values;
  const invalid = FIELD_KEYS.flatMap((k) => {
    const problem = fieldProblem(k, v[k]);
    return problem ? [{ key: k, problem }] : [];
  });
  const missing = FIELD_KEYS.filter((k) => def(k).need === "capacity" && v[k] === null);
  if (invalid.length || missing.length) return { ok: false, missing, invalid };
  const n = (k: FieldKey) => v[k] ?? 0;
  const pct = (k: FieldKey) => n(k) / 100;
  const moneyMissing = FIELD_KEYS.filter((k) => (def(k).need === "money" || def(k).need === "income") && v[k] === null);
  const revenueKnown = v.income !== null;
  const mixGiven = v.mixStandard !== null || v.mixHigher !== null || v.mixIntensive !== null;
  const lag = n("paymentLagMonths");
  const inputs: HiringInputs = {
    bands: {
      standard: { count: n("standardCount"), hours: n("standardHours") },
      higher: { count: n("higherCount"), hours: n("higherHours") },
      intensive: { count: n("intensiveCount"), hours: n("intensiveHours") },
    },
    newPerMonth: n("newPerMonth"),
    exitsPerMonth: n("exitsPerMonth"),
    onboardingHours: n("onboardingHours"),
    reviewHours: n("reviewHours"),
    currentFte: n("currentFte"),
    paidWeeklyHours: n("paidWeeklyHours"),
    availability: pct("availability"),
    productive: pct("productive"),
    threshold: pct("threshold"),
    incomePerClient: p.incomeBasis === "per-participant" ? n("income") : 0,
    fixedIncome: p.incomeBasis === "fixed-monthly" ? n("income") : 0,
    paymentLagMonths: lag,
    openingReceivables: 0,
    // Each amount once, in the month it's due: a schedule, never a figure repeated across the lag.
    receivables: [n("receivable1"), n("receivable2"), n("receivable3")],
    staffCostPerFte: n("staffCostPerFte"),
    variableCostPerClient: n("variableCostPerClient"),
    fixedOverhead: n("fixedOverhead"),
    ownerPay: n("ownerPay"),
    openingCash: n("openingCash"),
    reserve: n("reserve"),
    ...(mixGiven ? { newMix: { standard: pct("mixStandard"), higher: pct("mixHigher"), intensive: pct("mixIntensive") } } : {}),
  };
  const hire = (id: OptionId, fte: number): HiringOption => ({
    id,
    label: OPTION_LABELS[id],
    kind: "hire",
    fte,
    startMonth: n("startMonth"),
    leadMonths: n("leadMonths"),
    rampMonths: n("rampMonths"),
    oneOffCost: n("recruitCost"),
    savingShare: 0,
    savingFromMonth: 1,
  });
  const options: HiringOption[] = [
    {
      id: "current",
      label: OPTION_LABELS.current,
      kind: "none",
      fte: 0,
      startMonth: 1,
      leadMonths: 0,
      rampMonths: 0,
      oneOffCost: 0,
      savingShare: 0,
      savingFromMonth: 1,
    },
    hire("add-06", 0.6),
    hire("add-10", 1),
    {
      id: "workflow",
      label: OPTION_LABELS.workflow,
      kind: "workflow",
      fte: 0,
      // The setup is paid the month before the saving starts (or in Month 1).
      startMonth: Math.max(1, (v.savingFromMonth ?? 2) - 1),
      leadMonths: 0,
      rampMonths: 0,
      oneOffCost: n("workflowCost"),
      savingShare: pct("savingShare"),
      savingFromMonth: v.savingFromMonth ?? 2,
    },
  ];
  return {
    ok: true,
    inputs,
    options,
    revenueKnown,
    moneyKnown: moneyMissing.length === 0,
    moneyMissing,
    illustrative: p.kind === "example" || p.provenance.income?.status !== "verified",
  };
}

// ---------------------------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------------------------

export type Window = {
  /** The prototype's heuristic: no-hire pressure month − lead − ramp + 1 (can be below Month 1). */
  heuristic: number | null;
  /** The earliest a hire could join, starting recruitment in Month 1. */
  earliestJoin: number;
  /** Pressure arrives before any hire could join. */
  pressureBeforeJoin: boolean;
  /**
    Checked by simulation: the latest recruitment start that does no worse on months above the threshold than starting
    in Month 1, with its lowest cash. Null when no hire option is selected or no pressure is forecast.
  */
  latestStart: number | null;
  latestStartLowestCash: number | null;
  latestStartReserveBreach: number | null;
};

export type Analysis = {
  growthId: string;
  optionId: OptionId;
  growth: GrowthCase;
  clientsNow: number;
  byOption: Record<OptionId, Forecast>;
  noHire: Forecast;
  selected: Forecast;
  window: Window;
  revenueKnown: boolean;
  moneyKnown: boolean;
  moneyMissing: FieldKey[];
  illustrative: boolean;
  workflowChecked: boolean;
  threshold: number;
  reserve: number;
  lead: number;
  ramp: number;
};

export function analyse(p: Plan, growthId: string, optionId: OptionId): Analysis | null {
  const r = readPlan(p);
  if (!r.ok) return null;
  const cases = growthCases(p);
  const growth = cases.find((g) => g.id === growthId) ?? cases[1];
  const byOption = Object.fromEntries(r.options.map((o) => [o.id, forecast(r.inputs, o, growth)])) as Record<OptionId, Forecast>;
  const noHire = byOption.current;
  const option = r.options.find((o) => o.id === optionId) ?? r.options[0];
  const lead = p.values.leadMonths ?? 0;
  const ramp = p.values.rampMonths ?? 0;
  const earliestJoin = 1 + lead;
  let latestStart: number | null = null;
  let latestStartLowestCash: number | null = null;
  let latestStartReserveBreach: number | null = null;
  if (option.kind === "hire" && noHire.firstPressure !== null) {
    const at = (s: number) => forecast(r.inputs, { ...option, startMonth: s }, growth);
    const best = at(1).monthsAbove;
    for (let s = 1; s <= HORIZON; s++) {
      const f = at(s);
      if (f.monthsAbove <= best) {
        latestStart = s;
        latestStartLowestCash = f.lowestCash;
        latestStartReserveBreach = f.firstReserveBreach;
      }
    }
  }
  return {
    growthId: growth.id,
    optionId: option.id as OptionId,
    growth,
    clientsNow: initialClients(r.inputs),
    byOption,
    noHire,
    selected: byOption[option.id as OptionId],
    window: {
      heuristic: planningWindow(noHire.firstPressure, lead, ramp),
      earliestJoin,
      pressureBeforeJoin: noHire.firstPressure !== null && noHire.firstPressure < earliestJoin,
      latestStart,
      latestStartLowestCash,
      latestStartReserveBreach,
    },
    revenueKnown: r.revenueKnown,
    moneyKnown: r.moneyKnown && r.revenueKnown,
    moneyMissing: r.moneyMissing,
    illustrative: r.illustrative,
    workflowChecked: p.workflowChecked,
    threshold: r.inputs.threshold,
    reserve: r.inputs.reserve,
    lead,
    ramp,
  };
}

const months = (n: number) => `${n === 1 ? "one" : n === 2 ? "two" : n === 3 ? "three" : n}-month`;
const pctText = (v: number) => `${Math.round(v * 100)}%`;

/** The decision card: what the forecast says and why, in plain words. Never "hire now". */
export function decision(a: Analysis) {
  const th = pctText(a.threshold);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const nh = a.noHire;
  const label = OPTION_LABELS[a.optionId];
  const first = nh.months.find((m) => m.pressure);
  let headline: string;
  if (!first) headline = `Current-team work stays under your ${th} planning threshold for 12 months in the ${a.growth.label.toLowerCase()} case.`;
  else if (first.noCapacity) headline = `There’s no available capacity from Month ${first.month}: work is forecast with no coordinator hours to do it.`;
  else headline = `Current-team work exceeds your ${th} planning threshold in Month ${first.month}.`;

  if (first) {
    if (a.window.pressureBeforeJoin)
      reasons.push(
        `Pressure arrives before any hire could join (Month ${a.window.earliestJoin} at the earliest, after a ${months(a.lead)} search). An interim plan is needed: temporary help, pacing intake, repairing a process, or talking with Trilogy Care.`,
      );
    else if (a.window.heuristic !== null && a.window.heuristic <= 1)
      reasons.push(`A ${months(a.lead)} search and ${months(a.ramp)} ramp make recruitment planning timely now.`);
    else if (a.window.heuristic !== null)
      reasons.push(
        `With a ${months(a.lead)} search and ${months(a.ramp)} ramp, recruitment planning would need to start by about Month ${a.window.heuristic}.`,
      );
    if (a.window.latestStart !== null && a.window.latestStart > 1)
      reasons.push(`Simulated for ${label}: starting recruitment as late as Month ${a.window.latestStart} does no worse on capacity than starting in Month 1.`);
    else if (a.window.latestStart === 1) reasons.push(`Simulated for ${label}: starting recruitment any later than Month 1 adds months above the threshold.`);
  }

  const s = a.selected;
  if (a.optionId !== "current") {
    if (s.monthsAbove === 0) reasons.push(`${label} keeps work under the threshold in this case.`);
    else reasons.push(`${label} still leaves ${s.monthsAbove} month${s.monthsAbove === 1 ? "" : "s"} above the threshold in this case.`);
    if (a.revenueKnown) {
      const diff = s.operating12 - nh.operating12;
      if (Math.abs(diff) >= 1)
        reasons.push(
          `Over 12 months it ${diff < 0 ? "reduces" : "adds to"} operating result by ${dollars(Math.abs(diff))} compared with keeping the current team.`,
        );
    }
  } else if (first) {
    reasons.push(`Keeping the current team leaves ${nh.monthsAbove} month${nh.monthsAbove === 1 ? "" : "s"} above the threshold.`);
    if (a.revenueKnown && nh.operating12 > 0)
      warnings.push(`Its operating result is positive (${dollars(nh.operating12)} over 12 months), but that doesn’t make the workload safe.`);
  }

  if (a.optionId === "workflow" && !a.workflowChecked)
    warnings.push("The workflow saving is hypothetical. Don’t rely on it until you’ve checked it protects required tasks, contact duties and outcomes.");

  if (!a.revenueKnown) warnings.push("Revenue unknown: enter your agreement income to see operating result, cash and affordability.");
  else if (!a.moneyKnown) warnings.push("Costs or cash are incomplete, so cash and the reserve aren’t checked yet.");
  else {
    if (s.firstReserveBreach !== null)
      warnings.push(
        `Cash falls below your ${dollars(a.reserve)} reserve in Month ${s.firstReserveBreach}, with a low of ${dollars(s.lowestCash)} in Month ${s.lowestCashMonth}.`,
      );
    if (s.lowestCash < 0) warnings.push(`Cash goes negative (${dollars(s.lowestCash)}).`);
    if (a.illustrative) warnings.push("Financial figures are illustrative: the income isn’t marked verified against your agreement.");
  }

  const unknowns = [
    ...(a.revenueKnown ? [] : ["Your agreement income"]),
    ...(a.optionId === "workflow" && !a.workflowChecked ? ["Whether the workflow saving protects required work"] : []),
    "Whether recruitment takes as long as assumed",
  ];
  return {
    headline,
    reasons,
    warnings,
    unknowns,
    caveat: "A planning signal under the assumptions shown, not a hiring order or a clients-per-coordinator ratio.",
  };
}

// ---------------------------------------------------------------------------------------------
// What changed after an edit
// ---------------------------------------------------------------------------------------------

export type Change = { label: string; before: string; after: string };

const monthText = (m: number | null) => (m === null ? "None in 12 months" : `Month ${m}`);
const lastOperating = (f: Forecast) => f.months.at(-1)?.operating ?? 0;

/** What moved between two results: the no-hire pressure month, and the selected option's results, cash included. */
export function whatChanged(before: Analysis | null, after: Analysis | null): Change[] {
  if (!before || !after) return [];
  const out: Change[] = [];
  const add = (label: string, b: string, a: string) => b !== a && out.push({ label, before: b, after: a });
  add("No-hire pressure month", monthText(before.noHire.firstPressure), monthText(after.noHire.firstPressure));
  add(`Months above the threshold (${OPTION_LABELS[after.optionId]})`, String(before.selected.monthsAbove), String(after.selected.monthsAbove));
  if (before.revenueKnown && after.revenueKnown) {
    add("Month 12 operating result", dollars(lastOperating(before.selected)), dollars(lastOperating(after.selected)));
    add("12-month operating result", dollars(before.selected.operating12), dollars(after.selected.operating12));
  }
  if (before.moneyKnown && after.moneyKnown) add("Lowest cash", dollars(before.selected.lowestCash), dollars(after.selected.lowestCash));
  return out;
}

// ---------------------------------------------------------------------------------------------
// The monthly table and the workbook: one source, so they always reconcile
// ---------------------------------------------------------------------------------------------

export const MONTHLY_HEADER = [
  "Month",
  "Active participants",
  "New participants",
  "Required hours",
  "Available hours",
  "Utilisation",
  "Above threshold",
  "Earned income",
  "Cash received",
  "Staff costs",
  "Other costs",
  "One-off costs",
  "Operating result",
  "Closing cash",
  "Below reserve",
] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;
const UNKNOWN = "Revenue unknown";

/** The monthly rows for one forecast, rounded for display and export only. Income-based cells say "Revenue unknown" when it is. */
export function monthlyRows(f: Forecast, a: Pick<Analysis, "revenueKnown" | "moneyKnown">): (string | number)[][] {
  return f.months.map((m: Month) => [
    m.month,
    round2(m.clients),
    round2(m.newClients),
    round2(m.requiredHours),
    round2(m.availableHours),
    m.utilisation === null ? "No available capacity" : round2(m.utilisation * 100),
    m.pressure ? "Yes" : "No",
    a.revenueKnown ? round2(m.earned) : UNKNOWN,
    a.revenueKnown ? round2(m.received) : UNKNOWN,
    round2(m.staffCost),
    round2(m.otherCost),
    round2(m.oneOff),
    a.revenueKnown ? round2(m.operating) : UNKNOWN,
    a.moneyKnown ? round2(m.closingCash) : UNKNOWN,
    a.moneyKnown ? (m.reserveBreach ? "Yes" : "No") : UNKNOWN,
  ]);
}

export type SheetData = { name: string; header: string[]; rows: (string | number)[][]; widths?: number[] };

const fmtValue = (k: FieldKey, v: number | null) => (v === null ? "Blank" : def(k).pct ? `${round2(v)}%` : v);

/** The workbook's five sheets, for the selected option and case. No participant names or records: aggregate counts only. */
export function workbookSheets(p: Plan, a: Analysis, meta: { name: string; generatedAt: string; version: number | null }): SheetData[] {
  const d = decision(a);
  const money = (v: number) => (a.revenueKnown ? round2(v) : UNKNOWN);
  const cash = (v: number) => (a.moneyKnown ? round2(v) : UNKNOWN);
  return [
    {
      name: "Summary",
      header: ["Item", "Value"],
      widths: [44, 90],
      rows: [
        ["Plan", meta.name],
        ["Kind", p.kind === "example" ? "Fictional example" : "Business plan (private)"],
        ["Saved version", meta.version === null ? "Unsaved" : meta.version],
        ["Growth case", a.growth.label],
        ["Option", OPTION_LABELS[a.optionId]],
        ["Active participants now", round2(a.clientsNow)],
        ["First no-hire pressure month", a.noHire.firstPressure ?? "None in 12 months"],
        ["Months above threshold (option)", a.selected.monthsAbove],
        ["Month 12 operating result (option)", money(lastOperating(a.selected))],
        ["12-month operating result (option)", money(a.selected.operating12)],
        ["Lowest cash (option)", cash(a.selected.lowestCash)],
        ["First month below reserve (option)", a.moneyKnown ? (a.selected.firstReserveBreach ?? "None") : UNKNOWN],
        ["Decision", d.headline],
        ...d.reasons.map((r) => ["Why", r]),
        ...d.warnings.map((w) => ["Warning", w]),
        ["Caveat", d.caveat],
        ["Basis", BASIS_NOTE],
        ...(p.kind === "example" ? [["Fictional", FICTIONAL_NOTICE]] : []),
        ["Generated", meta.generatedAt],
      ],
    },
    {
      name: "Inputs and provenance",
      header: ["Group", "Input", "Value", "Unit", "Status", "Source", "Date"],
      widths: [16, 40, 14, 40, 12, 40, 12],
      rows: [
        ...FIELD_KEYS.map((k) => {
          const pr = p.provenance[k];
          return [
            GROUPS[def(k).group],
            def(k).label,
            fmtValue(k, p.values[k]),
            k === "income" ? INCOME_BASES[p.incomeBasis] : def(k).unit,
            p.values[k] === null ? "" : PROVENANCE[pr?.status ?? "entered"],
            pr?.source ?? "",
            pr?.date ?? "",
          ];
        }),
        ...growthCases(p).map((g) => ["Growth case", g.label, "", g.describe, "", "", ""]),
        ["Hiring", "Workflow saving checked against required work", p.workflowChecked ? "Yes" : "No", "", "", "", ""],
        ...p.classifications.map((c, i) => [
          "Caseload",
          `Support at Home classification ${i + 1} (recorded only)`,
          c === null ? "Blank" : c,
          "participants",
          "",
          "",
          "",
        ]),
      ],
    },
    {
      name: "Monthly forecast",
      header: [...MONTHLY_HEADER].map((h) => (h === "Utilisation" ? "Utilisation (%)" : h)),
      widths: [8, 12, 12, 12, 12, 14, 10, 14, 14, 12, 12, 12, 14, 14, 10],
      rows: monthlyRows(a.selected, a),
    },
    {
      name: "Option comparison",
      header: [
        "Option",
        "Months above threshold",
        "First month above",
        "12-month operating result",
        "Lowest cash",
        "Lowest cash month",
        "First month below reserve",
        "Note",
      ],
      widths: [20, 12, 12, 16, 14, 10, 14, 60],
      rows: OPTION_IDS.map((id) => {
        const f = a.byOption[id];
        return [
          OPTION_LABELS[id],
          f.monthsAbove,
          f.firstPressure ?? "None",
          money(f.operating12),
          cash(f.lowestCash),
          a.moneyKnown ? f.lowestCashMonth : UNKNOWN,
          a.moneyKnown ? (f.firstReserveBreach ?? "None") : UNKNOWN,
          id === "workflow" && !a.workflowChecked ? "Hypothetical: not checked against required work" : "",
        ];
      }),
    },
    {
      name: "Assumptions and model version",
      header: ["Item", "Detail"],
      widths: [36, 110],
      rows: [
        ["Model version", MODEL_VERSION],
        ["Calculator version", PLANNER_VERSION],
        ["Basis", BASIS_NOTE],
        ["Participants", "Active participants each month = last month + new − exits, never below zero. Starts and exits are counted once a month."],
        [
          "Required hours",
          "Recurring hours by work band × case complexity × (1 − workflow saving, from the month it starts) + new participants × onboarding hours + review and escalation hours.",
        ],
        ["Available hours", "Paid hours a week × 52 ÷ 12 × available share × participant-work share × (current FTE + added FTE × ramp)."],
        ["Utilisation", "Required ÷ available hours. With no available hours and work to do: no available capacity, not a percentage."],
        ["Above threshold", "Required hours above available hours × your planning threshold."],
        [
          "Earned income",
          p.incomeBasis === "fixed-monthly" ? "The agreement’s fixed monthly amount." : "Active participants × the agreement’s income per participant.",
        ],
        ["Cash received", "Earned income after the payment lag, plus each opening receivable once, in the month it’s due."],
        ["Staff costs", "Current FTE × loaded cost, plus a hire’s full loaded cost from the month they join (while their capacity ramps)."],
        ["One-off costs", "Recruitment and setup when recruitment starts; workflow setup the month before the saving starts. Each once."],
        ["Operating result", "Earned income − staff costs − cost per participant − fixed overhead − owner remuneration − one-off costs."],
        ["Closing cash", "Opening cash + cash received − the same costs. Below reserve when under your minimum reserve."],
        [
          "Growth cases",
          growthCases(p)
            .map((g) => g.describe)
            .join(" "),
        ],
        [
          "Planning window",
          "Heuristic: first no-hire pressure month − lead − ramp + 1. Checked by simulating each recruitment start month for the selected option.",
        ],
        ["Income", FUNDING_NOTE],
        [
          "Not included",
          "No participant names or records, payroll, banking or contract changes. This tool doesn’t hire, assign participants or change an agreement.",
        ],
      ],
    },
  ];
}
