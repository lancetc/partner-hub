/*
  "Where Is the Line?" (docs/line-drawer.md): a Magazine block of self-managed requests. For each card the learner
  chooses a lane (the participant's choice, check and agree first, or cannot authorise as requested), the
  governing reason, and a next action. Everything here is pure, so the server, the learner's page and the
  editor's preview run the same rules.

  - "Cannot authorise as requested" is about the funded service, worker or claim asked for. It never means
    overruling a person's informed refusal or controlling how they live.
  - The answer for a card comes back only once the learner has made all three choices for it.
  - Lane, reason and action are read separately. Speed is never measured. Finishing is not competence.
*/

export const LANES = {
  choice: {
    label: "Participant’s choice",
    text: "The person decides. Carry it out or respect it, and record or act on any duty that comes with it.",
    report: "Client’s choice",
  },
  check: {
    label: "Check and agree first",
    text: "Something has to be checked, assessed, quoted or agreed before a funded arrangement can go ahead.",
    report: "Conditional",
  },
  cannot: {
    label: "Cannot authorise as requested",
    text: "Trilogy Care can’t authorise the funded service, worker or claim as asked. Explain why and offer a safe, lawful route.",
    report: "Provider veto",
  },
} as const;
export type Lane = keyof typeof LANES;
export const LANE_ORDER: Lane[] = ["choice", "check", "cannot"];
/** How strict a lane is, for telling over-control from approving before checks. */
const strictness = (l: Lane) => LANE_ORDER.indexOf(l);

export type LineCase = {
  id: string;
  /** The person's request, in their words. */
  request: string;
  facts: string[];
  /** "What do you know?": more context, optional to open. */
  know: string;
  funding: string;
  lane: Lane;
  reasons: { id: string; text: string }[];
  /** The governing reason, and any others that are just as right for this version of the case. */
  primary: string;
  accepted: string[];
  actions: { id: string; text: string }[];
  acceptedActions: string[];
  /** One sentence about the person's choice in this case. */
  choice: string;
  next: string;
  /** "See why": the policy and the nuance. */
  why: string;
  secondary: string[];
  /** A choice that needs a debrief rather than just a wrong mark (ignoring falls, booking an unchecked worker). */
  critical: { lanes: Lane[]; actions: string[]; text: string } | null;
  /** For the second pass: one new fact, and whether the lane changes. */
  twist: { fact: string; lane: Lane; why: string } | null;
  source: { refs: string[]; sop: string; approver: string; effectiveOn: string; reviewOn: string; escalation: string };
  status: "draft" | "approved" | "needs_review";
};

export type LineBlockData = {
  title: string;
  intro: string;
  learnerRole: string;
  shuffle: boolean;
  cases: LineCase[];
  source: { title: string; version: string };
  approval: { owner: string; sme: string; clinical: string; quality: string; approvedOn: string };
};

export const LINE_NOTICE =
  "A practice activity with fictional people. Its answers apply to these facts. It can’t approve funding, roster a worker, create an incident or contact anyone.";
export const NOT_COMPETENCE =
  "Finishing this isn’t clinical competence, or permission to approve real requests. A real case may need clinical or Quality advice.";

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
const ids = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);

/**
  The block's fields, checked. Each case needs a request, facts, three or four reasons with an accepted governing
  one, actions with an accepted one, its explanation, a source, a review date and approval. A "cannot authorise"
  case needs an action that explains and offers an alternative: "no" alone never gets full credit.
*/
export function parseLine(o: Raw, where: string, h: ParseHelpers): LineBlockData {
  const { str, idOf, list, unfinished } = h;
  const cases = list(o.cases, where, "cases", 16).map((c, i): LineCase => {
    const at = `${where} case ${i + 1}`;
    const texts = (v: unknown, what: string, max: number, n: number) =>
      (Array.isArray(v) ? v : [])
        .slice(0, n)
        .map((x, j) => str(x, `${at} ${what} ${j + 1}`, { max }) ?? "")
        .filter(Boolean);
    const reasons = list(c.reasons, at, "reasons", 5).map((r, j) => ({
      id: idOf(r.id, `${at} reason ${j + 1}`),
      text: str(r.text, `${at} reason ${j + 1}`, { required: true, max: 240 }) ?? "",
    }));
    if (reasons.length < 3) unfinished(`${at} needs three or four reasons to choose from.`);
    const reasonIds = new Set(reasons.map((r) => r.id));
    const primary = typeof c.primary === "string" && reasonIds.has(c.primary) ? c.primary : "";
    if (!primary) unfinished(`${at} needs its governing reason.`);
    const accepted = [...new Set([primary, ...ids(c.accepted).filter((x) => reasonIds.has(x))].filter(Boolean))];
    const actions = list(c.actions, at, "actions", 5).map((r, j) => ({
      id: idOf(r.id, `${at} action ${j + 1}`),
      text: str(r.text, `${at} action ${j + 1}`, { required: true, max: 300 }) ?? "",
    }));
    if (actions.length < 2) unfinished(`${at} needs at least two next actions to choose from.`);
    const actionIds = new Set(actions.map((r) => r.id));
    const acceptedActions = ids(c.acceptedActions).filter((x) => actionIds.has(x));
    if (!acceptedActions.length) unfinished(`${at} needs at least one accepted next action.`);
    const lane = oneOf(c.lane, LANE_ORDER, "check");
    const cr = c.critical && typeof c.critical === "object" ? obj(c.critical) : null;
    const tw = c.twist && typeof c.twist === "object" ? obj(c.twist) : null;
    const s = obj(c.source);
    const source = {
      refs: texts(s.refs, "source", 240, 6),
      sop: str(s.sop, `${at} SOP reference`, { max: 120 }) ?? "",
      approver: str(s.approver, `${at} Clinical or Quality approver`, { max: 120 }) ?? "",
      effectiveOn: date(s.effectiveOn),
      reviewOn: date(s.reviewOn),
      escalation: str(s.escalation, `${at} escalation contact`, { max: 200 }) ?? "",
    };
    const status = oneOf(c.status, ["draft", "approved", "needs_review"] as const, "draft");
    if (!source.refs.length) unfinished(`${at} needs at least one approved source.`);
    if (status !== "approved" || !source.approver || !source.reviewOn)
      unfinished(`${at} isn’t approved yet: record its Clinical or Quality approver and review date, and mark it approved.`);
    return {
      id: idOf(c.id, at),
      request: str(c.request, `${at} request`, { required: true, max: 400 }) ?? "",
      facts: texts(c.facts, "fact", 300, 5),
      know: str(c.know, `${at}: what do you know`, { max: 800 }) ?? "",
      funding: str(c.funding, `${at} funding context`, { max: 300 }) ?? "",
      lane,
      reasons,
      primary,
      accepted,
      actions,
      acceptedActions,
      choice: str(c.choice, `${at}: about the person’s choice`, { required: true, max: 400 }) ?? "",
      next: str(c.next, `${at}: the next step`, { required: true, max: 400 }) ?? "",
      why: str(c.why, `${at}: see why`, { required: true, max: 1200 }) ?? "",
      secondary: texts(c.secondary, "other consideration", 300, 4),
      critical: cr
        ? {
            lanes: ids(cr.lanes, 3).filter((x): x is Lane => (LANE_ORDER as string[]).includes(x)),
            actions: ids(cr.actions).filter((x) => actionIds.has(x)),
            text: str(cr.text, `${at}: why it needs a debrief`, { required: true, max: 400 }) ?? "",
          }
        : null,
      twist: tw
        ? {
            fact: str(tw.fact, `${at}: the new fact`, { required: true, max: 400 }) ?? "",
            lane: oneOf(tw.lane, LANE_ORDER, "check"),
            why: str(tw.why, `${at}: why the new fact matters`, { required: true, max: 600 }) ?? "",
          }
        : null,
      source,
      status,
    };
  });
  if (cases.length < 3) unfinished(`${where} needs at least three cases.`);
  const a = obj(o.approval);
  const s = obj(o.source);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    sme: str(a.sme, `${where} Care Partner reviewer`, { max: 120 }) ?? "",
    clinical: str(a.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const source = { title: str(s.title, `${where} policy set`, { max: 200 }) ?? "", version: str(s.version, `${where} policy set version`, { max: 80 }) ?? "" };
  if (!lineApproved({ approval, source }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Care Partner, Clinical and Quality reviewers, the date, and the policy set and its version.`,
    );
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    learnerRole: str(o.learnerRole, `${where}: who the learner is`, { max: 160 }) ?? "",
    shuffle: o.shuffle === true,
    cases,
    source,
    approval,
  };
}

export const lineApproved = (b: { approval: LineBlockData["approval"]; source: { title: string; version: string } }) =>
  Boolean(b.approval.owner && b.approval.sme && b.approval.clinical && b.approval.quality && b.approval.approvedOn && b.source.title && b.source.version);

/** A case that can be served: approved and within its review date. */
export const servable = (c: Pick<LineCase, "status" | "source">, today: string) =>
  c.status === "approved" && Boolean(c.source.reviewOn) && c.source.reviewOn >= today;

/** The block as a learner's browser gets it: the requests and the choices, without the answers. */
export function lineForReaders<T extends LineBlockData>(b: T): T {
  return {
    ...b,
    cases: b.cases.map((c) => ({
      ...c,
      lane: "check" as const,
      primary: "",
      accepted: [],
      acceptedActions: [],
      choice: "",
      next: "",
      why: "",
      secondary: [],
      critical: null,
      twist: c.twist ? { fact: c.twist.fact, lane: "check" as const, why: "" } : null,
    })),
  };
}

export function freshLine(data: LineBlockData, tag = Math.random().toString(36).slice(2, 7)): LineBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    cases: c.cases.map((x) => ({
      ...x,
      id: re(x.id),
      reasons: x.reasons.map((r) => ({ ...r, id: re(r.id) })),
      primary: re(x.primary),
      accepted: x.accepted.map(re),
      actions: x.actions.map((r) => ({ ...r, id: re(r.id) })),
      acceptedActions: x.acceptedActions.map(re),
      critical: x.critical ? { ...x.critical, actions: x.critical.actions.map(re) } : null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Answer = { lane: Lane | ""; reason: string; action: string };
export type Feedback = {
  caseId: string;
  lane: Lane;
  laneRight: boolean;
  reasonRight: boolean;
  actionRight: boolean;
  reason: string;
  choice: string;
  next: string;
  why: string;
  secondary: string[];
  refs: string[];
  sop: string;
  escalation: string;
  /** This choice needs a debrief, with why. */
  debrief: string;
};
export type LineState = {
  order: string[];
  /** Where the learner is in the deck. order.length means the deck is done. */
  at: number;
  answers: Record<string, Answer>;
  /** Missed cards tried again: the record stays as first answered. */
  replays: Record<string, Answer>;
  /** The second pass: the lane chosen after the new fact. */
  twists: Record<string, Lane>;
  finished: boolean;
};
export const blankAnswer = (): Answer => ({ lane: "", reason: "", action: "" });
export const complete = (a: Answer | undefined) => Boolean(a?.lane && a.reason && a.action);

export function initialState(b: LineBlockData, today: string, seed = 0): LineState {
  const ids = b.cases.filter((c) => servable(c, today)).map((c) => c.id);
  // A stable shuffle per attempt, so leaving and coming back keeps the same order.
  const order = b.shuffle ? [...ids].sort((x, y) => hash(`${seed}:${x}`) - hash(`${seed}:${y}`)) : ids;
  return { order, at: 0, answers: {}, replays: {}, twists: {}, finished: false };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function cleanState(b: LineBlockData, raw: unknown): LineState {
  const r = obj(raw);
  const byId = new Map(b.cases.map((c) => [c.id, c]));
  const answer = (c: LineCase, v: unknown): Answer => {
    const a = obj(v);
    return {
      lane: oneOf(a.lane, ["", ...LANE_ORDER], ""),
      reason: typeof a.reason === "string" && c.reasons.some((x) => x.id === a.reason) ? a.reason : "",
      action: typeof a.action === "string" && c.actions.some((x) => x.id === a.action) ? a.action : "",
    };
  };
  const pick = (src: unknown) =>
    Object.fromEntries(
      Object.entries(obj(src))
        .filter(([k]) => byId.has(k))
        .map(([k, v]) => [k, answer(byId.get(k)!, v)]),
    );
  const order = ids(r.order, 20).filter((x) => byId.has(x));
  return {
    order,
    at: Number.isInteger(r.at) ? Math.min(order.length, Math.max(0, r.at as number)) : 0,
    answers: pick(r.answers),
    replays: pick(r.replays),
    twists: Object.fromEntries(
      Object.entries(obj(r.twists)).filter(([k, v]) => byId.get(k)?.twist && (LANE_ORDER as string[]).includes(v as string)),
    ) as Record<string, Lane>,
    finished: r.finished === true,
  };
}

/** Reads one card's answer against the reviewed key. */
export function feedbackFor(c: LineCase, a: Answer): Feedback {
  const laneRight = a.lane === c.lane;
  const crit = c.critical && ((a.lane && c.critical.lanes.includes(a.lane as Lane)) || c.critical.actions.includes(a.action)) ? c.critical.text : "";
  return {
    caseId: c.id,
    lane: c.lane,
    laneRight,
    reasonRight: c.accepted.includes(a.reason),
    actionRight: c.acceptedActions.includes(a.action),
    reason: c.reasons.find((r) => r.id === c.primary)?.text ?? "",
    choice: c.choice,
    next: c.next,
    why: c.why,
    secondary: c.secondary,
    refs: c.source.refs,
    sop: c.source.sop,
    escalation: c.source.escalation,
    debrief: crit,
  };
}

/** Submits the current card. All three choices are needed; the answer stands and the deck moves on. */
export function answerCard(b: LineBlockData, s: LineState, caseId: unknown, a: Answer): { state: LineState; feedback: Feedback } | { problem: string } {
  const id = s.order[s.at];
  if (!id || id !== caseId) return { problem: "That card isn’t the one in front of you." };
  if (!complete(a)) return { problem: "Choose a lane, the governing reason and a next action first." };
  const c = b.cases.find((x) => x.id === id)!;
  return { state: { ...s, answers: { ...s.answers, [id]: a }, at: s.at + 1 }, feedback: feedbackFor(c, a) };
}

/** A missed card, tried again after the deck. The first answer stays on the record. */
export function replayCard(b: LineBlockData, s: LineState, caseId: unknown, a: Answer): { state: LineState; feedback: Feedback } | { problem: string } {
  const c = b.cases.find((x) => x.id === caseId);
  if (!c || !s.answers[c.id]) return { problem: "Answer it in the deck first." };
  if (!complete(a)) return { problem: "Choose a lane, the governing reason and a next action first." };
  return { state: { ...s, replays: { ...s.replays, [c.id]: a } }, feedback: feedbackFor(c, a) };
}

/** The second pass: after a new fact, does the lane change? Earlier answers are kept for the debrief. */
export function twistCard(b: LineBlockData, s: LineState, caseId: unknown, lane: unknown) {
  const c = b.cases.find((x) => x.id === caseId);
  if (!c?.twist || !s.answers[c.id]) return { problem: "That card has no second pass." } as const;
  if (!(LANE_ORDER as string[]).includes(lane as string)) return { problem: "Choose a lane." } as const;
  const l = lane as Lane;
  return {
    state: { ...s, twists: { ...s.twists, [c.id]: l } },
    result: { caseId: c.id, lane: c.twist.lane, right: l === c.twist.lane, changed: c.twist.lane !== c.lane, before: s.answers[c.id].lane, why: c.twist.why },
  };
}

// ---------------------------------------------------------------------------------------------
// The line map
// ---------------------------------------------------------------------------------------------

export function summarise(b: LineBlockData, s: LineState) {
  const rows = s.order
    .map((id) => b.cases.find((c) => c.id === id))
    .filter((c): c is LineCase => Boolean(c && s.answers[c.id]))
    .map((c) => ({ c, a: s.answers[c.id], f: feedbackFor(c, s.answers[c.id]) }));
  const n = rows.length;
  const count = (p: (r: (typeof rows)[number]) => boolean) => rows.filter(p).length;
  const tighter = count((r) => Boolean(r.a.lane) && strictness(r.a.lane as Lane) > strictness(r.c.lane));
  const looser = count((r) => Boolean(r.a.lane) && strictness(r.a.lane as Lane) < strictness(r.c.lane));
  return {
    total: n,
    lane: count((r) => r.f.laneRight),
    reason: count((r) => r.f.reasonRight),
    action: count((r) => r.f.actionRight),
    mastered: count((r) => r.f.laneRight && r.f.reasonRight && r.f.actionRight),
    /** Stricter than the facts call for: too many vetoes or checks. */
    overControl: tighter,
    /** Looser than the facts call for: approving before checks. */
    premature: looser,
    map: LANE_ORDER.map((l) => ({
      lane: l,
      placed: rows.filter((r) => r.a.lane === l).map((r) => ({ id: r.c.id, request: r.c.request, right: r.f.laneRight })),
      reviewed: rows.filter((r) => r.c.lane === l).map((r) => r.c.id),
    })),
    missed: rows.filter((r) => !(r.f.laneRight && r.f.reasonRight && r.f.actionRight)).map((r) => r.c.id),
    debriefs: rows.filter((r) => r.f.debrief).map((r) => ({ id: r.c.id, request: r.c.request, text: r.f.debrief })),
    twists: rows.filter((r) => r.c.twist).map((r) => r.c.id),
  };
}
export type LineSummary = ReturnType<typeof summarise>;
