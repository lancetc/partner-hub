import {
  calculate,
  cleanInputs,
  DEFINITIONS_VERSION,
  validateInputs,
  type Num,
  type Occurrence,
  type ReliabilityInputs,
  type ReliabilityResult,
} from "./serviceReliability";

/*
  The Service Reliability Calculator block ("What does a missed service cost?", docs/service-reliability.md): a
  fictional month of missed services, worked through as a Magazine feature. Mrs Patel's empty Tuesday and the first
  response; a first guess; the coordinator's log, classified by cause; the repair work, counted once; the repeat,
  read on the reliability timeline; a reliability action tested beside a referral push; a later check; then the
  debrief and a learning Reliability Decision Sheet. The figures go through the shared model in lib/serviceReliability;
  this file holds the case, the learner's state and the rubric.

  The rubric looks at cause classification, a client-centred response, arithmetic interpretation, honest assumptions
  and follow-through. It never scores a profitable answer, how many hours the learner "saved" or retention. A critical
  flag (not escalating an urgent safety concern) stands above any total: a high score can't offset it.

  The learner's copy hides what each card is (the visit's reason and outcome), which log entries repeat a task, the
  prediction's likely answer, the options' feedback, levels and flags, and the debrief: those come from the server once
  the attempt is finished.
*/

export const LAB_VERSION = "reliability-lab-1";
export const RUBRIC_VERSION = "reliability-rubric-1";

export const DIMENSIONS = {
  classification: "Cause classification",
  person: "Client-centred response",
  arithmetic: "Arithmetic interpretation",
  assumptions: "Honest assumptions",
  followThrough: "Follow-through",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  noEscalation: "Didn’t send an urgent safety concern to the escalation process",
  allSupplier: "Counted a cancellation or booking error as a supplier failure",
  bookedAsDelivered: "Treated a booking or an invoice as care delivered",
  transferFailure: "Treated a person choosing another provider as a failed recovery",
  lifetimeValue: "Added a guessed lifetime client value to observed costs",
  doubleCount: "Counted the same coordinator hours as labour saved and as extra revenue",
  profitOverService: "Treated a profitable answer as enough while a visit is still unresolved",
  blameWorker: "Blamed a worker on an uninvestigated report",
  realised: "Declared a modelled effect realised without evidence",
  waited: "Made the person wait on the analysis",
} as const;
export type FlagId = keyof typeof FLAGS;
/** Flags no score can offset. */
export const CRITICAL: readonly FlagId[] = ["noEscalation"];

export const CARD_CHOICES = {
  supplier: "A verified supplier or worker failure",
  booking: "A provider booking or handoff error",
  participant: "The participant’s own cancellation",
  unknown: "Unknown or disputed: keep it visible",
  delivered: "Delivered (late, or by a replacement): not a missed visit",
  notEvidence: "Not evidence that a visit happened (an invoice or a booking)",
} as const;
export type CardChoice = keyof typeof CARD_CHOICES;
export const CHOICE_ORDER = Object.keys(CARD_CHOICES) as CardChoice[];

export type Option = {
  id: string;
  text: string;
  /** Hidden from learners until the debrief. */
  feedback: string;
  levels: Partial<Record<Dim, Level>>;
  flags: FlagId[];
};
export type Decision = Option & { outcome: string };

/** One entry from the coordinator's log, to classify. */
export type Card = {
  id: string;
  title: string;
  text: string;
  /** Where the evidence came from, and its date. */
  evidence: string;
  /** The visit it is (an occurrence id), or "" for something that isn't a visit (an invoice). */
  occurrence: string;
  /** Ask whether it needs the escalation process now. */
  askUrgent: boolean;
  answer: { choice: CardChoice; urgent: boolean | null };
  feedback: string;
};

/** A line of the coordinator's records. Some lines record the same task twice. */
export type LogEntry = {
  id: string;
  text: string;
  minutes: number;
  /** The unique recovery task it belongs to. */
  task: string;
  /** Hidden from learners: it repeats a task already in the log. */
  duplicate: boolean;
  feedback: string;
};

export type ReliabilityLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  /** The shared event definitions this case uses. */
  definitionsVersion: string;
  story: {
    /** The Care Partner principal: a fictional character from the library. */
    character: string;
    role: string;
    /** The participant whose story it follows: a recurring library character. */
    participant: string;
    situation: string;
    /** Ava's optional opening transmission. Readers without video or voice lose nothing without it. */
    transmission: { who: string; text: string };
    tuesday: string;
    repeat: string;
    investment: string;
    later: string;
    /** The participant's own words at the later check. */
    voice: string;
    dilemma: string;
  };
  inputs: ReliabilityInputs;
  response: { prompt: string; options: Option[] };
  prediction: { prompt: string; countPrompt: string; options: { id: string; text: string; likely: boolean }[] };
  cards: Card[];
  log: { prompt: string; entries: LogEntry[] };
  repeat: { prompt: string; options: Option[] };
  explanations: Option[];
  decisions: Decision[];
  later: { prompt: string; options: Option[] };
  /** The debrief's summary, and the return visit. Hidden until the attempt is finished. */
  debrief: string;
  followUp: string;
  /** Related Work Tools that aren't in the Hub yet: shown as labelled placeholders, never as links. */
  placeholders: { trustCheck: string; networkBuilder: string };
  links: { label: string; href: string; why: string }[];
  sources: { title: string; url: string }[];
  /** Why this block suits the problem (PRD section 11): the author accepts, edits or rejects it, versioned with the story. */
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
    operations: string;
    quality: string;
    clinical: string;
    supplier: string;
    finance: string;
    policy: string;
    partnerships: string;
    privacy: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** One story beat at a time. 7 is the debrief. */
export const STEPS = [
  "The empty Tuesday",
  "Your first guess",
  "More than one incident",
  "The repair work",
  "The repeat",
  "The competing investment",
  "The later check",
  "Decision Sheet",
] as const;
export const LAST = STEPS.length - 1;

export type CardAnswer = { choice: CardChoice | ""; urgent: boolean | null };
export type ReliabilityState = {
  stage: number;
  response: string;
  prediction: { failures: number | null; cost: string } | null;
  cards: Record<string, CardAnswer>;
  /** Log entries: true counts it as its own task, false as a repeat of one already counted. */
  entries: Record<string, boolean>;
  /** Opened: "occ:V10" (a timeline point), "view:table", "leads", "x:backup". */
  inspected: string[];
  tried: string[];
  estimates: Record<string, { reduction: Num }>;
  freedHours: "labour" | "onboarding";
  /** Whether they've ever tested an action: kept once true. */
  changed: boolean;
  repeat: string;
  explanation: string;
  decision: string;
  later: string;
  retries: number;
};

export const emptyState = (): ReliabilityState => ({
  stage: 0,
  response: "",
  prediction: null,
  cards: {},
  entries: {},
  inspected: [],
  tried: [],
  estimates: {},
  freedHours: "labour",
  changed: false,
  repeat: "",
  explanation: "",
  decision: "",
  later: "",
  retries: 0,
});

const pick = (v: unknown, list: { id: string }[]) => (typeof v === "string" && list.some((x) => x.id === v) ? v : "");

export function cleanState(d: ReliabilityLabData, v: unknown): ReliabilityState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 80) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 60)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const cardIds = new Set(d.cards.map((c) => c.id));
  const entryIds = new Set(d.log.entries.map((e) => e.id));
  const actions = new Set(d.inputs.interventions.map((x) => x.id));
  const cards: Record<string, CardAnswer> = {};
  for (const [k, c] of Object.entries((o.cards && typeof o.cards === "object" ? o.cards : {}) as Record<string, unknown>)) {
    if (!cardIds.has(k) || !c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    cards[k] = {
      choice: typeof x.choice === "string" && x.choice in CARD_CHOICES ? (x.choice as CardChoice) : "",
      urgent: typeof x.urgent === "boolean" ? x.urgent : null,
    };
  }
  const entries: Record<string, boolean> = {};
  for (const [k, e] of Object.entries((o.entries && typeof o.entries === "object" ? o.entries : {}) as Record<string, unknown>))
    if (entryIds.has(k) && typeof e === "boolean") entries[k] = e;
  const estimates: ReliabilityState["estimates"] = {};
  for (const [k, e] of Object.entries((o.estimates && typeof o.estimates === "object" ? o.estimates : {}) as Record<string, unknown>)) {
    if (!actions.has(k) || !e || typeof e !== "object") continue;
    const r = (e as Record<string, unknown>).reduction;
    estimates[k] = { reduction: typeof r === "number" && Number.isFinite(r) && r >= 0 && r <= 1 ? r : null };
  }
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(LAST, o.stage)) : 0,
    response: pick(o.response, d.response.options),
    prediction: p
      ? {
          failures: typeof p.failures === "number" && Number.isFinite(p.failures) && p.failures >= 0 && p.failures <= 1000 ? Math.round(p.failures) : null,
          cost: pick(p.cost, d.prediction.options),
        }
      : null,
    cards,
    entries,
    inspected: ids(o.inspected),
    tried: ids(o.tried).filter((x) => actions.has(x)),
    estimates,
    freedHours: o.freedHours === "onboarding" ? "onboarding" : "labour",
    changed: o.changed === true,
    repeat: pick(o.repeat, d.repeat.options),
    explanation: pick(o.explanation, d.explanations),
    decision: pick(o.decision, d.decisions),
    later: pick(o.later, d.later.options),
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** What's still needed before the attempt can finish. */
export function finishProblems(d: ReliabilityLabData, s: ReliabilityState): string[] {
  const out: string[] = [];
  if (!s.response) out.push("Choose Mrs Patel’s immediate response first.");
  if (!s.prediction || !s.prediction.cost) out.push("Make your first guess.");
  const open = d.cards.filter((c) => !s.cards[c.id]?.choice || (c.askUrgent && s.cards[c.id]?.urgent === null));
  if (open.length) out.push(`Classify every entry in the log (${open.length} still to do).`);
  const unmarked = d.log.entries.filter((e) => !(e.id in s.entries));
  if (unmarked.length) out.push(`Mark every line of the repair work (${unmarked.length} still to do).`);
  if (!s.inspected.some((x) => x.startsWith("occ:"))) out.push("Open at least one visit on the reliability timeline.");
  if (!s.repeat) out.push("Answer what the repeat tells Maya.");
  if (!s.changed) out.push("Test at least one reliability action.");
  if (!s.inspected.includes("leads")) out.push("Look at what the referral push would need.");
  if (!s.decision) out.push("Choose what Maya does next.");
  if (!s.explanation) out.push("Choose how you’d explain the trade-off.");
  if (!s.later) out.push("Answer the later check.");
  return out;
}

const OCC_OF: Record<CardChoice, Partial<Occurrence> | null> = {
  supplier: { outcome: "missed", reason: "supplier", verified: true },
  booking: { outcome: "missed", reason: "booking", verified: true },
  participant: { outcome: "missed", reason: "participant", verified: true },
  unknown: { outcome: "unknown", reason: "unknown", verified: false },
  delivered: { outcome: "delivered", reason: "", verified: false },
  notEvidence: null,
};

/**
  The learner's figures now: the case's month with their classification on the visits each card describes, the
  actions they've switched on with their own assumed reduction, and their choice of how freed hours are read.
*/
export function currentInputs(d: ReliabilityLabData, s: Pick<ReliabilityState, "cards" | "tried" | "estimates" | "freedHours">): ReliabilityInputs {
  const i = structuredClone(d.inputs);
  for (const c of d.cards) {
    const a = s.cards[c.id];
    const o = i.occurrences.find((x) => x.id === c.occurrence);
    if (!o) continue;
    // "Delivered" keeps a late or replaced visit as the case has it, with its recorded reason.
    const kept = a?.choice === "delivered" && (o.outcome === "late" || o.outcome === "replaced");
    const patch = a?.choice && !kept ? OCC_OF[a.choice] : null;
    if (patch) Object.assign(o, patch);
    // Only a missed visit is restored later: an unclassified or delivered one keeps no recovery dates here.
    if (o.outcome !== "missed") Object.assign(o, { restored: "", booked: "" });
  }
  i.interventions = i.interventions.map((x) => {
    const est = s.estimates[x.id];
    return { ...x, active: s.tried.includes(x.id), ...(est ? { reduction: est.reduction } : {}) };
  });
  i.freedHours = s.freedHours;
  return i;
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type ReliabilityDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string; critical: boolean }[];
  /** A critical flag: the score doesn't make the practice safe. */
  unsafe: boolean;
  response: { text: string; feedback: string };
  repeat: { text: string; feedback: string };
  decision: { text: string; feedback: string; outcome: string };
  explanation: { text: string; feedback: string };
  later: { text: string; feedback: string };
  cards: { id: string; title: string; yours: CardAnswer; answer: Card["answer"]; feedback: string; matched: boolean; urgentMatched: boolean | null }[];
  entries: { id: string; text: string; counted: boolean | undefined; duplicate: boolean; feedback: string; matched: boolean }[];
  /** Hours: what the learner counted, and the unique tasks. */
  hours: { yours: number; unique: number; logged: number };
  prediction: { failures: number | null; cost: string; likely: string[]; actualSupplier: number; actualMissed: number };
  result: { supplierRate: string; open: number; hours: number; observedDirect: number };
  summary: string;
  followUp: string;
  versions: { lab: string; story: string; rubric: string; model: string; definitions: string };
};

const lower = (...xs: (Level | undefined)[]): Level | undefined => {
  const ys = xs.filter((x): x is Level => x !== undefined);
  return ys.length ? (Math.min(...ys) as Level) : undefined;
};
const band = (share: number): Level => (share >= 0.85 ? 3 : share >= 0.65 ? 2 : share >= 0.4 ? 1 : 0);

export function buildDebrief(d: ReliabilityLabData, s: ReliabilityState, modelVersion: string): ReliabilityDebrief {
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;
  const response = find(d.response.options, s.response);
  const repeat = find(d.repeat.options, s.repeat);
  const decision = find(d.decisions, s.decision);
  const explanation = find(d.explanations, s.explanation);
  const later = find(d.later.options, s.later);
  const cards = d.cards.map((c) => {
    const yours = s.cards[c.id] ?? { choice: "" as const, urgent: null };
    return {
      id: c.id,
      title: c.title,
      yours,
      answer: c.answer,
      feedback: c.feedback,
      matched: yours.choice === c.answer.choice,
      urgentMatched: c.askUrgent && c.answer.urgent !== null ? yours.urgent === c.answer.urgent : null,
    };
  });
  const entries = d.log.entries.map((e) => ({
    id: e.id,
    text: e.text,
    counted: s.entries[e.id],
    duplicate: e.duplicate,
    feedback: e.feedback,
    matched: s.entries[e.id] === !e.duplicate,
  }));
  const derived: FlagId[] = [];
  if (cards.some((c) => c.yours.choice === "supplier" && (c.answer.choice === "participant" || c.answer.choice === "booking"))) derived.push("allSupplier");
  if (cards.some((c) => c.answer.choice === "notEvidence" && c.yours.choice === "delivered")) derived.push("bookedAsDelivered");
  if (cards.some((c) => c.answer.urgent === true && c.yours.urgent === false)) derived.push("noEscalation");
  const flagIds = [...new Set([...response.flags, ...repeat.flags, ...decision.flags, ...explanation.flags, ...later.flags, ...derived])];
  const unsafe = flagIds.some((f) => CRITICAL.includes(f));
  const cardShare = cards.reduce((a, c) => a + (c.matched ? 1 : 0), 0) / Math.max(1, cards.length);
  const entryShare = entries.filter((e) => e.matched).length / Math.max(1, entries.length);
  const levels: Record<Dim, Level> = {
    classification: lower(band(cardShare), explanation.levels.classification) ?? 0,
    person: unsafe ? 0 : (lower(response.levels.person, repeat.levels.person, later.levels.person, decision.levels.person) ?? 1),
    arithmetic: lower(band(entryShare), repeat.levels.arithmetic, explanation.levels.arithmetic) ?? 0,
    assumptions: lower(s.changed ? 3 : 1, explanation.levels.assumptions, decision.levels.assumptions) ?? 1,
    followThrough: lower(decision.levels.followThrough, later.levels.followThrough) ?? 1,
  };
  const why: Record<Dim, string> = {
    classification: `Your classification matched the reviewed one on ${cards.filter((c) => c.matched).length} of ${cards.length} log entries.`,
    person: unsafe ? "An urgent safety concern wasn’t sent to the escalation process. No score offsets that." : `${response.feedback} ${later.feedback}`.trim(),
    arithmetic:
      `You marked ${entries.filter((e) => e.matched).length} of ${entries.length} lines of the repair work as the reviewed ones. ${repeat.feedback}`.trim(),
    assumptions: explanation.feedback,
    followThrough: decision.feedback,
  };
  const base = calculate(d.inputs);
  const pick = (r: ReliabilityResult) => ({
    supplierRate: r.supplierRate.text,
    open: r.recovery.booked + r.recovery.unresolved,
    hours: r.effort.hours,
    observedDirect: r.cost.observedDirect,
  });
  const chosen = d.prediction.options.find((x) => x.id === s.prediction?.cost);
  const logged = d.log.entries.reduce((a, e) => a + e.minutes, 0) / 60;
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    // A critical flag leads the list: it comes before anything else.
    flags: flagIds.map((id) => ({ id, text: FLAGS[id], critical: CRITICAL.includes(id) })).sort((a, b) => Number(b.critical) - Number(a.critical)),
    unsafe,
    response: { text: response.text, feedback: response.feedback },
    repeat: { text: repeat.text, feedback: repeat.feedback },
    decision: { text: decision.text, feedback: decision.feedback, outcome: decision.outcome },
    explanation: { text: explanation.text, feedback: explanation.feedback },
    later: { text: later.text, feedback: later.feedback },
    cards,
    entries,
    hours: {
      yours: Math.round((d.log.entries.filter((e) => s.entries[e.id]).reduce((a, e) => a + e.minutes, 0) / 60) * 100) / 100,
      unique: Math.round((d.log.entries.filter((e) => !e.duplicate).reduce((a, e) => a + e.minutes, 0) / 60) * 100) / 100,
      logged: Math.round(logged * 100) / 100,
    },
    prediction: {
      failures: s.prediction?.failures ?? null,
      cost: chosen?.text ?? "",
      likely: d.prediction.options.filter((x) => x.likely).map((x) => x.text),
      actualSupplier: base.supplierVerified,
      actualMissed: base.outcomes.missed,
    },
    result: pick(base),
    summary: d.debrief,
    followUp: d.followUp,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion, definitions: d.definitionsVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: ReliabilityLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The Service Reliability Calculator block"}”`;
  const errors = validateInputs(d.inputs);
  for (const e of errors) out.push(`${where}: ${e.message}`);
  if (!d.story.character || !d.story.participant || !d.story.situation || !d.story.tuesday)
    out.push(`${where} needs its story: the principal, the participant, the situation and the empty Tuesday.`);
  if (!d.inputs.occurrences.length) out.push(`${where}: the fictional month needs individual visit rows.`);
  if (d.inputs.occurrences.some((o) => o.source !== "fictional")) out.push(`${where}: every visit in the story must be labelled fictional.`);
  if (d.prediction.options.length < 2 || !d.prediction.options.some((x) => x.likely))
    out.push(`${where}: the first guess needs at least two options, one marked likely.`);
  if (d.cards.length < 4) out.push(`${where} needs at least four log entries to classify.`);
  const occ = new Set(d.inputs.occurrences.map((o) => o.id));
  for (const c of d.cards) {
    if (c.occurrence && !occ.has(c.occurrence)) out.push(`${where}: the log entry “${c.title}” names a visit that isn’t in the month.`);
    if (!c.occurrence && c.answer.choice !== "notEvidence") out.push(`${where}: the log entry “${c.title}” needs a visit, unless it isn’t one.`);
    if (!c.feedback) out.push(`${where}: the log entry “${c.title}” needs its feedback.`);
    if (c.askUrgent && c.answer.urgent === null) out.push(`${where}: the log entry “${c.title}” asks about urgency but has no reviewed answer.`);
  }
  const kinds = new Set(d.cards.map((c) => c.answer.choice));
  for (const k of ["supplier", "participant", "booking"] as const)
    if (!kinds.has(k))
      out.push(
        `${where}: the log should include a ${k === "supplier" ? "supplier failure" : k === "participant" ? "participant’s own cancellation" : "booking error"}.`,
      );
  if (!d.cards.some((c) => c.askUrgent && c.answer.urgent)) out.push(`${where}: include one entry where the escalation process comes first.`);
  if (d.log.entries.length < 3 || !d.log.entries.some((e) => e.duplicate))
    out.push(`${where}: the repair work needs at least three lines, one of them a repeat.`);
  const tasks = new Set(d.inputs.tasks.map((t) => t.id));
  for (const e of d.log.entries)
    if (!tasks.has(e.task)) out.push(`${where}: the repair-work line “${e.text.slice(0, 40)}” names a task that isn’t in the month.`);
  const lists: [string, Option[]][] = [
    ["immediate response", d.response.options],
    ["repeat question", d.repeat.options],
    ["explanation", d.explanations],
    ["decision", d.decisions],
    ["later check", d.later.options],
  ];
  for (const [name, list] of lists) {
    if (list.length < 2) out.push(`${where}: the ${name} needs at least two options.`);
    if (!list.some(strong)) out.push(`${where}: the ${name} needs at least one strong, unflagged option.`);
    for (const o of list) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  }
  if (!d.decisions.every((x) => x.outcome)) out.push(`${where}: every decision needs its outcome.`);
  if (!d.inputs.interventions.length) out.push(`${where} needs at least one reliability action to test.`);
  for (const x of d.inputs.interventions) {
    if (x.active) out.push(`${where}: the action “${x.label}” starts switched on. Learners switch actions on themselves.`);
    if (!x.evidence) out.push(`${where}: the action “${x.label}” needs the evidence that would check it.`);
  }
  if (!d.inputs.leads.active) out.push(`${where}: the story needs a referral push to compare.`);
  if (!d.story.voice) out.push(`${where}: the later check needs the participant’s own words.`);
  if (!d.placeholders.trustCheck) out.push(`${where}: name where an individual case goes (the 28-Day Trust Check placeholder).`);
  if (!errors.length) {
    const r = calculate(d.inputs);
    if (!r.supplierVerified) out.push(`${where}: no verified supplier miss, so there’s nothing to find.`);
    if (!r.repeat.issues.some((g) => g.visits >= 2)) out.push(`${where}: the month needs a recurring issue.`);
    if (!r.recovery.cases.some((c) => c.status === "restored") || !r.recovery.cases.some((c) => c.status !== "restored"))
      out.push(`${where}: the month needs both a restored and a still-open visit.`);
    if (!r.effort.partitionOk) out.push(`${where}: the recovery tasks’ categories don’t add up to the total.`);
  }
  return out;
}

export const labApproved = (d: Pick<ReliabilityLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.quality && a.clinical && a.supplier && a.finance && a.policy && a.partnerships && a.privacy && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function reliabilityHardProblems(d: ReliabilityLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d))
    out.push(
      `“${d.title}”: record the owner, Care Coordination Operations, Quality/complaints, clinical governance, supplier management, Finance, the policy owner, Partnerships and privacy reviewers, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no answer key, feedback, levels, flags, outcomes or debrief. */
export function reliabilityForReaders<T extends ReliabilityLabData>(b: T): T {
  // The visits the cards describe carry the reviewed reason and outcome: the learner supplies their own.
  const asked = new Set(b.cards.map((c) => c.occurrence).filter(Boolean));
  // Recovery dates stay: they aren't the answer, and the page shows them once the learner classifies the visit.
  const hide = (o: Occurrence): Occurrence => (asked.has(o.id) ? { ...o, outcome: "unknown", reason: "", verified: false } : o);
  const plain = (o: Option) => ({ ...o, feedback: "", levels: {}, flags: [] });
  return {
    ...b,
    inputs: { ...b.inputs, occurrences: b.inputs.occurrences.map(hide) },
    prediction: { ...b.prediction, options: b.prediction.options.map((o) => ({ ...o, likely: false })) },
    response: { ...b.response, options: b.response.options.map(plain) },
    cards: b.cards.map((c) => ({ ...c, answer: { choice: "unknown" as const, urgent: null }, feedback: "" })),
    log: { ...b.log, entries: b.log.entries.map((e) => ({ ...e, duplicate: false, feedback: "" })) },
    repeat: { ...b.repeat, options: b.repeat.options.map(plain) },
    explanations: b.explanations.map(plain),
    decisions: b.decisions.map((o) => ({ ...plain(o), outcome: "" })),
    later: { ...b.later, options: b.later.options.map(plain) },
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
const options = (v: unknown) => arr(v).slice(0, 6).map(option);

export function parseReliabilityLab(o: Raw, where: string, h: ParseHelpers): ReliabilityLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const ph = obj(o.placeholders);
  const data: ReliabilityLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    definitionsVersion: s(o.definitionsVersion, 40) || DEFINITIONS_VERSION,
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      participant: s(st.participant, 60),
      situation: s(st.situation, 1400),
      transmission: { who: s(obj(st.transmission).who, 60), text: s(obj(st.transmission).text, 300) },
      tuesday: s(st.tuesday, 1000),
      repeat: s(st.repeat, 1000),
      investment: s(st.investment, 1000),
      later: s(st.later, 1000),
      voice: s(st.voice, 400),
      dilemma: s(st.dilemma, 300),
    },
    inputs: cleanInputs(o.inputs),
    response: { prompt: s(obj(o.response).prompt, 300), options: options(obj(o.response).options) },
    prediction: {
      prompt: s(pr.prompt, 300),
      countPrompt: s(pr.countPrompt, 300),
      options: arr(pr.options)
        .slice(0, 6)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `p${k + 1}`), text: s(c.text, 200), likely: c.likely === true };
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
          evidence: s(c.evidence, 300),
          occurrence: id(c.occurrence, ""),
          askUrgent: c.askUrgent === true,
          answer: {
            choice: typeof a.choice === "string" && a.choice in CARD_CHOICES ? (a.choice as CardChoice) : "unknown",
            urgent: typeof a.urgent === "boolean" ? a.urgent : null,
          },
          feedback: s(c.feedback, 900),
        };
      }),
    log: {
      prompt: s(obj(o.log).prompt, 400),
      entries: arr(obj(o.log).entries)
        .slice(0, 16)
        .map((x, k) => {
          const e = obj(x);
          return {
            id: id(e.id, `l${k + 1}`),
            text: s(e.text, 300),
            minutes: typeof e.minutes === "number" && e.minutes >= 0 && e.minutes <= 600 ? e.minutes : 0,
            task: id(e.task, ""),
            duplicate: e.duplicate === true,
            feedback: s(e.feedback, 600),
          };
        }),
    },
    repeat: { prompt: s(obj(o.repeat).prompt, 300), options: options(obj(o.repeat).options) },
    explanations: options(o.explanations),
    decisions: arr(o.decisions)
      .slice(0, 6)
      .map((x, k) => ({ ...option(x, k), outcome: s(obj(x).outcome, 900) })),
    later: { prompt: s(obj(o.later).prompt, 400), options: options(obj(o.later).options) },
    debrief: s(o.debrief, 1800),
    followUp: s(o.followUp, 1200),
    placeholders: { trustCheck: s(ph.trustCheck, 300), networkBuilder: s(ph.networkBuilder, 300) },
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
      reuse: s(ra.reuse, 400),
      systemFix: s(ra.systemFix, 400),
      measure: s(ra.measure, 400),
      decision: RATIONALE_DECISIONS.includes(ra.decision as (typeof RATIONALE_DECISIONS)[number]) ? (ra.decision as (typeof RATIONALE_DECISIONS)[number]) : "",
    },
    approval: {
      owner: s(ap.owner, 120),
      operations: s(ap.operations, 120),
      quality: s(ap.quality, 120),
      clinical: s(ap.clinical, 120),
      supplier: s(ap.supplier, 120),
      finance: s(ap.finance, 120),
      policy: s(ap.policy, 120),
      partnerships: s(ap.partnerships, 120),
      privacy: s(ap.privacy, 120),
      approvedOn: s(ap.approvedOn, 10),
      effectiveFrom: s(ap.effectiveFrom, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!data.inputs.occurrences.length && !data.inputs.rows.length) unfinished(`${where} needs its case: the month’s visits.`);
  return data;
}
