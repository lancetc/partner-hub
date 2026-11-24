import {
  calculate,
  cleanInputs,
  USES,
  validateInputs,
  type CoverageInputs,
  type CoverageResult,
  type ReasonKind,
  type SupplyRow,
  type Use,
} from "./suburbCoverage";

/*
  The Local Coverage Comparison block ("Is this suburb ready for growth?", docs/suburb-growth.md): three fictional
  local areas, worked through as a Magazine feature. A tempting overview and a prediction; what clients need, by
  service and time; supply cards tagged usable now, potential after verification, unavailable or already committed;
  the coverage comparison; a fragile plan (an absence, and a participant's chosen worker still being checked); two
  decisions (an immediate continuity action and a network-building priority) with the evidence behind them; a story
  update to revisit; then the debrief and a learning Local Coverage Brief. The figures go through the shared model in
  lib/suburbCoverage; this file holds the case, the learner's state and the rubric.

  The rubric covers demand tier, supply status, time and location fit, backup reasoning, honest communication and
  follow-through. It never scores how many clients are accepted or workers recruited. A critical flag (leaving a
  current gap waiting for recruitment, counting a candidate as capacity) stands above any total.

  The learner's copy hides the prediction's likely answers, the cards' feedback, every option's feedback, levels,
  flags and outcome, and the debrief: those come from the server once the decisions are in. A card's answer is the
  model's own reading of it, so it can't drift from the coverage table.
*/

export const LAB_VERSION = "coverage-lab-1";
export const RUBRIC_VERSION = "coverage-rubric-1";

export const DIMENSIONS = {
  demand: "Demand tier",
  supply: "Supply status",
  fit: "Time and location fit",
  backup: "Backup reasoning",
  honesty: "Honest communication",
  follow: "Follow-through",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  ignoredUrgent: "Left a current, confirmed service gap waiting for recruitment",
  candidateAsCapacity: "Counted a candidate or an unverified worker as usable capacity",
  timeMismatch: "Counted spare hours at the wrong time, place or service as cover",
  overrodeChoice: "Discarded a participant’s chosen worker instead of routing them through the provider’s checks",
  promisedDate: "Promised a service date from an outreach plan or an unconfirmed offer",
  countAsCapacity: "Treated a contractor count or a green map as service capacity",
  marginFirst: "Let margin or funding decide whose care gets attention",
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
export type Decision = Option & {
  /** What happens next in the story. Hidden until the debrief. */
  outcome: string;
};

/** A supply card the learner tags, read against one need. The answer is the model's own reading. */
export type Card = { id: string; supply: string; cell: string; feedback: string };

export type CoverageLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  /** The service taxonomy and supply states this case uses: shared, versioned with the model, never rewritten per article. */
  taxonomyVersion: string;
  story: {
    /** The Care Partner principal: a fictional character from the library. */
    character: string;
    role: string;
    situation: string;
    /** Ava's optional transmission. Readers without video or voice lose nothing without it. */
    transmission: { who: string; text: string };
    /** A short client voice: a gap is a person waiting for a suitable visit. Anonymous. */
    voice: { who: string; text: string };
    /** The fragile plan: who becomes unavailable, and the participant's chosen worker. */
    fragile: string;
    absentWorker: string;
    dilemma: string;
  };
  inputs: CoverageInputs;
  prediction: { prompt: string; options: { id: string; text: string; likely: boolean }[] };
  cards: Card[];
  immediate: Decision[];
  network: Decision[];
  explanations: Option[];
  /** The story update: some candidates respond and complete checks. Rows replace or join the supply by id. */
  update: { title: string; text: string; asOf: string; supply: SupplyRow[] };
  followUp: { prompt: string; options: Option[] };
  /** The debrief's summary. Hidden until the decisions are in. */
  debrief: string;
  links: { label: string; href: string; why: string }[];
  /** Where the next step is the Contractor Network Builder Work Tool: a labelled placeholder until it exists. */
  handoff: { label: string; note: string };
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
    onboarding: string;
    quality: string;
    partnerships: string;
    policy: string;
    privacy: string;
    pilot: string;
    approvedOn: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** 0 the opportunity · 1 prediction · 2 what clients need · 3 what is usable · 4 the fragile plan · 5 decide · 6 follow-up · 7 debrief */
export const STEPS = [
  "The apparent opportunity",
  "Make a prediction",
  "What clients need",
  "What is usable",
  "The fragile plan",
  "Two decisions",
  "Follow-up",
  "Local Coverage Brief",
] as const;
export const LAST = STEPS.length - 1;

export type CoverageState = {
  stage: number;
  prediction: { area: string } | null;
  /** Areas and coverage rows opened: "area:banksia", "cell:banksia-am". */
  opened: string[];
  /** Filters used, by name. */
  filters: string[];
  tags: Record<string, Use | "">;
  /** Whether they looked at the absence. */
  absence: boolean;
  immediate: string;
  network: string;
  explanation: string;
  /** After the story update: the follow-up answer, and the network priority they'd keep or change to. */
  followUp: string;
  revised: string;
  retries: number;
};

export const emptyState = (): CoverageState => ({
  stage: 0,
  prediction: null,
  opened: [],
  filters: [],
  tags: {},
  absence: false,
  immediate: "",
  network: "",
  explanation: "",
  followUp: "",
  revised: "",
  retries: 0,
});

export function cleanState(d: CoverageLabData, v: unknown): CoverageState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 60) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 80)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const cards = new Set(d.cards.map((c) => c.id));
  const rawTags = (o.tags && typeof o.tags === "object" ? o.tags : {}) as Record<string, unknown>;
  const tags: Record<string, Use | ""> = {};
  for (const [k, t] of Object.entries(rawTags)) if (cards.has(k)) tags[k] = typeof t === "string" && t in USES ? (t as Use) : "";
  const pick = (list: { id: string }[], x: unknown) => (list.some((y) => y.id === x) ? (x as string) : "");
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(LAST, o.stage)) : 0,
    prediction: p ? { area: pick(d.prediction.options, p.area) } : null,
    opened: ids(o.opened),
    filters: ids(o.filters, 12),
    tags,
    absence: o.absence === true,
    immediate: pick(d.immediate, o.immediate),
    network: pick(d.network, o.network),
    explanation: pick(d.explanations, o.explanation),
    followUp: pick(d.followUp.options, o.followUp),
    revised: pick(d.network, o.revised),
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** What's still needed before the debrief. */
export function finishProblems(d: CoverageLabData, s: CoverageState): string[] {
  const out: string[] = [];
  if (!s.prediction || !s.prediction.area) out.push("Make your prediction first.");
  if (!s.opened.some((x) => x.startsWith("area:"))) out.push("Open at least one area to see what its clients need.");
  const untagged = d.cards.filter((c) => !s.tags[c.id]);
  if (untagged.length) out.push(`Tag every supply card (${untagged.length} still to do).`);
  if (!s.opened.some((x) => x.startsWith("cell:"))) out.push("Open at least one row of the coverage comparison.");
  if (!s.absence) out.push("Look at the fragile plan: what an absence would do.");
  if (!d.immediate.some((x) => x.id === s.immediate)) out.push("Choose the immediate action.");
  if (!d.network.some((x) => x.id === s.network)) out.push("Choose the network-building priority.");
  if (!d.explanations.some((x) => x.id === s.explanation)) out.push("Choose the evidence you’d give for them.");
  if (!d.followUp.options.some((x) => x.id === s.followUp)) out.push("Answer the follow-up after the story update.");
  return out;
}

/** The supply after the story update: rows replace or join the case's by id, read as of the update's date. */
export function updatedInputs(d: Pick<CoverageLabData, "inputs" | "update">): CoverageInputs {
  const i = structuredClone(d.inputs);
  for (const row of d.update.supply) {
    const k = i.supply.findIndex((x) => x.id === row.id);
    if (k >= 0) i.supply[k] = structuredClone(row);
    else i.supply.push(structuredClone(row));
  }
  if (d.update.asOf) i.asOf = d.update.asOf;
  return i;
}

/** The model's reading of a card: what the learner's tag is compared with. */
export function cardAnswer(r: CoverageResult, c: Card): { use: Use; kind: ReasonKind; reason: string } | null {
  const x = r.cells.find((y) => y.id === c.cell)?.supply.find((y) => y.id === c.supply);
  return x ? { use: x.use, kind: x.kind, reason: x.reason } : null;
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type CoverageDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string }[];
  immediate: { text: string; feedback: string; outcome: string };
  network: { text: string; feedback: string; outcome: string };
  explanation: { text: string; feedback: string };
  followUp: { text: string; feedback: string; revised: string; changed: boolean };
  cards: { id: string; label: string; need: string; yours: Use | ""; answer: Use; reason: string; feedback: string; matches: boolean }[];
  prediction: { chosen: string; likely: string[] };
  summary: string;
  versions: { lab: string; story: string; rubric: string; model: string; taxonomy: string };
};

const lower = (a: Level | undefined, b: Level | undefined): Level | undefined => (a === undefined ? b : b === undefined ? a : (Math.min(a, b) as Level));
const FIT_KINDS: ReasonKind[] = ["scope", "capability", "area", "time", "taken"];

export function buildDebrief(d: CoverageLabData, s: CoverageState, modelVersion: string): CoverageDebrief {
  const immediate = d.immediate.find((x) => x.id === s.immediate)!;
  const network = d.network.find((x) => x.id === s.network)!;
  const explanation = d.explanations.find((x) => x.id === s.explanation)!;
  const follow = d.followUp.options.find((x) => x.id === s.followUp)!;
  const revised = d.network.find((x) => x.id === s.revised);
  const r = validateInputs(d.inputs).length ? null : calculate(d.inputs);
  const cards = d.cards.map((c) => {
    const a = r ? cardAnswer(r, c) : null;
    const row = d.inputs.supply.find((x) => x.id === c.supply);
    const cell = r?.cells.find((x) => x.id === c.cell);
    const yours = s.tags[c.id] ?? "";
    return {
      id: c.id,
      label: row?.label ?? c.supply,
      need: cell?.label ?? c.cell,
      yours,
      answer: a?.use ?? ("unavailable" as Use),
      kind: a?.kind ?? ("scope" as ReasonKind),
      reason: a?.reason ?? "",
      feedback: c.feedback,
      matches: Boolean(a && yours === a.use),
    };
  });
  const share = (list: typeof cards) => (list.length ? list.filter((c) => c.matches).length / list.length : 1);
  const tagLevel = (x: number): Level => (x >= 0.85 ? 3 : x >= 0.6 ? 2 : x >= 0.35 ? 1 : 0);
  const supplyLevel = tagLevel(share(cards));
  const fitLevel = tagLevel(share(cards.filter((c) => FIT_KINDS.includes(c.kind))));
  // Flags from the tags themselves: an unchecked worker read as usable, a mismatch read as cover, a chosen worker dropped.
  const tagFlags: FlagId[] = [];
  if (cards.some((c) => c.yours === "usable" && c.answer === "potential")) tagFlags.push("candidateAsCapacity");
  if (cards.some((c) => c.yours === "usable" && FIT_KINDS.includes(c.kind) && c.answer !== "usable")) tagFlags.push("timeMismatch");
  const chosen = new Set(d.inputs.supply.filter((x) => x.preferredFor).map((x) => x.id));
  if (cards.some((c) => chosen.has(d.cards.find((y) => y.id === c.id)!.supply) && c.yours === "unavailable")) tagFlags.push("overrodeChoice");
  const both = (k: Dim, ...opts: Option[]) => opts.reduce<Level | undefined>((a, o) => lower(a, o.levels[k]), undefined);
  const levels: Record<Dim, Level> = {
    demand: both("demand", immediate, explanation) ?? 1,
    supply: lower(supplyLevel, explanation.levels.supply) ?? supplyLevel,
    fit: lower(fitLevel, explanation.levels.fit) ?? fitLevel,
    // Backup reasoning needs the absence looked at.
    backup: Math.min(s.absence ? 3 : 1, both("backup", network, explanation) ?? 1) as Level,
    honesty: both("honesty", immediate, follow) ?? 1,
    follow: both("follow", follow, revised ?? network) ?? 1,
  };
  const matched = cards.filter((c) => c.matches).length;
  const why: Record<Dim, string> = {
    demand: immediate.feedback,
    supply: `Your tags matched the coverage reading on ${matched} of ${cards.length} supply cards. ${explanation.feedback}`,
    fit:
      fitLevel >= 2
        ? "You separated approved workers who are free at the wrong time, place or service from usable spare capacity."
        : "Some workers you read as cover are free at the wrong time, in the wrong place or for a different service. Spare afternoon hours never cover a 7 am visit.",
    backup: s.absence ? network.feedback : "You didn’t look at what an absence would do, so backup reasoning can’t be strong.",
    honesty: follow.feedback,
    follow: revised && revised.id !== network.id ? `You revised your network priority after the update. ${revised.feedback}` : network.feedback,
  };
  const flags = [...new Set([...immediate.flags, ...network.flags, ...explanation.flags, ...follow.flags, ...(revised?.flags ?? []), ...tagFlags])].map(
    (id) => ({
      id,
      text: FLAGS[id],
    }),
  );
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    flags,
    immediate: { text: immediate.text, feedback: immediate.feedback, outcome: immediate.outcome },
    network: { text: network.text, feedback: network.feedback, outcome: network.outcome },
    explanation: { text: explanation.text, feedback: explanation.feedback },
    followUp: { text: follow.text, feedback: follow.feedback, revised: revised?.text ?? "", changed: Boolean(revised && revised.id !== network.id) },
    cards: cards.map((c) => ({
      id: c.id,
      label: c.label,
      need: c.need,
      yours: c.yours,
      answer: c.answer,
      reason: c.reason,
      feedback: c.feedback,
      matches: c.matches,
    })),
    prediction: {
      chosen: d.prediction.options.find((x) => x.id === s.prediction?.area)?.text ?? "",
      likely: d.prediction.options.filter((x) => x.likely).map((x) => x.text),
    },
    summary: d.debrief,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion, taxonomy: d.taxonomyVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: CoverageLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The Local Coverage block"}”`;
  const errors = validateInputs(d.inputs);
  for (const e of errors) out.push(`${where}: ${e.message}`);
  if (!d.story.character || !d.story.situation) out.push(`${where} needs its story: the principal and the situation.`);
  if (d.inputs.areas.length < 2) out.push(`${where} needs at least two areas to compare.`);
  if (d.prediction.options.length < 2) out.push(`${where}: the prediction needs at least two options.`);
  if (!d.prediction.options.some((x) => x.likely)) out.push(`${where}: mark at least one prediction option as likely.`);
  if (d.cards.length < 3) out.push(`${where} needs at least three supply cards to tag.`);
  for (const c of d.cards) {
    if (!d.inputs.supply.some((x) => x.id === c.supply)) out.push(`${where}: the card “${c.id}” names a supply row that isn’t in the case.`);
    if (!d.inputs.demand.some((x) => x.id === c.cell)) out.push(`${where}: the card “${c.id}” names a need that isn’t in the case.`);
    if (!c.feedback) out.push(`${where}: the card “${c.id}” needs its feedback.`);
  }
  const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);
  for (const [list, name] of [
    [d.immediate, "immediate action"],
    [d.network, "network priority"],
    [d.explanations, "explanation"],
    [d.followUp.options, "follow-up answer"],
  ] as const) {
    if (list.length < 2) out.push(`${where} needs at least two of each: add another ${name}.`);
    if (!list.some(strong)) out.push(`${where}: at least one ${name} should be a strong, unflagged answer.`);
    for (const o of list) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  }
  if (d.story.absentWorker && !d.inputs.supply.some((x) => x.id === d.story.absentWorker && x.bookings.length))
    out.push(`${where}: the worker in the fragile plan needs current bookings for an absence to affect.`);
  if (!d.update.text || !d.update.supply.length) out.push(`${where} needs its story update: what changed, and the supply rows it changes.`);
  if (!d.handoff.label) out.push(`${where}: name the next step (the Contractor Network Builder handoff).`);
  // The point of the case: something to find, read the same way the learner will.
  if (!errors.length) {
    const r = calculate(d.inputs);
    if (!r.cells.some((c) => c.gap > 0)) out.push(`${where}: no need has a current gap, so there’s no immediate action to find.`);
    const uses = new Set(d.cards.map((c) => cardAnswer(r, c)?.use).filter(Boolean));
    if (uses.size < 3) out.push(`${where}: the cards should cover at least three of usable, potential, unavailable and committed.`);
    if (!r.areas.some((a) => a.status === "covered") && !r.cells.some((c) => c.surplus > 0))
      out.push(`${where}: no area has any cover, so the comparison has nothing to set the gaps against.`);
    const u = updatedInputs(d);
    if (validateInputs(u).length) out.push(`${where}: the story update doesn’t validate: ${validateInputs(u)[0].message}`);
  }
  return out;
}

export const labApproved = (d: Pick<CoverageLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.onboarding && a.quality && a.partnerships && a.policy && a.privacy && a.pilot && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function coverageHardProblems(d: CoverageLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d))
    out.push(
      `“${d.title}”: record the owner, Care Partner Operations, supplier onboarding, Quality/clinical governance, Partnerships, the policy owner, privacy and pilot-group reviewers, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no likely answers, card feedback, option feedback, levels, flags, outcomes or debrief. */
export function coverageForReaders<T extends CoverageLabData>(b: T): T {
  const bare = <O extends Option>(o: O) => ({ ...o, feedback: "", levels: {}, flags: [] });
  return {
    ...b,
    prediction: { ...b.prediction, options: b.prediction.options.map((o) => ({ ...o, likely: false })) },
    cards: b.cards.map((c) => ({ ...c, feedback: "" })),
    immediate: b.immediate.map((o) => ({ ...bare(o), outcome: "" })),
    network: b.network.map((o) => ({ ...bare(o), outcome: "" })),
    explanations: b.explanations.map(bare),
    followUp: { ...b.followUp, options: b.followUp.options.map(bare) },
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

export function parseCoverageLab(o: Raw, where: string, h: ParseHelpers): CoverageLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const up = obj(o.update);
  const fu = obj(o.followUp);
  const option = (x: unknown, k: number): Option => {
    const p = obj(x);
    return { id: id(p.id, `o${k + 1}`), text: s(p.text, 500), feedback: s(p.feedback, 900), levels: levels(p.levels), flags: flags(p.flags) };
  };
  const decision = (x: unknown, k: number): Decision => ({ ...option(x, k), outcome: s(obj(x).outcome, 900) });
  const data: CoverageLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    taxonomyVersion: s(o.taxonomyVersion, 40) || "network-taxonomy-1",
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      situation: s(st.situation, 1200),
      transmission: { who: s(obj(st.transmission).who, 60), text: s(obj(st.transmission).text, 300) },
      voice: { who: s(obj(st.voice).who, 120), text: s(obj(st.voice).text, 300) },
      fragile: s(st.fragile, 900),
      absentWorker: s(st.absentWorker, 40),
      dilemma: s(st.dilemma, 300),
    },
    inputs: cleanInputs(o.inputs),
    prediction: {
      prompt: s(pr.prompt, 300),
      options: arr(pr.options)
        .slice(0, 8)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `p${k + 1}`), text: s(c.text, 200), likely: c.likely === true };
        }),
    },
    cards: arr(o.cards)
      .slice(0, 16)
      .map((x, k) => {
        const c = obj(x);
        return { id: id(c.id, `c${k + 1}`), supply: s(c.supply, 40), cell: s(c.cell, 40), feedback: s(c.feedback, 800) };
      }),
    immediate: arr(o.immediate).slice(0, 6).map(decision),
    network: arr(o.network).slice(0, 6).map(decision),
    explanations: arr(o.explanations).slice(0, 6).map(option),
    update: {
      title: s(up.title, 120),
      text: s(up.text, 1200),
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(s(up.asOf, 10)) ? s(up.asOf, 10) : "",
      supply: cleanInputs({ supply: up.supply }).supply,
    },
    followUp: { prompt: s(fu.prompt, 300), options: arr(fu.options).slice(0, 6).map(option) },
    debrief: s(o.debrief, 1800),
    links: arr(o.links)
      .slice(0, 6)
      .map((x) => {
        const l = obj(x);
        return { label: s(l.label, 80), href: s(l.href, 300), why: s(l.why, 300) };
      })
      .filter((l) => l.label && (l.href.startsWith("/") || l.href.startsWith("https://"))),
    handoff: { label: s(obj(o.handoff).label, 120), note: s(obj(o.handoff).note, 600) },
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
      onboarding: s(ap.onboarding, 120),
      quality: s(ap.quality, 120),
      partnerships: s(ap.partnerships, 120),
      policy: s(ap.policy, 120),
      privacy: s(ap.privacy, 120),
      pilot: s(ap.pilot, 120),
      approvedOn: s(ap.approvedOn, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!data.inputs.demand.length) unfinished(`${where} needs its case: the areas, the needs and the supply.`);
  return data;
}
