import {
  calculate,
  CATEGORIES,
  CAUSES,
  cleanInputs,
  validateInputs,
  type Category,
  type Cause,
  type Num,
  type WorkloadInputs,
  type WorkloadResult,
} from "./workloadLens";

/*
  The Workload Lens block ("Where does a coordinator’s week go?", docs/workload-lens.md): a fictional coordinator's
  week, worked through as a Magazine feature. Monday's plan and a prediction; the week's events, each tagged with one
  primary category and any causes; the week map (principal's and coordinator's views, with a table); a change to
  test; a decision and the explanation behind it; then the debrief and a learning Week Review. The figures go through
  the shared model in lib/workloadLens; this file holds the case, the learner's state and the rubric.

  The rubric looks at diagnosis, evidence, respectful handling of client needs and appropriate action. It never scores
  speed, a utilisation percentage or how many hours the learner "saved". A critical flag (treating a necessary client
  conversation as waste, say) stands above any total.

  The learner's copy hides each event's reviewed tags and feedback, the prediction's likely answer, the options'
  feedback, levels and flags, and the debrief: those come from the server once the decision is in.
*/

export const LAB_VERSION = "workload-lab-1";
export const RUBRIC_VERSION = "workload-rubric-1";

export const DIMENSIONS = {
  diagnosis: "Diagnosis",
  evidence: "Evidence used",
  respect: "Respectful handling of client needs",
  action: "Appropriate action",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

export const FLAGS = {
  waste: "Treated necessary client or family conversation as waste to cut",
  cutReview: "Shortened or dropped an essential review to make headroom",
  delayed: "Put off work that needed a prompt response (an escalation or safety follow-up)",
  utilisation: "Aimed for full utilisation, with no reserve for the unexpected",
  surveillance: "Turned the time map into tracking or ranking an individual",
  realised: "Presented a modelled estimate as hours already saved",
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

/** One beat of the week: an event that became a task in the observed week, for the learner to tag. */
export type StoryEvent = {
  id: string;
  /** 0 Monday … 4 Friday. */
  day: number;
  title: string;
  text: string;
  /** The task it became, in the first observed week. */
  task: string;
  /** What it means to the client: the story detail behind the chart segment. */
  detail: string;
  /** Ask whether it needs prompt action or can be rescheduled. */
  askPrompt: boolean;
  /** The reviewed tags. Hidden from learners until the debrief. */
  answer: { category: Category; causes: Cause[]; prompt: boolean | null };
  feedback: string;
};

export type WorkloadLabData = {
  title: string;
  intro: string;
  storyVersion: string;
  /** The task taxonomy this case uses: shared across articles, never regenerated per article. */
  taxonomyVersion: string;
  story: {
    /** The Care Partner principal: a fictional character from the library. */
    character: string;
    role: string;
    /** The coordinator whose week it is. */
    coordinator: string;
    situation: string;
    /** Ava's optional opening transmission. Readers without video or voice lose nothing without it. */
    transmission: { who: string; text: string };
    /** The two views the reader can switch between: commitments and capacity, interruptions and consequences. */
    principalView: string;
    coordinatorView: string;
    /** Friday: what's still outstanding. */
    consequence: string;
    dilemma: string;
  };
  inputs: WorkloadInputs;
  prediction: { prompt: string; options: { id: string; text: string; likely: boolean }[]; hoursPrompt: string };
  events: StoryEvent[];
  /** Friday: two (or more) explanations of the week to compare. */
  explanations: Option[];
  decisions: Decision[];
  /** The debrief's summary, and what happens the following week. Hidden until the decision is in. */
  debrief: string;
  followingWeek: string;
  links: { label: string; href: string; why: string }[];
  sources: { title: string; url: string }[];
  /** Why this block suits the problem (PRD section 10): the author accepts, edits or rejects it, and it's versioned with the story. */
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
    partnerships: string;
    privacy: string;
    pilot: string;
    approvedOn: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

/** 0 Monday · 1 prediction · 2 the week · 3 the week map · 4 test a change · 5 decide · 6 debrief */
export const STEPS = [
  "Monday: a planned week",
  "Make a prediction",
  "The week unfolds",
  "The week map",
  "Test a change",
  "Friday: decide",
  "Week Review",
] as const;

export type Tag = { category: Category | ""; causes: Cause[]; prompt: boolean | null };
export type WorkloadState = {
  stage: number;
  prediction: { constraint: string; hours: number | null } | null;
  /** The learner's tags for each event. */
  tags: Record<string, Tag>;
  /** Map segments opened: "day:1", "cat:conversation", "week:w2", "cause:missedService". */
  inspected: string[];
  /** Story details opened (event ids). */
  details: string[];
  /** Changes switched on, and the learner's own conservative estimates. */
  tried: string[];
  estimates: Record<string, { occurrences: Num; minutesEach: Num }>;
  /** Whether they've ever tried a change: kept once true. */
  changed: boolean;
  explanation: string;
  decision: string;
  retries: number;
};

export const emptyState = (): WorkloadState => ({
  stage: 0,
  prediction: null,
  tags: {},
  inspected: [],
  details: [],
  tried: [],
  estimates: {},
  changed: false,
  explanation: "",
  decision: "",
  retries: 0,
});

const numOrNull = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 600 ? v : null);

export function cleanState(d: WorkloadLabData, v: unknown): WorkloadState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const ids = (x: unknown, max = 60) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").map((y) => y.slice(0, 60)) : []).slice(0, max);
  const p = o.prediction && typeof o.prediction === "object" ? (o.prediction as Record<string, unknown>) : null;
  const events = new Set(d.events.map((e) => e.id));
  const changes = new Set(d.inputs.interventions.map((x) => x.id));
  const rawTags = (o.tags && typeof o.tags === "object" ? o.tags : {}) as Record<string, unknown>;
  const tags: Record<string, Tag> = {};
  for (const [k, t] of Object.entries(rawTags)) {
    if (!events.has(k) || !t || typeof t !== "object") continue;
    const x = t as Record<string, unknown>;
    tags[k] = {
      category: typeof x.category === "string" && x.category in CATEGORIES ? (x.category as Category) : "",
      causes: [...new Set(Array.isArray(x.causes) ? x.causes.filter((c): c is Cause => typeof c === "string" && c in CAUSES) : [])].slice(0, 4),
      prompt: typeof x.prompt === "boolean" ? x.prompt : null,
    };
  }
  const rawEst = (o.estimates && typeof o.estimates === "object" ? o.estimates : {}) as Record<string, unknown>;
  const estimates: WorkloadState["estimates"] = {};
  for (const [k, e] of Object.entries(rawEst)) {
    if (!changes.has(k) || !e || typeof e !== "object") continue;
    const x = e as Record<string, unknown>;
    estimates[k] = { occurrences: numOrNull(x.occurrences), minutesEach: numOrNull(x.minutesEach) };
  }
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(6, o.stage)) : 0,
    prediction: p
      ? {
          constraint: d.prediction.options.some((x) => x.id === p.constraint) ? (p.constraint as string) : "",
          hours: typeof p.hours === "number" && Number.isFinite(p.hours) && p.hours >= 0 && p.hours <= 80 ? p.hours : null,
        }
      : null,
    tags,
    inspected: ids(o.inspected),
    details: ids(o.details).filter((x) => events.has(x)),
    tried: ids(o.tried).filter((x) => changes.has(x)),
    estimates,
    changed: o.changed === true,
    explanation: d.explanations.some((x) => x.id === o.explanation) ? (o.explanation as string) : "",
    decision: d.decisions.some((x) => x.id === o.decision) ? (o.decision as string) : "",
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.floor(o.retries) : 0,
  };
}

/** What's still needed before the decision can go in. */
export function finishProblems(d: WorkloadLabData, s: WorkloadState): string[] {
  const out: string[] = [];
  if (!s.prediction || !s.prediction.constraint) out.push("Make your prediction first.");
  const untagged = d.events.filter((e) => !s.tags[e.id]?.category || (e.askPrompt && s.tags[e.id]?.prompt === null));
  if (untagged.length) out.push(`Tag every event in the week (${untagged.length} still to do).`);
  if (!s.inspected.length) out.push("Open at least one part of the week map.");
  if (!s.changed) out.push("Test at least one change and see what it does.");
  if (!d.explanations.some((x) => x.id === s.explanation)) out.push("Choose the explanation you find most convincing.");
  if (!d.decisions.some((x) => x.id === s.decision)) out.push("Choose what Maya should do next.");
  return out;
}

/**
  The learner's figures now: the case's observed week with their tags on the event tasks (category and causes, never
  the duration), and the changes they've switched on with their own estimates.
*/
export function currentInputs(d: WorkloadLabData, s: Pick<WorkloadState, "tags" | "tried" | "estimates">): WorkloadInputs {
  const i = structuredClone(d.inputs);
  const first = i.weeks[0];
  if (first)
    for (const e of d.events) {
      const t = s.tags[e.id];
      const task = first.tasks.find((x) => x.id === e.task);
      if (!t || !task) continue;
      if (t.category) task.category = t.category;
      task.causes = t.causes;
    }
  i.interventions = i.interventions.map((x) => {
    const est = s.estimates[x.id];
    return { ...x, active: s.tried.includes(x.id), ...(est ? { occurrences: est.occurrences, minutesEach: est.minutesEach } : {}) };
  });
  return i;
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type WorkloadDebrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string }[];
  explanation: { text: string; feedback: string };
  decision: { text: string; feedback: string; outcome: string };
  tags: { id: string; title: string; yours: Tag; answer: StoryEvent["answer"]; feedback: string; category: boolean; causes: boolean; prompt: boolean | null }[];
  prediction: { constraint: string; likely: string[]; hours: number | null; unplanned: number };
  /** The case as written, and as the learner left it. */
  before: { headroom: number; modelled: number };
  after: { headroom: number; modelled: number };
  summary: string;
  followingWeek: string;
  versions: { lab: string; story: string; rubric: string; model: string; taxonomy: string };
};

const lower = (a: Level | undefined, b: Level | undefined): Level | undefined => (a === undefined ? b : b === undefined ? a : (Math.min(a, b) as Level));

export function buildDebrief(d: WorkloadLabData, s: WorkloadState, modelVersion: string): WorkloadDebrief {
  const explanation = d.explanations.find((x) => x.id === s.explanation)!;
  const decision = d.decisions.find((x) => x.id === s.decision)!;
  // Diagnosis: did the tags match the reviewed ones? A category is the main thing; the key cause and the timing call count too.
  const tags = d.events.map((e) => {
    const yours = s.tags[e.id] ?? { category: "" as const, causes: [], prompt: null };
    const keyCauses = e.answer.causes.filter((c) => c !== "noRework");
    return {
      id: e.id,
      title: e.title,
      yours,
      answer: e.answer,
      feedback: e.feedback,
      category: yours.category === e.answer.category,
      causes: keyCauses.length ? keyCauses.some((c) => yours.causes.includes(c)) : !yours.causes.some((c) => c !== "noRework" && c !== "unknown"),
      prompt: e.askPrompt && e.answer.prompt !== null ? yours.prompt === e.answer.prompt : null,
    };
  });
  const points = tags.reduce((a, t) => a + (t.category ? 1 : 0) + (t.causes ? 0.5 : 0) + (t.prompt === false ? -0.5 : t.prompt ? 0.5 : 0), 0);
  const possible = tags.reduce((a, t) => a + 1.5 + (t.prompt !== null ? 0.5 : 0), 0) || 1;
  const share = points / possible;
  const tagLevel: Level = share >= 0.8 ? 3 : share >= 0.6 ? 2 : share >= 0.35 ? 1 : 0;
  const looked = [s.inspected.length > 0, s.details.length > 0, s.changed, s.inspected.some((x) => x.startsWith("week:") || x.startsWith("cause:"))].filter(
    Boolean,
  ).length;
  const lookLevel: Level = looked >= 4 ? 3 : looked === 3 ? 2 : looked === 2 ? 1 : 0;
  const levels: Record<Dim, Level> = {
    diagnosis: lower(tagLevel, explanation.levels.diagnosis) ?? tagLevel,
    evidence: lower(lookLevel, lower(explanation.levels.evidence, decision.levels.evidence)) ?? lookLevel,
    respect: lower(explanation.levels.respect, decision.levels.respect) ?? 1,
    action: lower(decision.levels.action, explanation.levels.action) ?? 1,
  };
  const why: Record<Dim, string> = {
    diagnosis: `Your tags matched the reviewed ones on ${tags.filter((t) => t.category).length} of ${tags.length} events. ${explanation.feedback}`,
    evidence:
      lookLevel < 2
        ? "You decided without looking far into the map: open a day or category, a story detail, the following week and a change before deciding."
        : `You looked at ${looked} of the four kinds of evidence: a part of the map, a story detail, a change, and how the weeks compare.`,
    respect: decision.levels.respect !== undefined ? decision.feedback : explanation.feedback,
    action: decision.feedback,
  };
  const timingFlag: FlagId[] = tags.some((t) => t.prompt === false && d.events.find((e) => e.id === t.id)?.answer.prompt === true) ? ["delayed"] : [];
  const flags = [...new Set([...explanation.flags, ...decision.flags, ...timingFlag])].map((id) => ({ id, text: FLAGS[id] }));
  const pick = (r: WorkloadResult) => ({ headroom: r.plan.headroomAfter, modelled: r.plan.modelled });
  const before = calculate(d.inputs);
  const mine = currentInputs(d, s);
  const after = validateInputs(mine).length ? before : calculate(mine);
  const chosen = d.prediction.options.find((x) => x.id === s.prediction?.constraint);
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score: DIM_ORDER.reduce((a, k) => a + levels[k], 0),
    max: DIM_ORDER.length * 3,
    flags,
    explanation: { text: explanation.text, feedback: explanation.feedback },
    decision: { text: decision.text, feedback: decision.feedback, outcome: decision.outcome },
    tags,
    prediction: {
      constraint: chosen?.text ?? "",
      likely: d.prediction.options.filter((x) => x.likely).map((x) => x.text),
      hours: s.prediction?.hours ?? null,
      unplanned: before.weeks[0]?.byPlanned.unplanned ?? 0,
    },
    before: pick(before),
    after: pick(after),
    summary: d.debrief,
    followingWeek: d.followingWeek,
    versions: { lab: LAB_VERSION, story: d.storyVersion, rubric: RUBRIC_VERSION, model: modelVersion, taxonomy: d.taxonomyVersion },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks and the learner's copy
// ---------------------------------------------------------------------------------------------

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: WorkloadLabData): string[] {
  const out: string[] = [];
  const where = `“${d.title || "The Workload Lens block"}”`;
  for (const e of validateInputs(d.inputs)) out.push(`${where}: ${e.message}`);
  if (!d.story.character || !d.story.coordinator || !d.story.situation) out.push(`${where} needs its story: the principal, the coordinator and the situation.`);
  if (d.prediction.options.length < 2) out.push(`${where}: the prediction needs at least two options.`);
  if (!d.prediction.options.some((x) => x.likely)) out.push(`${where}: mark at least one prediction option as likely.`);
  if (d.events.length < 3) out.push(`${where} needs at least three events in the week.`);
  const first = d.inputs.weeks[0];
  for (const e of d.events) {
    if (!first?.tasks.some((t) => t.id === e.task)) out.push(`${where}: the event “${e.title}” names a task that isn’t in the first week.`);
    if (!e.feedback) out.push(`${where}: the event “${e.title}” needs its feedback.`);
    if (e.askPrompt && e.answer.prompt === null) out.push(`${where}: the event “${e.title}” asks about timing but has no reviewed answer.`);
  }
  if (d.explanations.length < 2) out.push(`${where} needs at least two explanations to compare.`);
  if (d.decisions.length < 2) out.push(`${where} needs at least two decisions to choose from.`);
  const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);
  if (!d.explanations.some(strong)) out.push(`${where}: at least one explanation should be a strong, unflagged answer.`);
  if (!d.decisions.some(strong)) out.push(`${where}: at least one decision should be a strong, unflagged answer.`);
  for (const o of [...d.explanations, ...d.decisions]) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  const testable = d.inputs.interventions.filter((x) => x.kind !== "hiring");
  if (!testable.length) out.push(`${where} needs at least one change to test.`);
  for (const x of d.inputs.interventions) {
    if (x.active) out.push(`${where}: the change “${x.label}” starts switched on. Learners switch changes on themselves.`);
    if (x.kind !== "hiring" && x.kind !== "cover" && !x.cause && !x.category)
      out.push(`${where}: the change “${x.label}” needs a cause or category it affects.`);
    if (x.kind !== "hiring" && !x.evidence) out.push(`${where}: the change “${x.label}” needs the evidence that would verify it.`);
  }
  // The point of the case: something to find. Reviewed rework, and pressure in the plan.
  if (!validateInputs(d.inputs).length) {
    const r = calculate(d.inputs);
    if (!r.weeks.some((w) => w.reworkTagged > 0)) out.push(`${where}: no task is reviewed as avoidable rework, so there’s nothing for a change to test.`);
    if (r.weeks.some((w) => !w.partitionOk)) out.push(`${where}: a week’s categories don’t add up to its total.`);
  }
  return out;
}

export const labApproved = (d: Pick<WorkloadLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.quality && a.partnerships && a.privacy && a.pilot && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the sign-off and its review date. */
export function workloadHardProblems(d: WorkloadLabData, today: string): string[] {
  const out = caseProblems(d);
  if (!labApproved(d))
    out.push(
      `“${d.title}”: record the owner, the Care Coordination operations, Quality/clinical governance, Partnerships, privacy and pilot-group reviewers, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no reviewed tags, likely answer, feedback, levels, flags, outcome or debrief. */
export function workloadForReaders<T extends WorkloadLabData>(b: T): T {
  // The tasks the events become carry the reviewed category, causes and timing: the learner supplies their own.
  const asked = new Set(b.events.map((e) => e.task));
  const weeks = b.inputs.weeks.map((w, k) =>
    k
      ? w
      : {
          ...w,
          tasks: w.tasks.map((t) => {
            if (!asked.has(t.id)) return t;
            const { prompt: _prompt, ...rest } = t;
            void _prompt;
            return { ...rest, category: "other" as const, causes: [] };
          }),
        },
  );
  return {
    ...b,
    inputs: { ...b.inputs, weeks },
    prediction: { ...b.prediction, options: b.prediction.options.map((o) => ({ ...o, likely: false })) },
    events: b.events.map((e) => ({ ...e, answer: { category: "other", causes: [], prompt: null }, feedback: "" })),
    explanations: b.explanations.map((o) => ({ ...o, feedback: "", levels: {}, flags: [] })),
    decisions: b.decisions.map((o) => ({ ...o, feedback: "", outcome: "", levels: {}, flags: [] })),
    debrief: "",
    followingWeek: "",
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

export function parseWorkloadLab(o: Raw, where: string, h: ParseHelpers): WorkloadLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pr = obj(o.prediction);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const option = (x: unknown, k: number): Option => {
    const p = obj(x);
    return { id: id(p.id, `o${k + 1}`), text: s(p.text, 400), feedback: s(p.feedback, 800), levels: levels(p.levels), flags: flags(p.flags) };
  };
  const data: WorkloadLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    storyVersion: s(o.storyVersion, 40) || "1",
    taxonomyVersion: s(o.taxonomyVersion, 40) || "workload-taxonomy-1",
    story: {
      character: s(st.character, 60),
      role: s(st.role, 160),
      coordinator: s(st.coordinator, 60),
      situation: s(st.situation, 1200),
      transmission: { who: s(obj(st.transmission).who, 60), text: s(obj(st.transmission).text, 300) },
      principalView: s(st.principalView, 600),
      coordinatorView: s(st.coordinatorView, 600),
      consequence: s(st.consequence, 600),
      dilemma: s(st.dilemma, 300),
    },
    inputs: cleanInputs(o.inputs),
    prediction: {
      prompt: s(pr.prompt, 300),
      hoursPrompt: s(pr.hoursPrompt, 300),
      options: arr(pr.options)
        .slice(0, 8)
        .map((x, k) => {
          const c = obj(x);
          return { id: id(c.id, `p${k + 1}`), text: s(c.text, 200), likely: c.likely === true };
        }),
    },
    events: arr(o.events)
      .slice(0, 12)
      .map((x, k) => {
        const e = obj(x);
        const a = obj(e.answer);
        return {
          id: id(e.id, `e${k + 1}`),
          day: typeof e.day === "number" && Number.isInteger(e.day) && e.day >= 0 && e.day <= 4 ? e.day : 0,
          title: s(e.title, 120),
          text: s(e.text, 800),
          task: s(e.task, 40),
          detail: s(e.detail, 600),
          askPrompt: e.askPrompt === true,
          answer: {
            category: typeof a.category === "string" && a.category in CATEGORIES ? (a.category as Category) : "other",
            causes: arr(a.causes).filter((c): c is Cause => typeof c === "string" && c in CAUSES),
            prompt: typeof a.prompt === "boolean" ? a.prompt : null,
          },
          feedback: s(e.feedback, 800),
        };
      }),
    explanations: arr(o.explanations).slice(0, 6).map(option),
    decisions: arr(o.decisions)
      .slice(0, 6)
      .map((x, k) => ({ ...option(x, k), outcome: s(obj(x).outcome, 800) })),
    debrief: s(o.debrief, 1500),
    followingWeek: s(o.followingWeek, 1000),
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
      partnerships: s(ap.partnerships, 120),
      privacy: s(ap.privacy, 120),
      pilot: s(ap.pilot, 120),
      approvedOn: s(ap.approvedOn, 10),
      reviewBy: s(ap.reviewBy, 10),
    },
  };
  if (!data.inputs.weeks.length) unfinished(`${where} needs its case: the observed week and the plan.`);
  return data;
}
