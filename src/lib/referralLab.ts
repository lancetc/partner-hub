import {
  attribute,
  calculate,
  cleanInputs,
  cohortMonths,
  STAGE_ORDER,
  STAGES,
  validateInputs,
  type ReferralInputs,
  type ReferralRecord,
  type Stage,
} from "./referralJourney";

/*
  The Referral Journey Calculator block ("Which referrals become active clients?", docs/referral-journey.md): three
  fictional local relationships, worked through as a Magazine feature. Enquiry counts alone and a prediction; stage
  cards sorted by the stage at first contact; the same cohort followed through the funnel; time to first service and
  who owns each wait, with the older person's choice at one handoff; effort and continuity; the next move (a revised
  reading, the data point that could change it, one relationship action and one operational fix); a return visit
  with a later cohort; then the debrief and a learning Relationship Review. The figures go through the shared model in
  lib/referralJourney; this file holds the case, the learner's state and the rubric.

  The rubric covers a consistent cohort and denominator, the correct pathway stage, open and delayed records, effort
  and case-mix context, participant choice, and a sensible next action. It never rewards the most introductions or
  pressure to convert. A critical flag (a person waiting for funding counted as lost, an agreement treated as a
  service, pressure on someone's choice) stands above any total.

  The learner's copy hides the prediction's likely answers, the cards' feedback, every option's feedback, levels,
  flags and outcome, and the debrief: those come from the server once the decisions are in. A card's answer is the
  record's own stage at first contact, so it can't drift from the funnel.
*/

export const LAB_VERSION = "referral-lab-1";
export const RUBRIC_VERSION = "referral-rubric-1";

export const DIMENSIONS = {
  cohort: "Consistent cohort and denominator",
  stage: "Correct pathway stage",
  open: "Open and delayed records",
  effort: "Effort and case-mix context",
  choice: "Participant choice",
  action: "A sensible next action",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  mixedCohort: "Divided one period’s starts by another period’s enquiries",
  waitAsLost: "Counted a person waiting for a funding allocation as a lost conversion",
  agreementAsStart: "Treated a signed agreement as a delivered service",
  volumeAsValue: "Judged a relationship by its enquiry count alone",
  inferredStage: "Assumed a person’s funding stage from who referred them",
  pressure: "Pressed a person to choose, or to start, against their own decision",
  blamedReferrer: "Blamed a referrer for a government wait or a service capacity gap",
  rankedSmall: "Ranked a relationship on a sample too small or too young to rank",
  effortAsWaste: "Treated necessary onboarding for urgent or complex care as wasted effort",
  promisedPlace: "Promised a funding place or an immediate service because of who referred",
} as const;
export type FlagId = keyof typeof FLAGS;

export type Option = {
  id: string;
  text: string;
  /** Hidden from learners until the debrief. */
  feedback: string;
  levels: Partial<Record<Dim, Level>>;
  flags: FlagId[];
};
/** Where a chosen action leads: the Local Referral Studio (a placeholder until it exists), or a sibling article. */
export const NEXT_STEPS = {
  studio: "Local Referral Studio",
  coverage: "Is this suburb ready for growth?",
  intake: "Can we take on the next 10 clients?",
} as const;
export type NextStep = keyof typeof NEXT_STEPS | "";
export type Decision = Option & {
  /** What happens next in the story. Hidden until the debrief. */
  outcome: string;
  next: NextStep;
};

/** A stage card: an introduction as it arrived. The answer is the record's own stage at first contact. */
export type Card = { id: string; record: string; text: string; feedback: string };

export type ReferralLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  /** The stage model this case uses: shared, versioned with the model, never rewritten per article. */
  stageModelVersion: string;
  story: {
    /** The Care Partner principal: a fictional character from the library. */
    character: string;
    role: string;
    situation: string;
    /** Ava's optional question. Readers without video or voice lose nothing without it. */
    transmission: { who: string; text: string };
    /** The local relationships, by generic label only: never a real practice, hospital or organisation. */
    relationships: { source: string; label: string; text: string }[];
    /** The older person's perspective at one handoff: choosing a provider is their decision. Anonymous. */
    voice: { who: string; text: string };
    dilemma: string;
  };
  inputs: ReferralInputs;
  /** The cohort months the main comparison uses. */
  period: string[];
  prediction: { prompt: string; options: { id: string; text: string; likely: boolean }[] };
  cards: Card[];
  /** The cohort funnel: a denominator question. */
  denominator: { prompt: string; options: Option[] };
  /** Time to start: reading the open and delayed records. */
  timing: { prompt: string; options: Option[] };
  /** The handoff: the older person's choice. */
  choice: { prompt: string; options: Option[] };
  /** Choose the next move: a revised reading, the data point that could change it, and two actions. */
  revise: { prompt: string; options: Option[] };
  dataPoints: { prompt: string; options: Option[] };
  relationship: Decision[];
  operational: Decision[];
  explanations: Option[];
  /** The return visit: a later as-of date, records that replace or join the case's by id, and later effort. */
  update: { title: string; text: string; asOf: string; period: string[]; records: ReferralRecord[]; effort: ReferralInputs["effort"] };
  followUp: { prompt: string; options: Option[] };
  /** The debrief's summary. Hidden until the decisions are in. */
  debrief: string;
  links: { label: string; href: string; why: string }[];
  /** Where the next step is the Local Referral Studio Work Tool: a labelled placeholder until it exists. */
  studio: { label: string; note: string };
  sources: { title: string; url: string }[];
  /** Why this block suits the problem (PRD section 10): the author accepts, edits or rejects it, versioned with the story. */
  rationale: {
    theme: string;
    themeOwner: string;
    audience: string;
    behaviour: string;
    whyFit: string;
    reuse: string;
    systemFix: string;
    measure: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  approval: {
    owner: string;
    pathway: string;
    intake: string;
    partnerships: string;
    operations: string;
    quality: string;
    privacy: string;
    pilot: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** 0 relationships · 1 prediction · 2 stage cards · 3 funnel · 4 time · 5 effort · 6 next move · 7 return visit · 8 debrief */
export const STEPS = [
  "Three relationships",
  "Make a prediction",
  "The stage cards",
  "The cohort funnel",
  "Time to start",
  "Effort and continuity",
  "Choose the next move",
  "Return visit",
  "Relationship Review",
] as const;
export const LAST = STEPS.length - 1;

export type ReferralState = {
  stage: number;
  prediction: { source: string } | null;
  tags: Record<string, Stage | "">;
  /** Views opened: "funnel:gp", "time:hospital", "effort", "continuity", "table". */
  opened: string[];
  filters: string[];
  denominator: string;
  timing: string;
  choice: string;
  revised: string;
  dataPoint: string;
  relationship: string;
  operational: string;
  explanation: string;
  followUp: string;
  /** After the return visit: a different relationship action, if they'd change it. The first answer is kept. */
  reinterpret: string;
  retries: number;
};

export const emptyState = (): ReferralState => ({
  stage: 0,
  prediction: null,
  tags: {},
  opened: [],
  filters: [],
  denominator: "",
  timing: "",
  choice: "",
  revised: "",
  dataPoint: "",
  relationship: "",
  operational: "",
  explanation: "",
  followUp: "",
  reinterpret: "",
  retries: 0,
});

export function cleanState(d: ReferralLabData, v: unknown): ReferralState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 60) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 80)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const cards = new Set(d.cards.map((c) => c.id));
  const rawTags = (o.tags && typeof o.tags === "object" ? o.tags : {}) as Record<string, unknown>;
  const tags: Record<string, Stage | ""> = {};
  for (const [k, t] of Object.entries(rawTags)) if (cards.has(k)) tags[k] = typeof t === "string" && t in STAGES ? (t as Stage) : "";
  const pick = (list: { id: string }[], x: unknown) => (list.some((y) => y.id === x) ? (x as string) : "");
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(LAST, o.stage)) : 0,
    prediction: p ? { source: pick(d.prediction.options, p.source) } : null,
    tags,
    opened: ids(o.opened),
    filters: ids(o.filters, 12),
    denominator: pick(d.denominator.options, o.denominator),
    timing: pick(d.timing.options, o.timing),
    choice: pick(d.choice.options, o.choice),
    revised: pick(d.revise.options, o.revised),
    dataPoint: pick(d.dataPoints.options, o.dataPoint),
    relationship: pick(d.relationship, o.relationship),
    operational: pick(d.operational, o.operational),
    explanation: pick(d.explanations, o.explanation),
    followUp: pick(d.followUp.options, o.followUp),
    reinterpret: pick(d.relationship, o.reinterpret),
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** What's still needed before the debrief. */
export function finishProblems(d: ReferralLabData, s: ReferralState): string[] {
  const out: string[] = [];
  const has = (list: { id: string }[], v: string) => list.some((x) => x.id === v);
  if (!s.prediction || !s.prediction.source) out.push("Make your prediction first.");
  const untagged = d.cards.filter((c) => !s.tags[c.id]);
  if (untagged.length) out.push(`Sort every stage card (${untagged.length} still to do).`);
  if (!s.opened.some((x) => x.startsWith("funnel:"))) out.push("Open at least one relationship’s cohort funnel.");
  if (!has(d.denominator.options, s.denominator)) out.push("Answer the denominator question.");
  if (!s.opened.some((x) => x.startsWith("time"))) out.push("Look at time to first service.");
  if (!has(d.timing.options, s.timing)) out.push("Say how you’d read the open and delayed enquiries.");
  if (!has(d.choice.options, s.choice)) out.push("Answer the handoff question.");
  if (!s.opened.includes("effort")) out.push("Look at relationship and onboarding effort.");
  if (!s.opened.includes("continuity")) out.push("Look at who is still active at the observation point.");
  if (!has(d.revise.options, s.revised)) out.push("Revise your reading of the relationships.");
  if (!has(d.dataPoints.options, s.dataPoint)) out.push("Choose the data point that could change it.");
  if (!has(d.relationship, s.relationship)) out.push("Choose one relationship action.");
  if (!has(d.operational, s.operational)) out.push("Choose the operational step.");
  if (!has(d.explanations, s.explanation)) out.push("Choose the conclusion you’d give.");
  if (!has(d.followUp.options, s.followUp)) out.push("Answer the return-visit question.");
  return out;
}

/** The inputs at the return visit: records replace or join the case's by id, effort rows likewise, at the later date. */
export function updatedInputs(d: Pick<ReferralLabData, "inputs" | "update">): ReferralInputs {
  const i = structuredClone(d.inputs);
  for (const r of d.update.records) {
    const k = i.records.findIndex((x) => x.id === r.id);
    if (k >= 0) i.records[k] = structuredClone(r);
    else i.records.push(structuredClone(r));
  }
  for (const e of d.update.effort) {
    const k = i.effort.findIndex((x) => x.id === e.id);
    if (k >= 0) i.effort[k] = structuredClone(e);
    else i.effort.push(structuredClone(e));
  }
  if (d.update.asOf) i.asOf = d.update.asOf;
  return i;
}

/** The record's stage at first contact: what a card's sort is compared with. */
export function cardAnswer(d: Pick<ReferralLabData, "inputs">, c: Card): { stage: Stage; source: string } | null {
  const r = d.inputs.records.find((x) => x.id === c.record);
  return r ? { stage: r.initialStage, source: attribute(r).source } : null;
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type ReferralDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string }[];
  answers: { key: string; label: string; text: string; feedback: string }[];
  relationship: { text: string; feedback: string; outcome: string; next: NextStep };
  operational: { text: string; feedback: string; outcome: string; next: NextStep };
  followUp: { text: string; feedback: string; reinterpreted: string; changed: boolean };
  cards: { id: string; text: string; yours: Stage | ""; answer: Stage; feedback: string; matches: boolean }[];
  prediction: { chosen: string; likely: string[] };
  summary: string;
  versions: { lab: string; story: string; rubric: string; model: string; stages: string };
};

const lower = (a: Level | undefined, b: Level | undefined): Level | undefined => (a === undefined ? b : b === undefined ? a : (Math.min(a, b) as Level));
/** Stages before a person can choose a provider: reading one of these as "allocated" assumes funding from the referrer. */
const NOT_YET: Stage[] = ["unknown", "assessment", "waiting"];

export function buildDebrief(d: ReferralLabData, s: ReferralState, modelVersion: string): ReferralDebrief {
  const find = (list: Option[], v: string) => list.find((x) => x.id === v)!;
  const denominator = find(d.denominator.options, s.denominator);
  const timing = find(d.timing.options, s.timing);
  const choice = find(d.choice.options, s.choice);
  const revised = find(d.revise.options, s.revised);
  const dataPoint = find(d.dataPoints.options, s.dataPoint);
  const relationship = d.relationship.find((x) => x.id === s.relationship)!;
  const operational = d.operational.find((x) => x.id === s.operational)!;
  const explanation = find(d.explanations, s.explanation);
  const follow = find(d.followUp.options, s.followUp);
  const again = d.relationship.find((x) => x.id === s.reinterpret);
  const cards = d.cards.map((c) => {
    const a = cardAnswer(d, c);
    const yours = s.tags[c.id] ?? "";
    return { id: c.id, text: c.text, yours, answer: a?.stage ?? ("unknown" as Stage), feedback: c.feedback, matches: Boolean(a && yours === a.stage) };
  });
  const share = cards.length ? cards.filter((c) => c.matches).length / cards.length : 1;
  const tagLevel: Level = share >= 0.85 ? 3 : share >= 0.6 ? 2 : share >= 0.35 ? 1 : 0;
  // A flag from the cards themselves: a person not yet allocated sorted as "allocated, choosing", by who sent them.
  const tagFlags: FlagId[] = cards.some((c) => NOT_YET.includes(c.answer) && c.yours === "allocated") ? ["inferredStage"] : [];
  const all = (k: Dim, ...opts: (Option | undefined)[]) => opts.reduce<Level | undefined>((a, o) => (o ? lower(a, o.levels[k]) : a), undefined);
  const actionNow = again ?? relationship;
  const levels: Record<Dim, Level> = {
    cohort: all("cohort", denominator, revised, explanation) ?? 1,
    stage: lower(tagLevel, all("stage", explanation, dataPoint)) ?? tagLevel,
    open: all("open", timing, follow) ?? 1,
    effort: all("effort", revised, explanation) ?? 1,
    choice: all("choice", choice, relationship) ?? 1,
    action: all("action", actionNow, operational, follow) ?? 1,
  };
  const matched = cards.filter((c) => c.matches).length;
  const why: Record<Dim, string> = {
    cohort: denominator.feedback,
    stage: `Your sort matched the stage at first contact on ${matched} of ${cards.length} cards. ${dataPoint.feedback}`,
    open: timing.feedback,
    effort: revised.feedback,
    choice: choice.feedback,
    action:
      again && again.id !== relationship.id
        ? `You changed your relationship action after the return visit. ${again.feedback} ${operational.feedback}`
        : `${relationship.feedback} ${operational.feedback}`,
  };
  const flags = [
    ...new Set([
      ...denominator.flags,
      ...timing.flags,
      ...choice.flags,
      ...revised.flags,
      ...dataPoint.flags,
      ...relationship.flags,
      ...operational.flags,
      ...explanation.flags,
      ...follow.flags,
      ...(again?.flags ?? []),
      ...tagFlags,
    ]),
  ].map((id) => ({ id, text: FLAGS[id] }));
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    flags,
    answers: [
      { key: "denominator", label: "The denominator", text: denominator.text, feedback: denominator.feedback },
      { key: "timing", label: "The open and delayed enquiries", text: timing.text, feedback: timing.feedback },
      { key: "choice", label: "At the handoff", text: choice.text, feedback: choice.feedback },
      { key: "revised", label: "Your revised reading", text: revised.text, feedback: revised.feedback },
      { key: "dataPoint", label: "What could change it", text: dataPoint.text, feedback: dataPoint.feedback },
      { key: "explanation", label: "Your conclusion", text: explanation.text, feedback: explanation.feedback },
    ],
    relationship: { text: relationship.text, feedback: relationship.feedback, outcome: relationship.outcome, next: relationship.next },
    operational: { text: operational.text, feedback: operational.feedback, outcome: operational.outcome, next: operational.next },
    followUp: { text: follow.text, feedback: follow.feedback, reinterpreted: again?.text ?? "", changed: Boolean(again && again.id !== relationship.id) },
    cards: cards.map((c) => ({ id: c.id, text: c.text, yours: c.yours, answer: c.answer, feedback: c.feedback, matches: c.matches })),
    prediction: {
      chosen: d.prediction.options.find((x) => x.id === s.prediction?.source)?.text ?? "",
      likely: d.prediction.options.filter((x) => x.likely).map((x) => x.text),
    },
    summary: d.debrief,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion, stages: d.stageModelVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: ReferralLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The Referral Journey block"}”`;
  const errors = validateInputs(d.inputs);
  for (const e of errors) out.push(`${where}: ${e.message}`);
  if (d.inputs.mode !== "records") out.push(`${where}: the fictional case uses de-identified rows with dates, so a learner can inspect a real cohort.`);
  if (!d.story.character || !d.story.situation) out.push(`${where} needs its story: the principal and the situation.`);
  if (!d.story.voice.text) out.push(`${where} needs the older person’s perspective at one handoff.`);
  if (!d.period.length) out.push(`${where}: choose the cohort months the comparison uses.`);
  const months = cohortMonths(d.inputs);
  for (const m of d.period) if (!months.includes(m)) out.push(`${where}: the period names ${m}, but no enquiry arrived then.`);
  if (d.prediction.options.length < 2) out.push(`${where}: the prediction needs at least two options.`);
  if (!d.prediction.options.some((x) => x.likely)) out.push(`${where}: mark at least one prediction option as likely.`);
  if (d.cards.length < 4) out.push(`${where} needs at least four stage cards to sort.`);
  for (const c of d.cards) {
    if (!d.inputs.records.some((x) => x.id === c.record)) out.push(`${where}: the card “${c.id}” names an enquiry that isn’t in the case.`);
    if (!c.text) out.push(`${where}: the card “${c.id}” needs its introduction text.`);
    if (!c.feedback) out.push(`${where}: the card “${c.id}” needs its feedback.`);
  }
  if (new Set(d.cards.map((c) => cardAnswer(d, c)?.stage).filter(Boolean)).size < 3)
    out.push(`${where}: the cards should span at least three stages at first contact.`);
  const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);
  for (const [list, name] of [
    [d.denominator.options, "denominator answer"],
    [d.timing.options, "timing answer"],
    [d.choice.options, "handoff answer"],
    [d.revise.options, "revised reading"],
    [d.dataPoints.options, "data point"],
    [d.relationship, "relationship action"],
    [d.operational, "operational step"],
    [d.explanations, "conclusion"],
    [d.followUp.options, "return-visit answer"],
  ] as const) {
    if (list.length < 2) out.push(`${where} needs at least two of each: add another ${name}.`);
    if (!list.some(strong)) out.push(`${where}: at least one ${name} should be a strong, unflagged answer.`);
    for (const o of list) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  }
  if (!d.update.text || (!d.update.records.length && !d.update.effort.length))
    out.push(`${where} needs its return visit: what changed, and the rows it changes.`);
  if (!d.studio.label) out.push(`${where}: name the next step (the Local Referral Studio handoff).`);
  // The point of the case: something to find, read the way the learner will.
  if (!errors.length && d.inputs.mode === "records") {
    const r = calculate(d.inputs, { months: d.period });
    const named = r.sources.filter((x) => x.enquiries > 0 && x.source !== "unknown");
    if (named.length < 2) out.push(`${where} needs at least two relationships with enquiries in the period to compare.`);
    if (!r.stageMixDiffers && !r.sources.some((x) => x.waits.funding > 0))
      out.push(`${where}: no relationship differs in starting stage and nobody waits for funding, so there’s nothing unlike to find.`);
    if (!r.all.continuity.mature) out.push(`${where}: no start is old enough for the observation point, so continuity can’t be read.`);
    const u = updatedInputs(d);
    if (validateInputs(u).length) out.push(`${where}: the return visit doesn’t validate: ${validateInputs(u)[0].message}`);
  }
  return out;
}

export const labApproved = (d: Pick<ReferralLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.pathway && a.intake && a.partnerships && a.operations && a.quality && a.privacy && a.pilot && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function referralHardProblems(d: ReferralLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d))
    out.push(
      `“${d.title}”: record the owner, the referral pathway owner, the intake owner, Partnerships, Care Partner Operations, Quality, privacy and pilot-group reviewers, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no likely answers, card feedback, option feedback, levels, flags, outcomes or debrief. */
export function referralForReaders<T extends ReferralLabData>(b: T): T {
  const bare = <O extends Option>(o: O) => ({ ...o, feedback: "", levels: {}, flags: [] });
  const q = (x: { prompt: string; options: Option[] }) => ({ ...x, options: x.options.map(bare) });
  return {
    ...b,
    prediction: { ...b.prediction, options: b.prediction.options.map((o) => ({ ...o, likely: false })) },
    cards: b.cards.map((c) => ({ ...c, feedback: "" })),
    denominator: q(b.denominator),
    timing: q(b.timing),
    choice: q(b.choice),
    revise: q(b.revise),
    dataPoints: q(b.dataPoints),
    relationship: b.relationship.map((o) => ({ ...bare(o), outcome: "" })),
    operational: b.operational.map((o) => ({ ...bare(o), outcome: "" })),
    explanations: b.explanations.map(bare),
    followUp: q(b.followUp),
    debrief: "",
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
const ID = /^[a-z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const level = (v: unknown): Level | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const levels = (v: unknown) =>
  Object.fromEntries(
    Object.entries(obj(v))
      .filter(([k]) => k in DIMENSIONS)
      .map(([k, x]) => [k, level(x)])
      .filter(([, x]) => x !== undefined),
  ) as Partial<Record<Dim, Level>>;
const flags = (v: unknown) => arr(v).filter((f): f is FlagId => typeof f === "string" && f in FLAGS);
const RATIONALE_DECISIONS = ["", "accepted", "edited", "rejected"] as const;
const MONTH = /^\d{4}-\d{2}$/;
const months = (v: unknown) => [...new Set(arr(v).filter((m): m is string => typeof m === "string" && MONTH.test(m)))].sort().slice(0, 24);

export function parseReferralLab(o: Raw, where: string, h: ParseHelpers): ReferralLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const up = obj(o.update);
  const option = (x: unknown, k: number): Option => {
    const p = obj(x);
    return { id: id(p.id, `o${k + 1}`), text: s(p.text, 600), feedback: s(p.feedback, 900), levels: levels(p.levels), flags: flags(p.flags) };
  };
  const decision = (x: unknown, k: number): Decision => {
    const n = obj(x).next;
    return { ...option(x, k), outcome: s(obj(x).outcome, 900), next: typeof n === "string" && n in NEXT_STEPS ? (n as NextStep) : "" };
  };
  const question = (x: unknown) => ({ prompt: s(obj(x).prompt, 400), options: arr(obj(x).options).slice(0, 6).map(option) });
  const updated = cleanInputs({ mode: "records", records: up.records, effort: up.effort });
  const data: ReferralLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    stageModelVersion: s(o.stageModelVersion, 40) || "referral-stages-1",
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      situation: s(st.situation, 1400),
      transmission: { who: s(obj(st.transmission).who, 60), text: s(obj(st.transmission).text, 300) },
      relationships: arr(st.relationships)
        .slice(0, 6)
        .map((x) => ({ source: s(obj(x).source, 20), label: s(obj(x).label, 80), text: s(obj(x).text, 600) })),
      voice: { who: s(obj(st.voice).who, 120), text: s(obj(st.voice).text, 400) },
      dilemma: s(st.dilemma, 300),
    },
    inputs: cleanInputs(o.inputs),
    period: months(o.period),
    prediction: {
      prompt: s(pr.prompt, 400),
      options: arr(pr.options)
        .slice(0, 8)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `p${k + 1}`), text: s(c.text, 300), likely: c.likely === true };
        }),
    },
    cards: arr(o.cards)
      .slice(0, 16)
      .map((x, k) => {
        const c = obj(x);
        return { id: id(c.id, `c${k + 1}`), record: s(c.record, 40), text: s(c.text, 400), feedback: s(c.feedback, 800) };
      }),
    denominator: question(o.denominator),
    timing: question(o.timing),
    choice: question(o.choice),
    revise: question(o.revise),
    dataPoints: question(o.dataPoints),
    relationship: arr(o.relationship).slice(0, 6).map(decision),
    operational: arr(o.operational).slice(0, 6).map(decision),
    explanations: arr(o.explanations).slice(0, 6).map(option),
    update: {
      title: s(up.title, 120),
      text: s(up.text, 1400),
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(s(up.asOf, 10)) ? s(up.asOf, 10) : "",
      period: months(up.period),
      records: updated.records,
      effort: updated.effort,
    },
    followUp: question(o.followUp),
    debrief: s(o.debrief, 2000),
    links: arr(o.links)
      .slice(0, 6)
      .map((x) => {
        const l = obj(x);
        return { label: s(l.label, 80), href: s(l.href, 300), why: s(l.why, 300) };
      })
      .filter((l) => l.label && (l.href.startsWith("/") || l.href.startsWith("https://"))),
    studio: { label: s(obj(o.studio).label, 160), note: s(obj(o.studio).note, 700) },
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
      reuse: s(ra.reuse, 400),
      systemFix: s(ra.systemFix, 400),
      measure: s(ra.measure, 400),
      decision: RATIONALE_DECISIONS.includes(ra.decision as (typeof RATIONALE_DECISIONS)[number]) ? (ra.decision as (typeof RATIONALE_DECISIONS)[number]) : "",
    },
    approval: {
      owner: s(ap.owner, 120),
      pathway: s(ap.pathway, 120),
      intake: s(ap.intake, 120),
      partnerships: s(ap.partnerships, 120),
      operations: s(ap.operations, 120),
      quality: s(ap.quality, 120),
      privacy: s(ap.privacy, 120),
      pilot: s(ap.pilot, 120),
      approvedOn: s(ap.approvedOn, 10),
      effectiveFrom: s(ap.effectiveFrom, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!data.inputs.records.length && !data.inputs.rows.length) unfinished(`${where} needs its case: the enquiries, their stages and what happened to each.`);
  return data;
}

/** The stage-card choices, in the stage model's order. */
export const STAGE_CHOICES = STAGE_ORDER.map((x) => [x, STAGES[x]] as const);
