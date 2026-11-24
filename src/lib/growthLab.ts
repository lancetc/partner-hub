import {
  applyChange,
  calculate,
  cleanInputs,
  validateInputs,
  weeksOf,
  type Change,
  type IntakeInputs,
  type IntakeResult,
  type Stage,
  type SupplyStatus,
} from "./growthReadiness";

/*
  The growth readiness block ("Can we take on the next 10 clients?", docs/growth-readiness.md): a fictional Care
  Partner's month of possible starts, worked through in seven steps (the Monday call, a prediction, mapping the month,
  checking service coverage, trying a change, deciding and telling people, and a Decision Sheet). The figures go
  through the shared model in lib/growthReadiness; this file holds the case, the learner's state and the rubric.

  The rubric looks at the evidence used, how unknowns were handled, participant-centred communication and escalation.
  It never scores how many starts the learner predicted or took on: a bigger intake is not a better answer. A critical
  flag (a date promised before a worker was confirmed, say) stands above any total.

  The learner's copy hides which checks are useful, the actions' and messages' feedback, levels and flags, and the
  debrief: those come from the server once the decision is in.
*/

export const LAB_VERSION = "intake-lab-1";
export const RUBRIC_VERSION = "intake-rubric-1";

export const DIMENSIONS = {
  evidence: "Evidence used",
  unknowns: "Handling unknowns",
  communication: "Participant-centred communication",
  escalation: "Appropriate escalation",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  promised: "Promised a start date before the worker, slot or agreement was confirmed",
  noParticipant: "Moved or deferred a start without talking it through with the participant",
  ranked: "Chose who starts by revenue, funding or ease rather than need and the agreed process",
  noEscalation: "Left an urgent or safety need waiting instead of using the escalation process",
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
export type Message = Option & {
  /** Who it's to: "Client", "Family", "Trilogy Care". */
  to: string;
  /** What happens next in the story when it's sent. Hidden until the debrief. */
  outcome: string;
};
export type TryChange = { id: string; label: string; detail: string; change: Change };

export type IntakeLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  story: {
    /** The Care Partner principal: a fictional character from the library. */
    character: string;
    role: string;
    situation: string;
    /** A client's or family member's voice. */
    voice: { who: string; text: string };
    /** A coordinator's concern. */
    concern: { who: string; text: string };
    dilemma: string;
  };
  inputs: IntakeInputs;
  prediction: { prompt: string; checks: { id: string; text: string; useful: boolean }[] };
  changes: TryChange[];
  decisions: Option[];
  messages: Message[];
  /** The debrief's summary of the case. Hidden until the decision is in. */
  debrief: string;
  links: { label: string; href: string; why: string }[];
  sources: { title: string; url: string }[];
  approval: { owner: string; operations: string; partnerships: string; policy: string; privacy: string; approvedOn: string; reviewBy: string };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** 0 the call · 1 prediction · 2 map the month · 3 service coverage · 4 try a change · 5 decide · 6 debrief */
export const STEPS = [
  "The Monday call",
  "Make a prediction",
  "Map the month",
  "Check service coverage",
  "Try a change",
  "Decide and tell people",
  "Decision Sheet",
] as const;

export type IntakeState = {
  stage: number;
  prediction: { count: number | null; checks: string[] } | null;
  /** Weeks opened in the map. */
  weeks: number[];
  /** Service checks opened ("key#week"). */
  services: string[];
  /** Change options applied, in order, and whether the learner edited a figure themselves. */
  applied: string[];
  edited: boolean;
  /** The inputs as the learner has them now (fictional). */
  inputs: IntakeInputs | null;
  decision: string;
  message: string;
  retries: number;
};

export const emptyState = (): IntakeState => ({
  stage: 0,
  prediction: null,
  weeks: [],
  services: [],
  applied: [],
  edited: false,
  inputs: null,
  decision: "",
  message: "",
  retries: 0,
});

export function cleanState(d: IntakeLabData, v: unknown): IntakeState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 40) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 120)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const checkIds = new Set(d.prediction.checks.map((c) => c.id));
  const changeIds = new Set(d.changes.map((c) => c.id));
  const W = weeksOf(d.inputs.month).length;
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(6, o.stage)) : 0,
    prediction: p
      ? {
          count: typeof p.count === "number" && Number.isInteger(p.count) && p.count >= 0 && p.count <= 99 ? p.count : null,
          checks: ids(p.checks).filter((c) => checkIds.has(c)),
        }
      : null,
    weeks: (Array.isArray(o.weeks) ? o.weeks : []).filter((w): w is number => typeof w === "number" && Number.isInteger(w) && w >= 0 && w < W),
    services: ids(o.services),
    applied: ids(o.applied).filter((c) => changeIds.has(c)),
    edited: o.edited === true,
    inputs: o.inputs ? cleanInputs(o.inputs) : null,
    decision: d.decisions.some((x) => x.id === o.decision) ? (o.decision as string) : "",
    message: d.messages.some((x) => x.id === o.message) ? (o.message as string) : "",
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** What's still needed before the decision can go in. */
export function finishProblems(d: IntakeLabData, s: IntakeState): string[] {
  const out: string[] = [];
  if (!s.prediction || s.prediction.count === null) out.push("Make your prediction first.");
  if (!s.weeks.length) out.push("Open at least one week in the map to see what fills it.");
  if (!s.services.length) out.push("Open at least one service gap or unknown.");
  if (!s.applied.length && !s.edited) out.push("Try at least one change and see what it does.");
  if (!d.decisions.some((x) => x.id === s.decision)) out.push("Choose what you’ll do next.");
  if (!d.messages.some((x) => x.id === s.message)) out.push("Choose the message you’ll send.");
  return out;
}

/** The learner's inputs now: the case's, with the changes they've applied, unless they've edited them directly. */
export function currentInputs(d: IntakeLabData, s: IntakeState): IntakeInputs {
  if (s.inputs) return s.inputs;
  return s.applied.reduce((acc, id) => {
    const c = d.changes.find((x) => x.id === id);
    return c ? applyChange(acc, c.change) : acc;
  }, d.inputs);
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type IntakeDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string }[];
  decision: { text: string; feedback: string };
  message: { text: string; to: string; feedback: string; outcome: string };
  prediction: { count: number | null; useful: string[]; missed: string[]; extra: string[] };
  /** The case as it started, and as the learner left it: counts only. */
  before: Pick<IntakeResult, "proposed" | "supported" | "constrained" | "confirm" | "state">;
  after: Pick<IntakeResult, "proposed" | "supported" | "constrained" | "confirm" | "state">;
  summary: string;
  versions: { lab: string; story: string; rubric: string; model: string };
};

const lower = (a: Level | undefined, b: Level | undefined): Level | undefined => (a === undefined ? b : b === undefined ? a : (Math.min(a, b) as Level));

export function buildDebrief(d: IntakeLabData, s: IntakeState, modelVersion: string): IntakeDebrief {
  const decision = d.decisions.find((x) => x.id === s.decision)!;
  const message = d.messages.find((x) => x.id === s.message)!;
  const chosen = new Set(s.prediction?.checks ?? []);
  const useful = d.prediction.checks.filter((c) => c.useful);
  const hit = useful.filter((c) => chosen.has(c.id));
  const extra = d.prediction.checks.filter((c) => !c.useful && chosen.has(c.id));
  // Evidence: the checks they'd want before deciding, and whether they looked at a week, a service and a change.
  const looked = (s.weeks.length ? 1 : 0) + (s.services.length ? 1 : 0) + (s.applied.length || s.edited ? 1 : 0);
  let evidence: Level = hit.length >= Math.min(3, useful.length) ? 3 : hit.length >= 2 ? 2 : hit.length ? 1 : 0;
  if (extra.length > hit.length && evidence > 1) evidence = (evidence - 1) as Level;
  if (looked < 3) evidence = Math.min(evidence, 1) as Level;
  const levels: Record<Dim, Level> = {
    evidence,
    unknowns: lower(decision.levels.unknowns, message.levels.unknowns) ?? 1,
    communication: lower(message.levels.communication, decision.levels.communication) ?? 1,
    escalation: lower(decision.levels.escalation, message.levels.escalation) ?? 1,
  };
  const why: Record<Dim, string> = {
    evidence:
      looked < 3
        ? "You decided without looking at a week, a service gap and a change in the model."
        : `You named ${hit.length} of the ${useful.length} checks that matter here${extra.length ? `, and ${extra.length} that don’t tell you whether a start can be supported` : ""}.`,
    unknowns: decision.levels.unknowns !== undefined ? decision.feedback : message.feedback,
    communication: message.feedback,
    escalation: decision.feedback,
  };
  const flags = [...new Set([...decision.flags, ...message.flags])].map((id) => ({ id, text: FLAGS[id] }));
  const pick = (r: IntakeResult) => ({ proposed: r.proposed, supported: r.supported, constrained: r.constrained, confirm: r.confirm, state: r.state });
  const before = calculate(d.inputs);
  const mine = currentInputs(d, s);
  const after = validateInputs(mine).length ? before : calculate(mine);
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    flags,
    decision: { text: decision.text, feedback: decision.feedback },
    message: { text: message.text, to: message.to, feedback: message.feedback, outcome: message.outcome },
    prediction: {
      count: s.prediction?.count ?? null,
      useful: hit.map((c) => c.text),
      missed: useful.filter((c) => !chosen.has(c.id)).map((c) => c.text),
      extra: extra.map((c) => c.text),
    },
    before: pick(before),
    after: pick(after),
    summary: d.debrief,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: IntakeLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The growth readiness block"}”`;
  for (const e of validateInputs(d.inputs)) out.push(`${where}: ${e.message}`);
  if (!d.inputs.starts.some((s) => s.stage !== "enquiry")) out.push(`${where} needs at least one proposed start.`);
  if (!d.story.character || !d.story.situation) out.push(`${where} needs its story: the principal and the situation.`);
  if (d.prediction.checks.filter((c) => c.useful).length < 2) out.push(`${where}: mark at least two prediction checks as useful.`);
  if (d.decisions.length < 2) out.push(`${where} needs at least two actions to choose from.`);
  if (d.messages.length < 2) out.push(`${where} needs at least two messages to choose from.`);
  const strong = (o: Option) => !o.flags.length && Object.values(o.levels).every((l) => l !== undefined && l >= 2) && Object.keys(o.levels).length > 0;
  if (!d.decisions.some(strong)) out.push(`${where}: at least one action should be a strong, unflagged answer.`);
  if (!d.messages.some(strong)) out.push(`${where}: at least one message should be a strong, unflagged answer.`);
  for (const o of [...d.decisions, ...d.messages]) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  const starts = new Set(d.inputs.starts.map((s) => s.id));
  const supply = new Set(d.inputs.supply.map((s) => s.id));
  const W = weeksOf(d.inputs.month).length;
  for (const c of d.changes) {
    const ch = c.change;
    if ((ch.kind === "move" || ch.kind === "stage") && !starts.has(ch.start))
      out.push(`${where}: the change “${c.label}” names a start that isn’t in the case.`);
    if (ch.kind === "verify" && !supply.has(ch.supply)) out.push(`${where}: the change “${c.label}” names supply that isn’t in the case.`);
    if ((ch.kind === "cover" || ch.kind === "move") && (ch.week < 0 || ch.week >= W))
      out.push(`${where}: the change “${c.label}” names a week outside the month.`);
  }
  if (!d.changes.length) out.push(`${where} needs at least one change to try.`);
  // The point of the case: the model should show a constraint to find.
  if (!validateInputs(d.inputs).length && calculate(d.inputs).state === "available")
    out.push(`${where}: the case shows no gap or unknown, so there’s nothing for the learner to find.`);
  return out;
}

export const labApproved = (d: Pick<IntakeLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.partnerships && a.policy && a.privacy && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function intakeHardProblems(d: IntakeLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d)) out.push(`“${d.title}”: record the owner, the Operations/Quality, Partnerships, policy and privacy reviewers, and the date.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no answer key, feedback, levels, flags or debrief. */
export function intakeForReaders<T extends IntakeLabData>(b: T): T {
  return {
    ...b,
    prediction: { ...b.prediction, checks: b.prediction.checks.map((c) => ({ ...c, useful: false })) },
    decisions: b.decisions.map((o) => ({ ...o, feedback: "", levels: {}, flags: [] })),
    messages: b.messages.map((o) => ({ ...o, feedback: "", outcome: "", levels: {}, flags: [] })),
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

function parseChange(v: unknown): Change | null {
  const o = obj(v);
  const int = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 10 ? x : 0);
  if (o.kind === "cover") return { kind: "cover", week: int(o.week), hours: typeof o.hours === "number" && o.hours > 0 && o.hours <= 100 ? o.hours : 0 };
  if (o.kind === "move") return { kind: "move", start: s(o.start, 40), week: int(o.week) };
  if (o.kind === "verify")
    return { kind: "verify", supply: s(o.supply, 40), verifiedOn: /^\d{4}-\d{2}-\d{2}$/.test(s(o.verifiedOn, 10)) ? s(o.verifiedOn, 10) : "" };
  if (o.kind === "stage")
    return {
      kind: "stage",
      start: s(o.start, 40),
      stage: (["enquiry", "expected", "ready"] as Stage[]).includes(o.stage as Stage) ? (o.stage as Stage) : "ready",
    };
  return null;
}

export function parseIntakeLab(o: Raw, where: string, h: ParseHelpers): IntakeLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const option = (x: unknown, k: number) => {
    const p = obj(x);
    return { id: id(p.id, `o${k + 1}`), text: s(p.text, 400), feedback: s(p.feedback, 800), levels: levels(p.levels), flags: flags(p.flags) };
  };
  const data: IntakeLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      situation: s(st.situation, 1200),
      voice: { who: s(obj(st.voice).who, 80), text: s(obj(st.voice).text, 400) },
      concern: { who: s(obj(st.concern).who, 80), text: s(obj(st.concern).text, 400) },
      dilemma: s(st.dilemma, 300),
    },
    inputs: cleanInputs(o.inputs),
    prediction: {
      prompt: s(pr.prompt, 300),
      checks: arr(pr.checks)
        .slice(0, 12)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `k${k + 1}`), text: s(c.text, 200), useful: c.useful === true };
        }),
    },
    changes: arr(o.changes)
      .slice(0, 8)
      .map((x, k) => {
        const c = obj(x);
        const change = parseChange(c.change);
        return change ? { id: id(c.id, `t${k + 1}`), label: s(c.label, 120), detail: s(c.detail, 400), change } : null;
      })
      .filter((c): c is TryChange => c !== null),
    decisions: arr(o.decisions).slice(0, 6).map(option),
    messages: arr(o.messages)
      .slice(0, 6)
      .map((x, k) => ({ ...option(x, k), to: s(obj(x).to, 60), outcome: s(obj(x).outcome, 800) })),
    debrief: s(o.debrief, 1500),
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
    approval: {
      owner: s(ap.owner, 120),
      operations: s(ap.operations, 120),
      partnerships: s(ap.partnerships, 120),
      policy: s(ap.policy, 120),
      privacy: s(ap.privacy, 120),
      approvedOn: s(ap.approvedOn, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!data.inputs.starts.length) unfinished(`${where} needs its case: the starts, the team and the services.`);
  return data;
}

export type { SupplyStatus };
