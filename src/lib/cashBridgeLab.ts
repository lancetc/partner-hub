import {
  calculate,
  cleanInputs,
  cleanScenario,
  DEFINITIONS_VERSION,
  isDate,
  mergeScenario,
  money,
  validateInputs,
  type CashInputs,
  type CashResult,
  type Num,
  type Scenario,
} from "./cashBridge";

/*
  The 90-Day Cash Bridge block ("Can we fund the next 90 days?", docs/cash-bridge.md): Maya's next 90 days, worked
  through as a Magazine feature. Growth looks healthy and a first guess; the timing reveal (evidence cards placed on a
  timeline: earned, invoiced and received kept apart); a start moves; the cash low point, read from the dated ledger;
  choices with consequences (sensitivity cases and actions, with the capacity guardrail); the Day 30 check-in, where
  actuals replace estimates only by a deliberate update; then the debrief and a learning 90-Day Funding Decision
  Sheet. Figures go through the shared model in lib/cashBridge; this file holds the case, the learner's state and the
  rubric.

  The rubric looks at timing, arithmetic interpretation, source quality, scenario comparison, service continuity and
  the review plan. It never scores the cheapest staffing option. A critical flag (closing the gap by withholding or
  delaying agreed essential service) stands above any total.

  The learner's copy hides each card's reviewed stage, the options' feedback, levels and flags, the decisions'
  outcomes, which low-date reading is flagged, the first guess's likely answer and the debrief: those come from the
  server once the attempt is finished.
*/

export const LAB_VERSION = "cash-bridge-lab-1";
export const RUBRIC_VERSION = "cash-bridge-rubric-1";

export const DIMENSIONS = {
  timing: "Timing",
  arithmetic: "Arithmetic interpretation",
  sources: "Source quality",
  scenarios: "Scenario comparison",
  continuity: "Service continuity",
  review: "Review plan",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  cutCare: "Closed the cash gap by withholding or delaying an agreed essential service",
  doubleCount: "Counted the same fee once when invoiced and again when received",
  publicFunding: "Treated the pooled 10% care-management funding as the partner’s own income",
  monthEndPayroll: "Placed a fortnightly payroll at month-end instead of its actual pay date",
  weeklyView: "Read the low point from the end-of-week chart instead of the dated ledger",
  ignoredBill: "Ignored a known payment because the margin stayed positive",
  hireNoCapacity: "Changed the hire date without checking onboarding capacity and participant commitments",
  prospectAsCash: "Treated a prospect awaiting allocation as cash already secured",
  notYetEarned: "Counted a fee before its earning condition was met",
  freeCredit: "Assumed a credit limit is free, approved or permanently available",
  guarantee: "Treated the forecast as a guarantee, with no date to check actual receipts",
} as const;
export type FlagId = keyof typeof FLAGS;
/** Flags no score can offset. */
export const CRITICAL: readonly FlagId[] = ["cutCare"];

export const CARD_STAGES = {
  referral: "A referral or enquiry: no agreement yet",
  allocation: "Approved, waiting for a funding allocation: not secured",
  start: "A service start: the work begins",
  earned: "A fee earned under the agreement: not cash yet",
  invoiced: "A remittance advice or invoice: not cash yet",
  received: "Cash received in the bank",
  paid: "Cash paid out",
  notIncome: "Not the partner business’s money",
} as const;
export type CardStage = keyof typeof CARD_STAGES;
export const STAGE_ORDER = Object.keys(CARD_STAGES) as CardStage[];

export type Option = {
  id: string;
  text: string;
  /** Hidden from learners until the debrief. */
  feedback: string;
  levels: Partial<Record<Dim, Level>>;
  flags: FlagId[];
};
export type Decision = Option & { outcome: string };

/** A piece of evidence to place on the timeline. */
export type Card = {
  id: string;
  title: string;
  text: string;
  /** Where it sits on the timeline ("" for something with no date). */
  date: string;
  answer: { stage: CardStage; cash: boolean };
  feedback: string;
};

/** A sensitivity case or an action the learner can switch on. One per group at a time. */
export type ScenarioOption = {
  id: string;
  label: string;
  kind: "sensitivity" | "action";
  group: string;
  /** What changes, in words: the items named. */
  describe: string;
  /** The capacity, quality or cost note that goes with it. */
  note: string;
  patch: Scenario;
};

export type CashBridgeLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  definitionsVersion: string;
  story: {
    /** The Care Partner principal: a recurring character from the library. */
    character: string;
    role: string;
    situation: string;
    /** Ava's optional transmission. Readers without video or voice lose nothing without it. */
    transmission: { who: string; text: string };
    growth: string;
    reveal: string;
    slip: string;
    lowPoint: string;
    choices: string;
    checkIn: string;
    /** Ava returns at the review point (optional). */
    avaReturn: string;
    dilemma: string;
  };
  /** The fictional agreement excerpt: every line the fee logic uses. */
  agreement: { title: string; lines: string[] };
  /** What the Hiring Runway's monthly plan says: the margin view, before the dates. */
  margin: string[];
  inputs: CashInputs;
  options: ScenarioOption[];
  /** The delayed-receipt case every learner tests. */
  mustTest: string;
  /** The Day 30 actuals: applied only when the learner chooses to. */
  actuals: { text: string; patch: Scenario };
  /** A short worked example of the rule, with its own figures, and the receipt that moves. */
  example: { text: string; inputs: CashInputs; moveId: string; moveTo: string };
  prediction: {
    prompt: string;
    options: { id: string; text: string; likely: boolean }[];
    hardestPrompt: string;
    hardest: { id: string; date: string; text: string }[];
  };
  cards: Card[];
  slip: { prompt: string; options: Option[] };
  lowPoint: { prompt: string; requiredPrompt: string; options: (Option & { date: string })[] };
  explanations: Option[];
  decisions: Decision[];
  review: { prompt: string; options: Option[] };
  debrief: string;
  followUp: string;
  links: { label: string; href: string; why: string }[];
  sources: { title: string; url: string }[];
  /** Why this block suits the problem (PRD section 9): the author accepts, edits or rejects it, versioned with the story. */
  rationale: {
    theme: string;
    themeOwner: string;
    audience: string;
    behaviour: string;
    whyFit: string;
    alternatives: string;
    reuse: string;
    measure: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  approval: {
    owner: string;
    finance: string;
    operations: string;
    quality: string;
    partnerships: string;
    privacy: string;
    partnerReps: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** One story beat at a time. 6 is the debrief. */
export const STEPS = [
  "Growth looks healthy",
  "The timing reveal",
  "A start moves",
  "The cash low point",
  "Choices with consequences",
  "Day 30 check-in",
  "Funding Decision Sheet",
] as const;
export const LAST = STEPS.length - 1;

export type CardAnswer = { stage: CardStage | ""; cash: boolean | null };
export type CashState = {
  stage: number;
  prediction: { cover: string; hardest: string } | null;
  cards: Record<string, CardAnswer>;
  slip: string;
  /** The learner's reading of the low point: settled once made. */
  low: { option: string; required: Num } | null;
  /** Opened: "week:8", "date:2027-01-28", "view:table", "view:capacity", "example:moved". */
  inspected: string[];
  /** Options switched on now. */
  tried: string[];
  /** Every option ever switched on: kept. */
  tested: string[];
  explanation: string;
  decision: string;
  /** The Day 30 actuals were applied, deliberately. */
  actuals: boolean;
  review: string;
  retries: number;
};

export const emptyState = (): CashState => ({
  stage: 0,
  prediction: null,
  cards: {},
  slip: "",
  low: null,
  inspected: [],
  tried: [],
  tested: [],
  explanation: "",
  decision: "",
  actuals: false,
  review: "",
  retries: 0,
});

const pick = (v: unknown, list: { id: string }[]) => (typeof v === "string" && list.some((x) => x.id === v) ? v : "");

/** One option per group: a later one replaces an earlier one in the same group. */
export function oneEach(d: Pick<CashBridgeLabData, "options">, ids: string[]) {
  const out: string[] = [];
  for (const id of ids) {
    const o = d.options.find((x) => x.id === id);
    if (!o) continue;
    const clash = out.findIndex((x) => d.options.find((y) => y.id === x)?.group === o.group);
    if (clash >= 0) out.splice(clash, 1);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function cleanState(d: CashBridgeLabData, v: unknown): CashState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 80) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 60)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const l = o.low && typeof o.low === "object" ? (o.low as Record<string, unknown>) : null;
  const cards: Record<string, CardAnswer> = {};
  const cardIds = new Set(d.cards.map((c) => c.id));
  for (const [k, c] of Object.entries((o.cards && typeof o.cards === "object" ? o.cards : {}) as Record<string, unknown>)) {
    if (!cardIds.has(k) || !c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    cards[k] = {
      stage: typeof x.stage === "string" && x.stage in CARD_STAGES ? (x.stage as CardStage) : "",
      cash: typeof x.cash === "boolean" ? x.cash : null,
    };
  }
  const options = new Set(d.options.map((x) => x.id));
  const req = l?.required;
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(LAST, o.stage)) : 0,
    prediction: p ? { cover: pick(p.cover, d.prediction.options), hardest: pick(p.hardest, d.prediction.hardest) } : null,
    cards,
    slip: pick(o.slip, d.slip.options),
    low: l
      ? {
          option: pick(l.option, d.lowPoint.options),
          required: typeof req === "number" && Number.isFinite(req) && req >= 0 && req <= 10_000_000 ? Math.round(req * 100) / 100 : null,
        }
      : null,
    inspected: ids(o.inspected, 120),
    tried: oneEach(
      d,
      ids(o.tried).filter((x) => options.has(x)),
    ),
    tested: [...new Set(ids(o.tested).filter((x) => options.has(x)))],
    explanation: pick(o.explanation, d.explanations),
    decision: pick(o.decision, d.decisions),
    actuals: o.actuals === true,
    review: pick(o.review, d.review.options),
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** The scenario the learner has on now: the options switched on, and the Day 30 actuals once applied. */
export function currentScenario(d: Pick<CashBridgeLabData, "options" | "actuals">, s: Pick<CashState, "tried" | "actuals">): Scenario {
  return mergeScenario([...s.tried.map((id) => d.options.find((o) => o.id === id)?.patch ?? {}), s.actuals ? d.actuals.patch : {}]);
}

const testedOf = (d: CashBridgeLabData, s: CashState) => s.tested.filter((x) => d.options.some((o) => o.id === x));

/** What's still needed before the attempt can finish. */
export function finishProblems(d: CashBridgeLabData, s: CashState): string[] {
  const out: string[] = [];
  if (!s.prediction || !s.prediction.cover || !s.prediction.hardest) out.push("Make your first guess.");
  const open = d.cards.filter((c) => !s.cards[c.id]?.stage || s.cards[c.id]?.cash === null);
  if (open.length) out.push(`Place every piece of evidence on the timeline (${open.length} still to do).`);
  if (!s.slip) out.push("Say how the moved start changes the forecast.");
  if (!s.low || !s.low.option) out.push("Find the cash low point.");
  if (!s.inspected.some((x) => x.startsWith("week:") || x.startsWith("date:"))) out.push("Open a week or a date on the cash bridge.");
  if (!s.tested.includes(d.mustTest)) out.push("Test the delayed-receipt case.");
  if (testedOf(d, s).length < 2) out.push("Test at least two cases or options.");
  if (!s.decision) out.push("Choose what Maya does.");
  if (!s.explanation) out.push("Choose how you’d explain it.");
  if (!s.actuals) out.push("Replace the estimates with the Day 30 actuals.");
  if (!s.review) out.push("Answer the Day 30 check-in.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type CashDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string; critical: boolean }[];
  unsafe: boolean;
  slip: { text: string; feedback: string };
  decision: { text: string; feedback: string; outcome: string };
  explanation: { text: string; feedback: string };
  review: { text: string; feedback: string };
  cards: { id: string; title: string; yours: CardAnswer; answer: Card["answer"]; feedback: string; matched: boolean; cashMatched: boolean }[];
  low: {
    yours: string;
    yourDate: string;
    yourRequired: Num;
    feedback: string;
    date: string;
    cents: number;
    required: number;
    additional: number | null;
    matched: boolean;
  };
  prediction: { cover: string; hardest: string; hardestDate: string; likely: string[] };
  tested: string[];
  result: { low: number; lowDate: string; required: number; additional: number | null; belowReserve: number; intraday: number; intradayDate: string };
  summary: string;
  followUp: string;
  versions: { lab: string; story: string; rubric: string; model: string; definitions: string };
};

const lower = (...xs: (Level | undefined)[]): Level | undefined => {
  const ys = xs.filter((x): x is Level => x !== undefined);
  return ys.length ? (Math.min(...ys) as Level) : undefined;
};
const band = (share: number): Level => (share >= 0.85 ? 3 : share >= 0.65 ? 2 : share >= 0.4 ? 1 : 0);

export function buildDebrief(d: CashBridgeLabData, s: CashState, modelVersion: string): CashDebrief {
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;
  const slip = find(d.slip.options, s.slip);
  const decision = find(d.decisions, s.decision);
  const explanation = find(d.explanations, s.explanation);
  const review = find(d.review.options, s.review);
  const lowOpt = d.lowPoint.options.find((x) => x.id === s.low?.option);
  const base = calculate(d.inputs);
  const cards = d.cards.map((c) => {
    const yours = s.cards[c.id] ?? { stage: "" as const, cash: null };
    return {
      id: c.id,
      title: c.title,
      yours,
      answer: c.answer,
      feedback: c.feedback,
      matched: yours.stage === c.answer.stage,
      cashMatched: yours.cash === c.answer.cash,
    };
  });
  const derived: FlagId[] = [];
  for (const c of cards) {
    const saysCash = c.yours.cash === true || c.yours.stage === "received";
    if (c.answer.stage === "invoiced" && saysCash) derived.push("doubleCount");
    if ((c.answer.stage === "allocation" || c.answer.stage === "referral") && (saysCash || c.yours.stage === "earned")) derived.push("prospectAsCash");
    if (c.answer.stage === "notIncome" && (saysCash || c.yours.stage === "earned")) derived.push("publicFunding");
    if (c.answer.stage === "start" && (saysCash || c.yours.stage === "earned")) derived.push("notYetEarned");
  }
  const hireGroups = new Set(d.options.filter((o) => o.group === "hire").map((o) => o.id));
  if (s.tested.some((x) => hireGroups.has(x)) && !s.inspected.includes("view:capacity")) derived.push("hireNoCapacity");
  const flagIds = [...new Set([...slip.flags, ...(lowOpt?.flags ?? []), ...decision.flags, ...explanation.flags, ...review.flags, ...derived])];
  const unsafe = flagIds.some((f) => CRITICAL.includes(f));
  const stageShare = cards.filter((c) => c.matched).length / Math.max(1, cards.length);
  const cashShare = cards.filter((c) => c.cashMatched).length / Math.max(1, cards.length);
  const lowMatched = lowOpt?.date === base.low.date;
  const req = s.low?.required ?? null;
  const reqLevel: Level =
    req === null
      ? 0
      : Math.abs(Math.round(req * 100) - base.required) <= 100
        ? 3
        : Math.abs(Math.round(req * 100) - base.required) <= base.required * 0.1
          ? 2
          : 1;
  const tested = testedOf(d, s);
  const levels: Record<Dim, Level> = {
    timing: lower(band(stageShare), lowMatched ? 3 : 1, slip.levels.timing) ?? 0,
    arithmetic: lower(reqLevel, explanation.levels.arithmetic) ?? 0,
    sources: lower(band(cashShare), slip.levels.sources, review.levels.sources) ?? 0,
    scenarios: lower(tested.length >= 3 ? 3 : tested.length >= 2 ? 2 : 1, decision.levels.scenarios, explanation.levels.scenarios) ?? 1,
    continuity: unsafe ? 0 : (lower(decision.levels.continuity, explanation.levels.continuity) ?? 1),
    review: lower(review.levels.review, decision.levels.review) ?? 1,
  };
  const why: Record<Dim, string> = {
    timing:
      `You placed ${cards.filter((c) => c.matched).length} of ${cards.length} pieces of evidence at the reviewed stage, and ${lowMatched ? "found the dated low point" : "read the low point from a different date"}. ${slip.feedback}`.trim(),
    arithmetic:
      req === null
        ? `You didn’t say how much opening cash the plan needs. ${explanation.feedback}`.trim()
        : `You said ${money(Math.round(req * 100))}; the ledger needs ${money(base.required)}. ${explanation.feedback}`.trim(),
    sources:
      `You said correctly whether the bank balance moves for ${cards.filter((c) => c.cashMatched).length} of ${cards.length} pieces of evidence. ${review.feedback}`.trim(),
    scenarios: `You tested ${tested.length} ${tested.length === 1 ? "case or option" : "cases and options"}. ${decision.feedback}`.trim(),
    continuity: unsafe ? "The gap was closed by holding back agreed essential service. No score offsets that." : decision.feedback,
    review: review.feedback,
  };
  const hardest = d.prediction.hardest.find((x) => x.id === s.prediction?.hardest);
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    flags: flagIds.map((id) => ({ id, text: FLAGS[id], critical: CRITICAL.includes(id) })).sort((a, b) => Number(b.critical) - Number(a.critical)),
    unsafe,
    slip: { text: slip.text, feedback: slip.feedback },
    decision: { text: decision.text, feedback: decision.feedback, outcome: decision.outcome },
    explanation: { text: explanation.text, feedback: explanation.feedback },
    review: { text: review.text, feedback: review.feedback },
    cards,
    low: {
      yours: lowOpt?.text ?? "",
      yourDate: lowOpt?.date ?? "",
      yourRequired: req,
      feedback: lowOpt?.feedback ?? "",
      date: base.low.date,
      cents: base.low.cents,
      required: base.required,
      additional: base.additional,
      matched: lowMatched,
    },
    prediction: {
      cover: d.prediction.options.find((x) => x.id === s.prediction?.cover)?.text ?? "",
      hardest: hardest?.text ?? "",
      hardestDate: hardest?.date ?? "",
      likely: d.prediction.options.filter((x) => x.likely).map((x) => x.text),
    },
    tested: tested.map((id) => d.options.find((o) => o.id === id)!.label),
    result: {
      low: base.low.cents,
      lowDate: base.low.date,
      required: base.required,
      additional: base.additional,
      belowReserve: base.belowReserve.days,
      intraday: base.intraday.cents,
      intradayDate: base.intraday.date,
    },
    summary: d.debrief,
    followUp: d.followUp,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion, definitions: d.definitionsVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);

/** The PRD's worked fixture, which every case's worked example must reproduce. */
function exampleProblems(d: CashBridgeLabData, where: string) {
  const out: string[] = [];
  if (validateInputs(d.example.inputs).length) return [`${where}: the worked example’s figures don’t validate.`];
  const a = calculate(d.example.inputs);
  const b = calculate(d.example.inputs, mergeScenario([{ actuals: [{ id: d.example.moveId, date: d.example.moveTo, amount: null }] }]));
  if (a.low.cents === b.low.cents && a.required === b.required)
    out.push(`${where}: moving the worked example’s receipt changes nothing, so it can’t teach the rule.`);
  return out;
}

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: CashBridgeLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The 90-Day Cash Bridge block"}”`;
  const errors = validateInputs(d.inputs);
  for (const e of errors) out.push(`${where}: ${e.message}`);
  if (!d.story.character || !d.story.situation || !d.story.growth || !d.story.lowPoint)
    out.push(`${where} needs its story: the principal, the situation, the growth beat and the low point.`);
  if (!d.agreement.lines.length) out.push(`${where} needs the fictional agreement excerpt its fee logic uses.`);
  const fictional = [
    d.inputs.openingSource,
    d.inputs.agreement?.source,
    d.inputs.caseload.source,
    ...d.inputs.events.map((e) => e.source),
    ...d.inputs.hires.map((h) => h.source),
  ];
  if (fictional.some((x) => x && x !== "fictional")) out.push(`${where}: every figure in the story must be labelled fictional.`);
  if (Object.values(d.inputs.statutory).some((v) => v === "")) out.push(`${where}: answer every statutory item (supplied, left out or doesn’t apply).`);
  if (!d.inputs.clients.some((c) => c.certainty === "allocation" || c.certainty === "enquiry"))
    out.push(`${where}: include a start that isn’t secured (an enquiry or a client waiting for allocation), so learners see it makes no receipt.`);
  if (!d.inputs.capacity) out.push(`${where}: the story needs the capacity guardrail, so a moved hire date shows its effect on service.`);
  const opt = new Set(d.options.map((o) => o.id));
  if (!opt.has(d.mustTest)) out.push(`${where}: the delayed-receipt case (${d.mustTest || "not named"}) isn’t one of the options.`);
  if (!d.options.some((o) => o.kind === "sensitivity" && o.patch.delays.length))
    out.push(`${where}: include a sensitivity case where a receipt arrives later.`);
  if (!d.options.some((o) => o.kind === "sensitivity" && o.patch.slips.length)) out.push(`${where}: include a sensitivity case where a start slips.`);
  if (d.options.filter((o) => o.kind === "action").length < 2) out.push(`${where}: include at least two actions to test.`);
  if (!d.options.some((o) => o.group === "hire" && o.patch.hireStarts.length)) out.push(`${where}: include an option that moves the hire date.`);
  for (const o of d.options) if (!o.describe || !o.note) out.push(`${where}: the option “${o.label}” needs what it changes and its note.`);
  if (!d.actuals.text || (!d.actuals.patch.actuals.length && !d.actuals.patch.delays.length)) out.push(`${where}: the Day 30 check-in needs its actuals.`);
  out.push(...exampleProblems(d, where));
  if (d.cards.length < 4) out.push(`${where} needs at least four pieces of evidence for the timeline.`);
  const stages = new Set(d.cards.map((c) => c.answer.stage));
  for (const k of ["earned", "invoiced", "received"] as const)
    if (!stages.has(k)) out.push(`${where}: the timeline should separate earned, invoiced and received income (no “${CARD_STAGES[k]}” card).`);
  for (const c of d.cards) {
    if (!c.feedback) out.push(`${where}: the evidence “${c.title}” needs its feedback.`);
    if (c.date && !isDate(c.date)) out.push(`${where}: the evidence “${c.title}” has a date that isn’t real.`);
  }
  if (d.prediction.options.length < 2 || d.prediction.hardest.length < 2) out.push(`${where}: the first guess needs at least two options for each question.`);
  const lists: [string, Option[]][] = [
    ["moved-start question", d.slip.options],
    ["low-point reading", d.lowPoint.options],
    ["explanation", d.explanations],
    ["decision", d.decisions],
    ["Day 30 check-in", d.review.options],
  ];
  for (const [name, list] of lists) {
    if (list.length < 2) out.push(`${where}: the ${name} needs at least two options.`);
    if (name !== "low-point reading" && !list.some(strong)) out.push(`${where}: the ${name} needs at least one strong, unflagged option.`);
    for (const o of list) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  }
  if (!d.decisions.every((x) => x.outcome)) out.push(`${where}: every decision needs its outcome.`);
  if (!errors.length) {
    const r = calculate(d.inputs);
    if (r.low.cents >= r.reserve) out.push(`${where}: the baseline never goes below the reserve, so there’s nothing to find.`);
    const bucket = r.buckets.find((b) => b.from <= r.low.date && b.to >= r.low.date);
    if (bucket && bucket.to === r.low.date)
      out.push(`${where}: the low point falls on the last day of a week, so the weekly chart can’t hide it. Use a midweek low.`);
    if (!d.lowPoint.options.some((o) => o.date === r.low.date)) out.push(`${where}: none of the low-point readings is the ledger’s low date (${r.low.date}).`);
    if (!r.reliable)
      out.push(
        `${where}: the story’s forecast is incomplete: ${r.limitations
          .filter((l) => l.material)
          .map((l) => l.text)
          .join(" ")}`,
      );
    for (const o of d.options) {
      try {
        calculate(d.inputs, o.patch);
      } catch {
        out.push(`${where}: the option “${o.label}” doesn’t calculate.`);
      }
    }
  }
  return out;
}

export const labApproved = (d: Pick<CashBridgeLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.finance && a.operations && a.quality && a.partnerships && a.privacy && a.partnerReps && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function cashBridgeHardProblems(d: CashBridgeLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d))
    out.push(
      `“${d.title}”: record the owner, Finance and the partner commercial agreement owner, Care Coordination Operations, Quality, Partnerships, privacy and the partner business representatives, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no answer key, feedback, levels, flags, outcomes or debrief. The figures stay: they're the model's. */
export function cashBridgeForReaders<T extends CashBridgeLabData>(b: T): T {
  const plain = <O extends Option>(o: O): O => ({ ...o, feedback: "", levels: {}, flags: [] });
  return {
    ...b,
    prediction: { ...b.prediction, options: b.prediction.options.map((o) => ({ ...o, likely: false })) },
    cards: b.cards.map((c) => ({ ...c, answer: { stage: "start" as const, cash: false }, feedback: "" })),
    slip: { ...b.slip, options: b.slip.options.map(plain) },
    lowPoint: { ...b.lowPoint, options: b.lowPoint.options.map(plain) },
    explanations: b.explanations.map(plain),
    decisions: b.decisions.map((o) => ({ ...plain(o), outcome: "" })),
    review: { ...b.review, options: b.review.options.map(plain) },
    debrief: "",
    followUp: "",
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a case from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const ID = /^[a-zA-Z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const level = (v: unknown): Level | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const levels = (v: unknown) =>
  Object.fromEntries(
    Object.entries(obj(v))
      .filter(([k]) => k in DIMENSIONS)
      .map(([k, x]) => [k, level(x)])
      .filter(([, x]) => x !== undefined),
  ) as Partial<Record<Dim, Level>>;
const flags = (v: unknown) => [...new Set(arr(v).filter((f): f is FlagId => typeof f === "string" && f in FLAGS))];
const RATIONALE_DECISIONS = ["", "accepted", "edited", "rejected"] as const;
const option = (x: unknown, k: number): Option => {
  const p = obj(x);
  return { id: id(p.id, `o${k + 1}`), text: s(p.text, 500), feedback: s(p.feedback, 900), levels: levels(p.levels), flags: flags(p.flags) };
};
const options = (v: unknown, max = 6) => arr(v).slice(0, max).map(option);
const lines = (v: unknown, max = 12) =>
  arr(v)
    .slice(0, max)
    .map((x) => s(x, 400))
    .filter(Boolean);

export function parseCashBridgeLab(o: Raw, where: string, h: ParseHelpers): CashBridgeLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const ex = obj(o.example);
  const lp = obj(o.lowPoint);
  const data: CashBridgeLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    definitionsVersion: s(o.definitionsVersion, 40) || DEFINITIONS_VERSION,
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      situation: s(st.situation, 1400),
      transmission: { who: s(obj(st.transmission).who, 60), text: s(obj(st.transmission).text, 300) },
      growth: s(st.growth, 1000),
      reveal: s(st.reveal, 1000),
      slip: s(st.slip, 1000),
      lowPoint: s(st.lowPoint, 1000),
      choices: s(st.choices, 1000),
      checkIn: s(st.checkIn, 1000),
      avaReturn: s(st.avaReturn, 300),
      dilemma: s(st.dilemma, 300),
    },
    agreement: { title: s(obj(o.agreement).title, 160), lines: lines(obj(o.agreement).lines) },
    margin: lines(o.margin, 8),
    inputs: cleanInputs(o.inputs),
    options: arr(o.options)
      .slice(0, 12)
      .map((x, k) => {
        const p = obj(x);
        return {
          id: id(p.id, `x${k + 1}`),
          label: s(p.label, 120),
          kind: p.kind === "sensitivity" ? ("sensitivity" as const) : ("action" as const),
          group: id(p.group, `g${k + 1}`),
          describe: s(p.describe, 400),
          note: s(p.note, 400),
          patch: cleanScenario(p.patch),
        };
      }),
    mustTest: id(o.mustTest, ""),
    actuals: { text: s(obj(o.actuals).text, 800), patch: cleanScenario(obj(o.actuals).patch) },
    example: { text: s(ex.text, 800), inputs: cleanInputs(ex.inputs), moveId: id(ex.moveId, ""), moveTo: isDate(ex.moveTo) ? ex.moveTo : "" },
    prediction: {
      prompt: s(pr.prompt, 300),
      options: arr(pr.options)
        .slice(0, 6)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `p${k + 1}`), text: s(c.text, 200), likely: c.likely === true };
        }),
      hardestPrompt: s(pr.hardestPrompt, 300),
      hardest: arr(pr.hardest)
        .slice(0, 8)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `h${k + 1}`), date: isDate(c.date) ? c.date : "", text: s(c.text, 200) };
        }),
    },
    cards: arr(o.cards)
      .slice(0, 12)
      .map((x, k) => {
        const c = obj(x);
        const a = obj(c.answer);
        return {
          id: id(c.id, `c${k + 1}`),
          title: s(c.title, 120),
          text: s(c.text, 800),
          date: isDate(c.date) ? c.date : "",
          answer: { stage: typeof a.stage === "string" && a.stage in CARD_STAGES ? (a.stage as CardStage) : "start", cash: a.cash === true },
          feedback: s(c.feedback, 900),
        };
      }),
    slip: { prompt: s(obj(o.slip).prompt, 300), options: options(obj(o.slip).options) },
    lowPoint: {
      prompt: s(lp.prompt, 300),
      requiredPrompt: s(lp.requiredPrompt, 300),
      options: arr(lp.options)
        .slice(0, 6)
        .map((x, k) => ({ ...option(x, k), date: isDate(obj(x).date) ? (obj(x).date as string) : "" })),
    },
    explanations: options(o.explanations),
    decisions: arr(o.decisions)
      .slice(0, 8)
      .map((x, k) => ({ ...option(x, k), outcome: s(obj(x).outcome, 900) })),
    review: { prompt: s(obj(o.review).prompt, 400), options: options(obj(o.review).options) },
    debrief: s(o.debrief, 1800),
    followUp: s(o.followUp, 1200),
    links: arr(o.links)
      .slice(0, 6)
      .map((x) => {
        const l = obj(x);
        return { label: s(l.label, 80), href: s(l.href, 300), why: s(l.why, 300) };
      })
      .filter((l) => l.label && (l.href.startsWith("/") || l.href.startsWith("https://"))),
    sources: arr(o.sources)
      .slice(0, 8)
      .map((x) => ({ title: s(obj(x).title, 200), url: s(obj(x).url, 400) }))
      .filter((x) => x.title && x.url.startsWith("https://")),
    rationale: {
      theme: s(ra.theme, 400),
      themeOwner: s(ra.themeOwner, 120),
      audience: s(ra.audience, 300),
      behaviour: s(ra.behaviour, 400),
      whyFit: s(ra.whyFit, 600),
      alternatives: s(ra.alternatives, 400),
      reuse: s(ra.reuse, 400),
      measure: s(ra.measure, 400),
      decision: RATIONALE_DECISIONS.includes(ra.decision as (typeof RATIONALE_DECISIONS)[number]) ? (ra.decision as (typeof RATIONALE_DECISIONS)[number]) : "",
    },
    approval: {
      owner: s(ap.owner, 120),
      finance: s(ap.finance, 120),
      operations: s(ap.operations, 120),
      quality: s(ap.quality, 120),
      partnerships: s(ap.partnerships, 120),
      privacy: s(ap.privacy, 120),
      partnerReps: s(ap.partnerReps, 120),
      approvedOn: s(ap.approvedOn, 10),
      effectiveFrom: s(ap.effectiveFrom, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!isDate(data.inputs.startDate)) unfinished(`${where} needs its case: the 90 days’ start date and dated cash events.`);
  return data;
}

/** A result for the learner's current scenario, or null if the case doesn't validate. */
export const resultFor = (d: CashBridgeLabData, sc: Scenario): CashResult | null => (validateInputs(d.inputs).length ? null : calculate(d.inputs, sc));
