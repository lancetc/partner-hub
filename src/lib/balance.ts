/*
  Dignity of Risk and Duty of Care Balance Scale (docs/balance-scale.md): a Magazine block where a learner
  builds a plan around a person's choice that carries risk. Everything here is pure, so the server, the
  learner's page and the editor's preview run the same rules.

  - The scale is qualitative. No number says one person's choice cancels a risk: each case has authored
    criteria, and a plan is "balanced" only when all of them are met with nothing over-restrictive or unsafe in it.
  - A card the person is asked about only counts if they accept it. An offer isn't a completed referral.
  - A new fact (a fall, a blocked exit) brings its own must-do steps. No stack of minor cards stands in for them.
  - What marks a card right stays on the server until the learner has used it.
*/

// ---------------------------------------------------------------------------------------------
// The case's parts
// ---------------------------------------------------------------------------------------------

export const PANS = { person: "What matters to the person", safety: "How we support safety" } as const;
export type Pan = keyof typeof PANS;

export const DIMENSIONS = {
  choice: "Understanding and supporting their choice",
  risk: "Naming the risk",
  mitigation: "An agreed mitigation",
  provider_action: "Clinical, provider or WHS action",
  record: "Recording it",
  review: "Review owner and trigger",
} as const;
export type Dimension = keyof typeof DIMENSIONS;

/** How the debrief reports, each separately. */
export const AREAS = {
  choice: { label: "Choice support", dims: ["choice"] as Dimension[] },
  risk: { label: "Risk recognition", dims: ["risk"] as Dimension[] },
  mitigation: { label: "Proportionate mitigation", dims: ["mitigation"] as Dimension[] },
  record: { label: "Documentation and review", dims: ["record", "review"] as Dimension[] },
  escalation: { label: "Escalation and provider action", dims: ["provider_action"] as Dimension[] },
} as const;
export type Area = keyof typeof AREAS;

export const GROUPS = {
  listen: "Listen and inform",
  practical: "Practical adjustments",
  provider: "Clinical and provider action",
  record: "Record and review",
} as const;
export type Group = keyof typeof GROUPS;

export const EFFECTS = {
  supports: "Supports a balanced plan",
  contextual: "Can help, depending on the facts",
  overrestricts: "Over-restrictive here",
  unsafe: "Unsafe, or leaves the risk with no one",
} as const;
export type Effect = keyof typeof EFFECTS;

export const RISK_KINDS = {
  participant: "Risk to the person",
  others: "Risk to staff or others during funded care",
  provider: "A condition on funded services",
} as const;
export type RiskKind = keyof typeof RISK_KINDS;

export const URGENCY = { routine: "Routine", emerging: "Emerging", urgent: "Urgent" } as const;
export type Urgency = keyof typeof URGENCY;

export const SAYING_KINDS = { good: "Supports her choice and the risk", controlling: "Controlling", dismissive: "Leaves the risk unmanaged" } as const;
export type SayingKind = keyof typeof SAYING_KINDS;

export type BalanceQuestion = { id: string; label: string; answer: string; useful: boolean; why: string };
export type GoalCard = { id: string; label: string; right: boolean; why: string };
export type RiskCard = { id: string; label: string; kind: RiskKind; real: boolean; required: boolean; why: string };
export type BalanceAction = {
  id: string;
  label: string;
  group: Group;
  dims: Dimension[];
  effect: Effect;
  /** Why it helps or doesn't, in this case. Shown once the learner has used it. */
  rationale: string;
  /** The person is asked whether they want it; it only counts if they accept. */
  asks: boolean;
  accepts: boolean;
  /** What they say when asked. */
  response: string;
  /** Only offered after the new fact. */
  after: boolean;
};
export type Criterion = {
  id: string;
  label: string;
  dim: Dimension;
  pan: Pan;
  /** Any one of these, in the plan (and accepted, if the person is asked), meets it. */
  anyOf: string[];
  /** What the learner is asked when it's missing. Never names a card. */
  prompt: string;
  /** Only applies after the new fact. */
  after: boolean;
  /** Must be met before the case can be finished: nothing else stands in for it. */
  critical: boolean;
};
export type Saying = { id: string; text: string; kind: SayingKind; feedback: string };

export type BalanceBlockData = {
  title: string;
  intro: string;
  person: { name: string; age: number | null; about: string };
  learnerRole: string;
  /** The person's own words. */
  quote: string;
  situation: string;
  currentPlan: string;
  signal: string;
  urgency: Urgency;
  facts: string[];
  questions: BalanceQuestion[];
  goals: GoalCard[];
  risks: RiskCard[];
  actions: BalanceAction[];
  criteria: Criterion[];
  sayings: Saying[];
  event: { title: string; facts: string[] } | null;
  /** Debrief: what risk remains, who reviews, and when. */
  residual: string;
  reviewOwner: string;
  reviewTrigger: string;
  /** A fictional teaching example of the care-plan note. */
  note: string;
  source: { title: string; version: string; policyId: string; effectiveOn: string; reviewOn: string };
  approval: { owner: string; clinical: string; quality: string; operations: string; whs: string; approvedOn: string };
};

export const BALANCE_NOTICE =
  "This is a training case with made-up people. Nothing here changes a real care plan, incident register, supplier record or clinical task, and finishing it isn’t a clinical sign-off.";
export const BALANCED_LABEL = "Balanced plan for this scenario";
export const BALANCED_NOTE = "Residual risk remains. These steps explain the choice, support agreed safeguards and set out when to review or escalate.";
export const NOT_SIGNOFF = "This practice result isn’t a clinical competency sign-off or an authorisation to make live service decisions.";

/** WHS sign-off is needed when the case involves a risk to workers or others. */
export const needsWhs = (b: Pick<BalanceBlockData, "risks">) => b.risks.some((r) => r.kind === "others" && r.real);

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const ids = (v: unknown, max = 20) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/**
  The block's fields, checked. Publishing needs the person's own words, a question worth asking, the right
  goal, a real risk, cards for every criterion, criteria on both sides of the scale, an unsafe card to learn
  from, the debrief's review owner and trigger, and the sign-off.
*/
export function parseBalance(o: Raw, where: string, h: ParseHelpers): BalanceBlockData {
  const { str, idOf, list, unfinished } = h;
  const p = obj(o.person);
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);

  const questions = list(o.questions, where, "questions", 8).map((q, i): BalanceQuestion => ({
    id: idOf(q.id, `${where} question ${i + 1}`),
    label: str(q.label, `${where} question ${i + 1}`, { required: true, max: 200 }) ?? "",
    answer: str(q.answer, `${where} question ${i + 1} answer`, { required: true, max: 600 }) ?? "",
    useful: q.useful === true,
    why: str(q.why, `${where} question ${i + 1}: why it does or doesn’t help`, { max: 400 }) ?? "",
  }));
  if (!questions.some((q) => q.useful)) unfinished(`${where} needs at least one question worth asking before planning.`);

  const goals = list(o.goals, where, "goal cards", 6).map((g, i): GoalCard => ({
    id: idOf(g.id, `${where} goal card ${i + 1}`),
    label: str(g.label, `${where} goal card ${i + 1}`, { required: true, max: 200 }) ?? "",
    right: g.right === true,
    why: str(g.why, `${where} goal card ${i + 1}: why`, { max: 400 }) ?? "",
  }));
  if (goals.filter((g) => g.right).length !== 1) unfinished(`${where} needs exactly one goal card that is the person’s own goal.`);

  const risks = list(o.risks, where, "risk cards", 8).map((r, i): RiskCard => ({
    id: idOf(r.id, `${where} risk card ${i + 1}`),
    label: str(r.label, `${where} risk card ${i + 1}`, { required: true, max: 200 }) ?? "",
    kind: oneOf(r.kind, Object.keys(RISK_KINDS) as RiskKind[], "participant"),
    real: r.real === true,
    required: r.real === true && r.required === true,
    why: str(r.why, `${where} risk card ${i + 1}: why`, { required: true, max: 400 }) ?? "",
  }));
  if (!risks.some((r) => r.required)) unfinished(`${where} needs at least one risk the facts clearly point to, marked as one the learner must name.`);

  const actions = list(o.actions, where, "action cards", 24).map((a, i): BalanceAction => {
    const asks = a.asks === true;
    return {
      id: idOf(a.id, `${where} action card ${i + 1}`),
      label: str(a.label, `${where} action card ${i + 1}`, { required: true, max: 240 }) ?? "",
      group: oneOf(a.group, Object.keys(GROUPS) as Group[], "listen"),
      dims: [...new Set(ids(a.dims).filter((d): d is Dimension => d in DIMENSIONS))],
      effect: oneOf(a.effect, Object.keys(EFFECTS) as Effect[], "contextual"),
      rationale: str(a.rationale, `${where} action card ${i + 1}: why it helps or doesn’t`, { required: true, max: 600 }) ?? "",
      asks,
      accepts: asks ? a.accepts === true : true,
      response: asks ? (str(a.response, `${where} action card ${i + 1}: what the person says`, { required: true, max: 400 }) ?? "") : "",
      after: a.after === true,
    };
  });
  if (!actions.some((a) => a.effect === "unsafe" && !a.after))
    unfinished(`${where} needs at least one unsafe card before the new fact, so the critical rule has something to catch.`);
  const actionIds = new Set(actions.map((a) => a.id));

  const criteria = list(o.criteria, where, "criteria", 16).map((c, i): Criterion => {
    const at = `${where} criterion ${i + 1}`;
    const anyOf = ids(c.anyOf).filter((x) => actionIds.has(x));
    if (!anyOf.length) unfinished(`${at} needs at least one card that meets it.`);
    const after = c.after === true;
    const meets = actions.filter((a) => anyOf.includes(a.id));
    if (meets.some((a) => a.effect === "unsafe" || a.effect === "overrestricts")) unfinished(`${at} can’t be met by an over-restrictive or unsafe card.`);
    if (!after && meets.length && meets.every((a) => a.after)) unfinished(`${at} applies before the new fact, so it needs a card that’s offered before it.`);
    return {
      id: idOf(c.id, at),
      label: str(c.label, `${at} label`, { required: true, max: 160 }) ?? "",
      dim: oneOf(c.dim, Object.keys(DIMENSIONS) as Dimension[], "choice"),
      pan: oneOf(c.pan, Object.keys(PANS) as Pan[], "person"),
      anyOf,
      prompt: str(c.prompt, `${at}: what the learner is asked when it’s missing`, { required: true, max: 300 }) ?? "",
      after,
      critical: c.critical === true,
    };
  });
  const before = criteria.filter((c) => !c.after);
  if (!before.some((c) => c.pan === "person") || !before.some((c) => c.pan === "safety"))
    unfinished(`${where} needs criteria on both sides of the scale: what matters to the person, and how we support safety.`);

  const sayings = list(o.sayings, where, "phrases", 5).map((s, i): Saying => ({
    id: idOf(s.id, `${where} phrase ${i + 1}`),
    text: str(s.text, `${where} phrase ${i + 1}`, { required: true, max: 700 }) ?? "",
    kind: oneOf(s.kind, Object.keys(SAYING_KINDS) as SayingKind[], "good"),
    feedback: str(s.feedback, `${where} phrase ${i + 1} feedback`, { required: true, max: 400 }) ?? "",
  }));
  if (!sayings.some((s) => s.kind === "good")) unfinished(`${where} needs a phrase that says it well.`);

  const ev = o.event && typeof o.event === "object" ? obj(o.event) : null;
  const event = ev ? { title: str(ev.title, `${where} new fact title`, { required: true, max: 160 }) ?? "", facts: texts(ev.facts, "new fact", 500, 6) } : null;
  if (event && !event.facts.length) unfinished(`${where}: the new fact needs at least one fact.`);
  if (event && !criteria.some((c) => c.after && c.critical)) unfinished(`${where}: the new fact needs at least one must-do criterion that applies after it.`);
  if (!event && criteria.some((c) => c.after)) unfinished(`${where} has criteria for after a new fact, but no new fact.`);

  const s = obj(o.source);
  const ap = obj(o.approval);
  const source = {
    title: str(s.title, `${where} source`, { max: 200 }) ?? "",
    version: str(s.version, `${where} source version`, { max: 80 }) ?? "",
    policyId: str(s.policyId, `${where} internal policy id`, { max: 80 }) ?? "",
    effectiveOn: date(s.effectiveOn),
    reviewOn: date(s.reviewOn),
  };
  const approval = {
    owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
    clinical: str(ap.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    operations: str(ap.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    whs: str(ap.whs, `${where} WHS reviewer`, { max: 120 }) ?? "",
    approvedOn: date(ap.approvedOn),
  };
  if (!balanceApproved({ approval, source, risks }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Clinical, Quality and Care Operations reviewers${needsWhs({ risks }) ? ", the WHS reviewer (this case involves a risk to workers)" : ""}, the date, and the policy source and its version.`,
    );
  const reviewOwner = str(o.reviewOwner, `${where}: who owns the review`, { required: true, max: 160 }) ?? "";
  const reviewTrigger = str(o.reviewTrigger, `${where}: what triggers a review`, { required: true, max: 300 }) ?? "";
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    person: {
      name: str(p.name, `${where}: the person’s name`, { required: true, max: 80 }) ?? "",
      age: p.age === null || p.age === undefined || p.age === "" ? null : Math.min(110, Math.max(18, Math.round(Number(p.age)) || 80)),
      about: str(p.about, `${where}: about the person`, { max: 600 }) ?? "",
    },
    learnerRole: str(o.learnerRole, `${where}: who the learner is`, { required: true, max: 200 }) ?? "",
    quote: str(o.quote, `${where}: the person’s own words`, { required: true, max: 400 }) ?? "",
    situation: str(o.situation, `${where} situation`, { required: true, max: 1200 }) ?? "",
    currentPlan: str(o.currentPlan, `${where} current plan`, { max: 400 }) ?? "",
    signal: str(o.signal, `${where} risk signal`, { max: 400 }) ?? "",
    urgency: oneOf(o.urgency, Object.keys(URGENCY) as Urgency[], "emerging"),
    facts: texts(o.facts, "fact", 400, 8),
    questions,
    goals,
    risks,
    actions,
    criteria,
    sayings,
    event,
    residual: str(o.residual, `${where} residual risk`, { max: 600 }) ?? "",
    reviewOwner,
    reviewTrigger,
    note: str(o.note, `${where}: the teaching care-plan note`, { required: true, max: 2500 }) ?? "",
    source,
    approval,
  };
}

/** Whether a case has its sign-off: owner, Clinical, Quality, Care Operations, WHS when workers are at risk, a date and a source version. */
export const balanceApproved = (b: Pick<BalanceBlockData, "approval" | "risks"> & { source: { title: string; version: string } }) =>
  Boolean(
    b.approval.owner &&
    b.approval.clinical &&
    b.approval.quality &&
    b.approval.operations &&
    (!needsWhs(b) || b.approval.whs) &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version,
  );

/** The block as a learner's browser gets it: the situation and the cards' wording, without what marks them right or the new fact. */
export function balanceForReaders<T extends BalanceBlockData>(b: T): T {
  return {
    ...b,
    questions: b.questions.map((q) => ({ ...q, answer: "", useful: false, why: "" })),
    goals: b.goals.map((g) => ({ ...g, right: false, why: "" })),
    risks: b.risks.map((r) => ({ ...r, real: false, required: false, why: "" })),
    actions: b.actions.map((a) => ({ ...a, dims: [], effect: "contextual" as const, rationale: "", accepts: false, response: "" })),
    criteria: [],
    sayings: b.sayings.map((s) => ({ ...s, kind: "good" as const, feedback: "" })),
    event: b.event ? { title: "", facts: [] } : null,
    residual: "",
    reviewOwner: "",
    reviewTrigger: "",
    note: "",
  };
}

/** A copy with ids of its own, so two scales in one course never share an id. References follow. */
export function freshBalance(data: BalanceBlockData, tag = Math.random().toString(36).slice(2, 7)): BalanceBlockData {
  const re = (id: string) => `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}`;
  const c = structuredClone(data);
  return {
    ...c,
    questions: c.questions.map((x) => ({ ...x, id: re(x.id) })),
    goals: c.goals.map((x) => ({ ...x, id: re(x.id) })),
    risks: c.risks.map((x) => ({ ...x, id: re(x.id) })),
    actions: c.actions.map((x) => ({ ...x, id: re(x.id) })),
    criteria: c.criteria.map((x) => ({ ...x, id: re(x.id), anyOf: x.anyOf.map(re) })),
    sayings: c.sayings.map((x) => ({ ...x, id: re(x.id) })),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export const STAGES = ["Understand", "Name the tension", "Build the plan", "Test the plan"] as const;

export type BalanceState = {
  /** 0 understand, 1 name the tension, 2 build, 3 test. */
  stage: number;
  asked: string[];
  goal: string;
  risks: string[];
  tensionTries: number;
  plan: string[];
  /** Every card that has ever been in the plan: over-control and under-response leave a trace. */
  ever: string[];
  /** Each distinct plan, in order. */
  revisions: string[][];
  saying: string;
  firstSaying: string;
  eventSeen: boolean;
  /** Times they tried to finish with something still needed. */
  blocked: number;
};

export const emptyState = (): BalanceState => ({
  stage: 0,
  asked: [],
  goal: "",
  risks: [],
  tensionTries: 0,
  plan: [],
  ever: [],
  revisions: [],
  saying: "",
  firstSaying: "",
  eventSeen: false,
  blocked: 0,
});

const pick = (v: unknown, valid: Set<string>, max = 24) => [...new Set(ids(v, max).filter((x) => valid.has(x)))];

/** Saved work, checked against the case. */
export function cleanState(b: BalanceBlockData, raw: unknown): BalanceState {
  const r = obj(raw);
  const n = (v: unknown, hi: number) => (Number.isInteger(v) ? Math.min(hi, Math.max(0, v as number)) : 0);
  const actionIds = new Set(b.actions.map((a) => a.id));
  const eventSeen = r.eventSeen === true && Boolean(b.event);
  // Cards offered only after the new fact can't be in a plan before it.
  const allowed = new Set(b.actions.filter((a) => eventSeen || !a.after).map((a) => a.id));
  const sayingIds = new Set(b.sayings.map((s) => s.id));
  return {
    stage: n(r.stage, 3),
    asked: pick(r.asked, new Set(b.questions.map((q) => q.id))),
    goal: typeof r.goal === "string" && b.goals.some((g) => g.id === r.goal) ? r.goal : "",
    risks: pick(r.risks, new Set(b.risks.map((x) => x.id))),
    tensionTries: n(r.tensionTries, 99),
    plan: pick(r.plan, allowed),
    ever: pick(r.ever, actionIds, 48),
    revisions: (Array.isArray(r.revisions) ? r.revisions : []).slice(-40).map((x) => pick(x, actionIds)),
    saying: typeof r.saying === "string" && sayingIds.has(r.saying) ? r.saying : "",
    firstSaying: typeof r.firstSaying === "string" && sayingIds.has(r.firstSaying) ? r.firstSaying : "",
    eventSeen,
    blocked: n(r.blocked, 99),
  };
}

/** The learner's changes to the parts they own. The server never takes the stage or the new fact from them. */
export function applyChanges(b: BalanceBlockData, prev: BalanceState, raw: unknown): BalanceState {
  const next = cleanState(b, { ...prev, ...pickOwned(raw) });
  const plan = next.plan;
  const changed = prev.revisions.length === 0 ? plan.length > 0 : plan.join() !== prev.revisions[prev.revisions.length - 1].join();
  return {
    ...next,
    stage: prev.stage,
    eventSeen: prev.eventSeen,
    tensionTries: prev.tensionTries,
    blocked: prev.blocked,
    // Once the tension is named, it stays named.
    goal: prev.stage > 1 ? prev.goal : next.goal,
    risks: prev.stage > 1 ? prev.risks : next.risks,
    // Only add to the plan once building has started.
    plan: prev.stage >= 2 ? plan : prev.plan,
    ever: prev.stage >= 2 ? [...new Set([...prev.ever, ...plan])] : prev.ever,
    revisions: prev.stage >= 2 && changed ? [...prev.revisions, plan].slice(-40) : prev.revisions,
    saying: prev.stage >= 3 ? next.saying : prev.saying,
    firstSaying: prev.firstSaying || (prev.stage >= 3 ? next.saying : ""),
  };
}
function pickOwned(raw: unknown) {
  const r = obj(raw);
  // Only what was sent: a field left out keeps what was saved.
  return Object.fromEntries((["asked", "goal", "risks", "plan", "saying"] as const).filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
}

const actionOf = (b: BalanceBlockData, id: string) => b.actions.find((a) => a.id === id);
/** A card counts towards a criterion when it's in the plan and, if the person was asked, they accepted. */
const counts = (b: BalanceBlockData, s: BalanceState, id: string) => {
  const a = actionOf(b, id);
  return Boolean(a && s.plan.includes(id) && (!a.asks || a.accepts));
};
export const activeCriteria = (b: BalanceBlockData, s: BalanceState) => b.criteria.filter((c) => !c.after || s.eventSeen);
export const met = (b: BalanceBlockData, s: BalanceState, c: Criterion) => c.anyOf.some((id) => counts(b, s, id));

export type Scale = {
  balanced: boolean;
  /** -2 (leaning away from safety, towards leaving it) to 2 (leaning towards control). 0 is level. */
  tilt: number;
  label: string;
  /** A short sentence for each side, for the text view. */
  person: string;
  safety: string;
  /** What to think about next. Never a card's name, never a count of cards. */
  prompts: string[];
  note: string;
};

/** The scale, worked out from the authored criteria. Qualitative: it never claims to measure harm. */
export function scaleOf(b: BalanceBlockData, s: BalanceState): Scale {
  const active = activeCriteria(b, s);
  const side = (pan: Pan) => active.filter((c) => c.pan === pan);
  const missing = (pan: Pan) => side(pan).filter((c) => !met(b, s, c));
  const plan = s.plan.map((id) => actionOf(b, id)).filter((a): a is BalanceAction => Boolean(a));
  const over = plan.some((a) => a.effect === "overrestricts");
  const under = plan.some((a) => a.effect === "unsafe");
  const mp = missing("person");
  const ms = missing("safety");
  // Critical steps after a new fact come first: nothing else stands in for them.
  const order = (cs: Criterion[]) => [...cs].sort((x, y) => Number(y.critical) - Number(x.critical));
  const balanced = !mp.length && !ms.length && !over && !under;
  const share = (pan: Pan) => (side(pan).length ? (side(pan).length - missing(pan).length) / side(pan).length : 1);
  const tilt = Math.max(-2, Math.min(2, Math.round((share("safety") - share("person")) * 2) + (over ? 1 : 0) - (under ? 1 : 0)));
  const prompts = [
    ...(under ? ["Something in your plan leaves the risk with no one looking after it. Look at each card again."] : []),
    ...(over ? ["Something in your plan takes a choice away from the person that these facts don’t justify."] : []),
    ...order(ms)
      .slice(0, 1)
      .map((c) => c.prompt),
    ...order(mp)
      .slice(0, 1)
      .map((c) => c.prompt),
  ];
  const name = b.person.name || "the person";
  return {
    balanced,
    tilt: balanced ? 0 : tilt,
    label: balanced
      ? BALANCED_LABEL
      : under
        ? "Leaning towards leaving the risk unmanaged"
        : over
          ? "Leaning towards control"
          : mp.length && ms.length
            ? "Both sides need more"
            : mp.length
              ? `${PANS.person} needs more`
              : `${PANS.safety} needs more`,
    person: over
      ? `Something here takes a choice from ${name}.`
      : mp.length
        ? `Still needs work: ${name}’s choice isn’t fully understood or supported yet.`
        : `${name}’s goal and choice are supported.`,
    safety: under
      ? "Something here leaves the risk unmanaged."
      : ms.length
        ? "Still needs work: the risk isn’t fully responded to yet."
        : "The risk has a proportionate response.",
    prompts,
    note: balanced ? BALANCED_NOTE : "",
  };
}

/** What the person said when asked about each card in the plan that needed their answer. */
export function responsesOf(b: BalanceBlockData, s: BalanceState) {
  return Object.fromEntries(
    s.plan
      .map((id) => actionOf(b, id))
      .filter((a): a is BalanceAction => Boolean(a?.asks))
      .map((a) => [a.id, { accepts: a.accepts, response: a.response }]),
  );
}

/** What each question the learner asked turned up. */
export const answersOf = (b: BalanceBlockData, s: BalanceState) =>
  Object.fromEntries(b.questions.filter((q) => s.asked.includes(q.id)).map((q) => [q.id, q.answer]));

export type TensionFeedback = {
  ok: boolean;
  goal: { label: string; right: boolean; why: string } | null;
  risks: { id: string; label: string; real: boolean; why: string }[];
  /** How many risks the facts point to that they didn't name. Not which ones. */
  missing: number;
};
export function checkTension(b: BalanceBlockData, s: BalanceState): TensionFeedback {
  const goal = b.goals.find((g) => g.id === s.goal);
  const chosen = b.risks.filter((r) => s.risks.includes(r.id));
  const missing = b.risks.filter((r) => r.required && !s.risks.includes(r.id)).length;
  return {
    ok: Boolean(goal?.right) && missing === 0 && chosen.every((r) => r.real),
    goal: goal ? { label: goal.label, right: goal.right, why: goal.why } : null,
    risks: chosen.map((r) => ({ id: r.id, label: r.label, real: r.real, why: r.why })),
    missing,
  };
}

/** On to the next step, if this one is done. Returns why not otherwise. */
export function advance(
  b: BalanceBlockData,
  s: BalanceState,
): { state: BalanceState; tension?: TensionFeedback } | { problem: string; tension?: TensionFeedback; state?: BalanceState } {
  if (s.stage === 0) return s.asked.length ? { state: { ...s, stage: 1 } } : { problem: "Ask at least one question first. What do you need to understand?" };
  if (s.stage === 1) {
    if (!s.goal || !s.risks.length) return { problem: "Choose the person’s goal and at least one risk." };
    const tension = checkTension(b, s);
    const tried = { ...s, tensionTries: s.tensionTries + 1 };
    if (!tension.ok) return { problem: "Look at the tension again before you plan.", tension, state: tried };
    return { state: { ...tried, stage: 2 }, tension };
  }
  if (s.stage === 2) {
    const unsafe = s.plan.map((id) => actionOf(b, id)).filter((a): a is BalanceAction => a?.effect === "unsafe");
    if (unsafe.length) return { problem: `Before you test this plan: “${unsafe[0].label}”. ${unsafe[0].rationale}` };
    if (!s.plan.length) return { problem: "Add something to the plan first." };
    return { state: { ...s, stage: 3 } };
  }
  return { problem: "Finish when you’re ready." };
}

/** The new fact arrives once they've chosen what to say. */
export function seeEvent(b: BalanceBlockData, s: BalanceState): { state: BalanceState } | { problem: string } {
  if (s.stage !== 3) return { problem: "Build the plan first." };
  if (!s.saying) return { problem: "Choose what you’d say first." };
  return { state: { ...s, eventSeen: Boolean(b.event) } };
}

/** What's in the way of finishing: anything unsafe, and every must-do step after the new fact. */
export function finishProblems(b: BalanceBlockData, s: BalanceState): string[] {
  if (s.stage !== 3) return ["Build and test the plan first."];
  if (!s.saying) return ["Choose what you’d say first."];
  if (b.event && !s.eventSeen) return ["See what happens next first."];
  const out: string[] = [];
  const unsafe = s.plan.map((id) => actionOf(b, id)).find((a) => a?.effect === "unsafe");
  if (unsafe) out.push(`“${unsafe.label}”: ${unsafe.rationale}`);
  for (const c of activeCriteria(b, s).filter((x) => x.critical && !met(b, s, x))) out.push(c.prompt);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The debrief: each area on its own, and patterns of over-control and under-response
// ---------------------------------------------------------------------------------------------

export const RATING = ["Worth another look", "Partly there", "Strong"] as const;
export type BalanceResult = {
  balanced: boolean;
  areas: Record<Area, { rating: (typeof RATING)[number]; notes: string[] }>;
  flags: { overControl: boolean; underResponse: boolean; tensionTries: number; revisions: number; blocked: number; usefulQuestion: boolean };
};

export function scoreBalance(b: BalanceBlockData, s: BalanceState): BalanceResult {
  const everCards = s.ever.map((id) => actionOf(b, id)).filter((a): a is BalanceAction => Boolean(a));
  const saying = b.sayings.find((x) => x.id === s.firstSaying);
  const overControl = everCards.some((a) => a.effect === "overrestricts") || saying?.kind === "controlling";
  const underResponse = everCards.some((a) => a.effect === "unsafe") || saying?.kind === "dismissive";
  const usefulQuestion = b.questions.some((q) => q.useful && s.asked.includes(q.id));
  const areas = {} as BalanceResult["areas"];
  for (const area of Object.keys(AREAS) as Area[]) {
    const dims = AREAS[area].dims;
    const notes: string[] = [];
    let score: number;
    if (area === "risk") {
      const t = checkTension(b, s);
      score = s.tensionTries <= 1 ? 1 : s.tensionTries === 2 ? 0.6 : 0.3;
      if (s.tensionTries > 1) notes.push(`You named the tension on try ${s.tensionTries}.`);
      if (t.ok) notes.push("The final tension matched the facts.");
    } else {
      const cs = activeCriteria(b, s).filter((c) => dims.includes(c.dim));
      const got = cs.filter((c) => met(b, s, c));
      score = cs.length ? got.length / cs.length : 1;
      for (const c of cs.filter((x) => !met(b, s, x))) notes.push(`Missing: ${c.label}.`);
      const strayed = everCards.filter((a) => (a.effect === "overrestricts" || a.effect === "unsafe") && a.dims.some((d) => dims.includes(d)));
      for (const a of strayed) notes.push(`At one point the plan had “${a.label}”.`);
      score -= 0.25 * strayed.length;
      if (area === "choice" && !usefulQuestion) {
        score -= 0.25;
        notes.push("None of your questions got to why the person is choosing this.");
      }
      if (area === "choice" && saying && saying.kind !== "good") {
        score -= 0.25;
        notes.push(`What you first chose to say was ${SAYING_KINDS[saying.kind].toLowerCase()}.`);
      }
    }
    areas[area] = { rating: RATING[score >= 0.8 ? 2 : score >= 0.45 ? 1 : 0], notes };
  }
  return {
    balanced: scaleOf(b, s).balanced,
    areas,
    flags: { overControl, underResponse, tensionTries: s.tensionTries, revisions: s.revisions.length, blocked: s.blocked, usefulQuestion },
  };
}

export function buildDebrief(b: BalanceBlockData, s: BalanceState, r: BalanceResult) {
  const scale = scaleOf(b, s);
  return {
    balanced: r.balanced,
    scale,
    areas: (Object.keys(AREAS) as Area[]).map((a) => ({ id: a, label: AREAS[a].label, ...r.areas[a] })),
    flags: r.flags,
    criteria: activeCriteria(b, s).map((c) => ({ id: c.id, label: c.label, pan: c.pan, met: met(b, s, c), prompt: c.prompt, after: c.after })),
    plan: s.plan
      .map((id) => actionOf(b, id))
      .filter((a): a is BalanceAction => Boolean(a))
      .map((a) => ({
        id: a.id,
        label: a.label,
        group: a.group,
        effect: a.effect,
        rationale: a.rationale,
        asks: a.asks,
        accepts: a.accepts,
        response: a.response,
      })),
    left: b.actions
      .filter((a) => !s.plan.includes(a.id) && (!a.after || s.eventSeen))
      .map((a) => ({ id: a.id, label: a.label, effect: a.effect, rationale: a.rationale })),
    questions: b.questions.map((q) => ({ id: q.id, label: q.label, asked: s.asked.includes(q.id), useful: q.useful, why: q.why, answer: q.answer })),
    tension: checkTension(b, s),
    goal: b.goals.find((g) => g.right)?.label ?? "",
    saying: b.sayings.find((x) => x.id === s.saying) ?? null,
    firstSaying: s.firstSaying !== s.saying ? (b.sayings.find((x) => x.id === s.firstSaying) ?? null) : null,
    goodSaying: b.sayings.find((x) => x.kind === "good") ?? null,
    event: s.eventSeen ? b.event : null,
    residual: b.residual,
    reviewOwner: b.reviewOwner,
    reviewTrigger: b.reviewTrigger,
    note: b.note,
    source: b.source,
  };
}
export type BalanceDebrief = ReturnType<typeof buildDebrief>;

/** Everything the learner's page needs that only the full case can work out. */
export const learnerView = (b: BalanceBlockData, s: BalanceState) => ({
  scale: s.stage >= 2 ? scaleOf(b, s) : null,
  responses: responsesOf(b, s),
  answers: answersOf(b, s),
  event: s.eventSeen ? b.event : null,
  saying: s.saying ? (b.sayings.find((x) => x.id === s.saying) ?? null) : null,
});
export type LearnerView = ReturnType<typeof learnerView>;
