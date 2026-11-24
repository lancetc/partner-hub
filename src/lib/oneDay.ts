/*
  One Day, Five Perspectives (docs/one-day-five-perspectives.md): a fictional working day for a Care Coordinator, in
  five lanes (clients and supporters, the coordinator, the Care Partner principal, suppliers and workers, Trilogy Care
  staff). The learner makes Leila's decisions, can briefly play another person, and must keep what they learned in
  that role apart from what Leila actually knows until it's communicated to her.

  Everything here is pure and deterministic. The whole state of an attempt (what Leila knows, what the learner has
  seen, commitments, flags and rubric evidence) is worked out by replaying the case with the learner's choices, so
  retrying an event is just dropping the choices from that point. The server, the learner's page and the editor's
  preview all run the same replay. No AI decides anything.

  The learner's browser only ever gets a view: arrived events, the lens they opened, and the debrief once the day is
  done. Later events, hidden facts and other roles' private knowledge stay on the server.
*/

export const ONE_DAY_VERSION = "one-day-1";

export const LANES = {
  clients: "Clients and supporters",
  coordinator: "Care Coordinator",
  principal: "Care Partner principal",
  suppliers: "Suppliers and workers",
  trilogy: "Trilogy Care staff",
} as const;
export type LaneId = keyof typeof LANES;
export const LANE_ORDER = Object.keys(LANES) as LaneId[];

export const PATTERNS = ["dots", "stripes", "waves"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const DIMENSIONS = {
  prioritisation: "Prioritisation",
  voice: "The person’s voice",
  accuracy: "Information accuracy",
  boundaries: "Role boundaries",
  handoff: "Handoff quality",
  adaptation: "Adaptation",
  followThrough: "Follow-through",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export const LEVELS = ["Missing or unsafe", "Partial", "Appropriate", "Strong and evidenced"] as const;
export type Level = 0 | 1 | 2 | 3;

export const FLAGS = {
  "unapproved-worker": "Promised an unapproved worker or an unconfirmed visit",
  "private-shared": "Shared private budget or health information with someone not authorised to receive it",
  "retro-authorised": "Authorised a disputed charge without review",
  "removed-activity": "Removed Dot’s meaningful activity without speaking to her",
  "sent-as-done": "Marked a message sent as a completed outcome",
  "approval-made": "Made a clinical or provider approval that isn’t the coordinator’s to make",
  "safety-hidden": "Left a possible urgent safety issue without the urgent process",
} as const;
export type FlagId = keyof typeof FLAGS;

export const STATUSES = {
  done: "Completed",
  waiting: "Waiting on a named owner",
  escalated: "Escalated",
  callback: "Callback promised",
} as const;
export type StatusId = keyof typeof STATUSES;

export const FICTIONAL_NOTICE =
  "A fictional working day. The people, suppliers and decisions are made up, and nothing here books a service, approves a worker, changes a care plan or reports an incident.";

// ---------------------------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------------------------

export type Thread = { id: string; name: string; goal: string; pattern: Pattern };
export type Actor = {
  id: string;
  name: string;
  lane: LaneId;
  /** A sub-role badge in the supplier or Trilogy Care lanes: "Billing", "Supplier onboarding". */
  badge?: string;
  thread?: string;
  about: string;
};
/**
  Something that's true, believed or wanted in the story. `holders`: who knows it from the start of the day. `kind`
  says what sort of claim it is, so a wish isn't shown as a verified fact. `private`: health or budget detail that
  mustn't go to someone without authority to receive it.
*/
export type Fact = {
  id: string;
  text: string;
  thread?: string;
  kind: "fact" | "preference" | "belief" | "status";
  holders: string[];
  private?: boolean;
};
export type Commitment = { id: string; thread: string; owner: string; action: string; due: string; status: "open" | "waiting" | "done" | "escalated" };
export type Effect = {
  /** Facts Leila now knows, because they were communicated to her. */
  tell?: string[];
  set?: Record<string, string>;
  commit?: Commitment[];
  flag?: FlagId[];
  score?: Partial<Record<Dim, Level>>;
};
export type Option = {
  id: string;
  text: string;
  feedback: string;
  /** Facts Leila must know before she could do this. Chosen without them, it's acting on what only the learner saw. */
  needs?: string[];
  effect: Effect;
};
/** A role lens: a short visit as another person at this point in the day. */
export type Lens = {
  actor: string;
  knows: string;
  wants: string;
  canDecide: string;
  needs: string;
  /** Facts the learner learns as this person. Leila doesn't. */
  facts: string[];
  reply?: { prompt: string; options: { id: string; text: string; sounds: string }[] };
};
export type DayEvent = {
  id: string;
  time: string;
  title: string;
  lane: LaneId;
  thread?: string;
  actor?: string;
  kind: "scheduled" | "unexpected" | "revised" | "waiting";
  /** Only in the day when a state variable has one of these values (a conditional later event). */
  when?: { key: string; is: string[] };
  artefact: { kind: "message" | "call" | "note" | "invoice" | "booking" | "plan" | "email"; from: string; body: string };
  /** Facts Leila receives when the event arrives. */
  tells?: string[];
  lenses: Lens[];
  decision?: { prompt: string; options: Option[] };
  /** The changed request the debrief highlights. */
  changed?: boolean;
  /** The end-of-day close: a status for each thread. */
  closing?: boolean;
};
/** What a thread's end-of-day status can honestly be, given where its state ended up. */
export type Truth = { thread: string; key: string; accept: Record<string, StatusId[]> };

export type OneDayData = {
  title: string;
  intro: string;
  version: string;
  day: string;
  coordinator: string;
  threads: Thread[];
  actors: Actor[];
  facts: Fact[];
  events: DayEvent[];
  truths: Truth[];
  /** State variables at the start of the day. */
  start: Record<string, string>;
  /** Existing activities to practise next, each with why. */
  links: { label: string; why: string; href: string }[];
  approval: {
    owner: string;
    story: string;
    operations: string;
    quality: string;
    billing: string;
    supplier: string;
    privacy: string;
    approvedOn: string;
    reviewBy: string;
  };
};

// ---------------------------------------------------------------------------------------------
// The learner's attempt, and the replay
// ---------------------------------------------------------------------------------------------

export type Attempt = {
  /** The option chosen at each decision event. */
  choices: Record<string, string>;
  /** Role lenses opened, in order: "eventId:actorId". */
  lenses: string[];
  /** A lens reply chosen: "eventId:actorId" → option id. */
  replies: Record<string, string>;
  /** Choices refused because Leila didn't know enough yet: "eventId:optionId". */
  misses: string[];
  /** The end-of-day status for each thread. */
  closing: Record<string, StatusId>;
};
export const emptyAttempt = (): Attempt => ({ choices: {}, lenses: [], replies: {}, misses: [], closing: {} });

export type Arrived = { event: DayEvent; option?: Option; at: number; leilaNew: string[] };
export type DayState = {
  arrived: Arrived[];
  /** The next event waiting on the learner, if the day isn't over. */
  current: DayEvent | null;
  leila: Set<string>;
  learner: Set<string>;
  vars: Record<string, string>;
  commitments: Commitment[];
  flags: { flag: FlagId; event: string }[];
  scores: { dim: Dim; level: Level; event: string }[];
  /** Events still to come in the day (not yet arrived), by count only. */
  remaining: number;
  done: boolean;
};

const holdsAt = (f: Fact, coordinator: string) => f.holders.includes(coordinator);

/** Whether a conditional event is in the day, given the state when its time comes. */
const inDay = (e: DayEvent, vars: Record<string, string>) => !e.when || e.when.is.includes(vars[e.when.key] ?? "");

/**
  Replays the day: events arrive in order, each decision applies its option's effect, conditional events join when the
  state says so, and the day stops at the first decision without a choice. Deterministic: the same case and attempt
  always give the same state.
*/
export function replay(d: OneDayData, a: Attempt): DayState {
  const leila = new Set(d.facts.filter((f) => holdsAt(f, d.coordinator)).map((f) => f.id));
  const learner = new Set(leila);
  const vars: Record<string, string> = { ...d.start };
  const commitments = new Map<string, Commitment>();
  const flags: DayState["flags"] = [];
  const scores: DayState["scores"] = [];
  const arrived: Arrived[] = [];
  const ordered = [...d.events].sort((x, y) => x.time.localeCompare(y.time));
  let current: DayEvent | null = null;
  let index = 0;
  for (; index < ordered.length; index++) {
    const e = ordered[index];
    if (!inDay(e, vars)) continue;
    const before = new Set(leila);
    for (const f of e.tells ?? []) leila.add(f);
    // What the learner saw in a role lens at this event: theirs, not Leila's.
    for (const l of e.lenses) if (a.lenses.includes(`${e.id}:${l.actor}`)) for (const f of l.facts) learner.add(f);
    for (const f of leila) learner.add(f);
    // Choosing an option Leila couldn't yet act on counts against information accuracy, once per event.
    if (a.misses.some((m) => m.startsWith(`${e.id}:`))) scores.push({ dim: "accuracy", level: 0, event: e.id });
    if (e.closing) {
      if (!d.threads.every((t) => a.closing[t.id])) {
        arrived.push({ event: e, at: index, leilaNew: [...leila].filter((f) => !before.has(f)) });
        current = e;
        index++;
        break;
      }
      for (const t of d.threads) {
        const s = a.closing[t.id];
        const truth = d.truths.find((x) => x.thread === t.id);
        const ok = truth ? (truth.accept[vars[truth.key] ?? ""] ?? []).includes(s) : true;
        scores.push({ dim: "followThrough", level: ok ? 3 : s === "done" ? 0 : 1, event: e.id });
        if (!ok && s === "done") flags.push({ flag: "sent-as-done", event: e.id });
      }
      arrived.push({ event: e, at: index, leilaNew: [...leila].filter((f) => !before.has(f)) });
      continue;
    }
    const chosen = e.decision ? e.decision.options.find((o) => o.id === a.choices[e.id]) : undefined;
    if (e.decision && !chosen) {
      arrived.push({ event: e, at: index, leilaNew: [...leila].filter((f) => !before.has(f)) });
      current = e;
      index++;
      break;
    }
    if (chosen) {
      const fx = chosen.effect;
      for (const f of fx.tell ?? []) leila.add(f);
      for (const f of leila) learner.add(f);
      Object.assign(vars, fx.set ?? {});
      for (const c of fx.commit ?? []) commitments.set(c.id, c);
      for (const f of fx.flag ?? []) flags.push({ flag: f, event: e.id });
      for (const [dim, level] of Object.entries(fx.score ?? {})) scores.push({ dim: dim as Dim, level: level as Level, event: e.id });
    }
    arrived.push({ event: e, option: chosen, at: index, leilaNew: [...leila].filter((f) => !before.has(f)) });
  }
  const remaining = ordered.slice(index).filter((e) => inDay(e, vars)).length;
  return { arrived, current, leila, learner, vars, commitments: [...commitments.values()], flags, scores, remaining, done: !current };
}

/** Whether Leila knows enough to choose this option now; if not, which facts she's missing. */
export function missingFor(d: OneDayData, s: DayState, o: Option) {
  return (o.needs ?? []).filter((f) => !s.leila.has(f));
}

/** What the learner knows that Leila doesn't: learned in a role lens, not yet communicated to her. */
export const learnerOnly = (s: DayState) => [...s.learner].filter((f) => !s.leila.has(f));

/** Drops the choices from an event onward (and anything after it in the day), so it can be decided again. */
export function retryFrom(d: OneDayData, a: Attempt, eventId: string): Attempt {
  const ordered = [...d.events].sort((x, y) => x.time.localeCompare(y.time));
  const from = ordered.findIndex((e) => e.id === eventId);
  if (from < 0) return a;
  const later = new Set(ordered.slice(from).map((e) => e.id));
  const choices = Object.fromEntries(Object.entries(a.choices).filter(([id]) => !later.has(id)));
  return {
    ...a,
    choices,
    misses: a.misses.filter((m) => !later.has(m.split(":")[0])),
    closing: ordered.slice(from).some((e) => e.closing) ? {} : a.closing,
  };
}

// ---------------------------------------------------------------------------------------------
// The learner's view: only what's arrived, and only what they've earned
// ---------------------------------------------------------------------------------------------

export type ViewFact = { id: string; text: string; kind: Fact["kind"]; thread?: string };
export type ViewOption = { id: string; text: string };
export type ViewEvent = {
  id: string;
  time: string;
  title: string;
  lane: LaneId;
  thread?: string;
  actor?: string;
  kind: DayEvent["kind"];
  artefact: DayEvent["artefact"];
  /** People whose perspective can be played here. */
  lensActors: string[];
  decision?: { prompt: string; options: ViewOption[] };
  chosen?: { id: string; text: string; feedback: string };
  closing?: boolean;
  leilaNew: ViewFact[];
};
export type ViewLens = {
  event: string;
  actor: string;
  knows: string;
  wants: string;
  canDecide: string;
  needs: string;
  facts: ViewFact[];
  reply?: Lens["reply"];
  replied?: { id: string; sounds: string };
};

const viewFact = (d: OneDayData, id: string): ViewFact | null => {
  const f = d.facts.find((x) => x.id === id);
  return f ? { id: f.id, text: f.text, kind: f.kind, ...(f.thread ? { thread: f.thread } : {}) } : null;
};

/** The day as a learner (or an author previewing) sees it now. Later events and others' private facts aren't in it. */
export function dayView(d: OneDayData, a: Attempt) {
  const s = replay(d, a);
  const facts = (ids: Iterable<string>) => [...ids].map((id) => viewFact(d, id)).filter((x): x is ViewFact => x !== null);
  const events: ViewEvent[] = s.arrived.map(({ event: e, option, leilaNew }) => ({
    id: e.id,
    time: e.time,
    title: e.title,
    lane: e.lane,
    ...(e.thread ? { thread: e.thread } : {}),
    ...(e.actor ? { actor: e.actor } : {}),
    kind: e.kind,
    artefact: e.artefact,
    lensActors: e.lenses.map((l) => l.actor),
    ...(e.decision ? { decision: { prompt: e.decision.prompt, options: e.decision.options.map((o) => ({ id: o.id, text: o.text })) } } : {}),
    ...(option ? { chosen: { id: option.id, text: option.text, feedback: option.feedback } } : {}),
    ...(e.closing ? { closing: true } : {}),
    leilaNew: facts(leilaNew),
  }));
  // Only the lenses the learner has opened, on events that have arrived.
  const arrivedIds = new Set(s.arrived.map((x) => x.event.id));
  const lenses: ViewLens[] = a.lenses.flatMap((key) => {
    const [eventId, actorId] = key.split(":");
    const e = d.events.find((x) => x.id === eventId);
    const l = e?.lenses.find((x) => x.actor === actorId);
    if (!e || !l || !arrivedIds.has(e.id)) return [];
    const replyId = a.replies[key];
    const replied = l.reply?.options.find((o) => o.id === replyId);
    return [
      {
        event: e.id,
        actor: l.actor,
        knows: l.knows,
        wants: l.wants,
        canDecide: l.canDecide,
        needs: l.needs,
        facts: facts(l.facts),
        ...(l.reply ? { reply: l.reply } : {}),
        ...(replied ? { replied: { id: replied.id, sounds: replied.sounds } } : {}),
      },
    ];
  });
  return {
    version: d.version,
    events,
    currentId: s.current?.id ?? null,
    remaining: s.remaining,
    done: s.done,
    leila: facts(s.leila),
    learnerOnly: facts(learnerOnly(s)),
    commitments: s.commitments,
    lenses,
    misses: a.misses,
    closing: a.closing,
    debrief: s.done ? buildDebrief(d, a, s) : null,
  };
}
export type DayView = ReturnType<typeof dayView>;

// ---------------------------------------------------------------------------------------------
// The debrief: three aligned timelines, a rubric with evidence, and critical flags that override totals
// ---------------------------------------------------------------------------------------------

/**
  When a fact first exists in the day: the time of the first event that tells it or shows it in a lens. A fact that
  appears in no event is true from the start. Before then, no one could have said it.
*/
function firstSeen(d: OneDayData) {
  const out = new Map<string, string>();
  for (const e of [...d.events].sort((x, y) => x.time.localeCompare(y.time)))
    for (const f of [...(e.tells ?? []), ...e.lenses.flatMap((l) => l.facts), ...(e.decision?.options.flatMap((o) => o.effect.tell ?? []) ?? [])])
      if (!out.has(f)) out.set(f, e.time);
  return out;
}

export function buildDebrief(d: OneDayData, a: Attempt, s = replay(d, a)) {
  const dims = DIM_ORDER.map((dim) => {
    const ev = s.scores.filter((x) => x.dim === dim);
    const level = ev.length ? (Math.floor(ev.reduce((n, x) => n + x.level, 0) / ev.length) as Level) : null;
    return { dim, level, events: [...new Set(ev.map((x) => x.event))] };
  });
  const flags = [...new Map(s.flags.map((f) => [f.flag, f])).values()].map((f) => ({ ...f, text: FLAGS[f.flag] }));
  // Three aligned timelines: what happened, what Leila knew and decided, what others knew but hadn't said.
  const told = new Set<string>(d.facts.filter((f) => holdsAt(f, d.coordinator)).map((f) => f.id));
  const seen = firstSeen(d);
  const timelines = s.arrived.map(({ event: e, option, leilaNew }) => {
    leilaNew.forEach((f) => told.add(f));
    for (const f of option?.effect.tell ?? []) told.add(f);
    const unsaid = d.facts
      .filter(
        (f) => f.thread && f.thread === e.thread && !told.has(f.id) && f.holders.some((h) => h !== d.coordinator) && (seen.get(f.id) ?? "00:00") <= e.time,
      )
      .map((f) => ({ text: f.text, kind: f.kind, who: f.holders.map((h) => d.actors.find((x) => x.id === h)?.name ?? h).join(", ") }));
    return {
      event: e.id,
      time: e.time,
      happened: `${e.title}: ${e.artefact.body}`,
      leila: { knew: leilaNew.map((f) => d.facts.find((x) => x.id === f)?.text ?? f), decided: option?.text ?? (e.closing ? "Closed the day" : "") },
      unsaid,
    };
  });
  const handoffs = s.scores.filter((x) => x.dim === "handoff");
  const best = handoffs.length ? handoffs.reduce((x, y) => (y.level > x.level ? y : x)) : null;
  const delays = s.scores.filter((x) => x.dim === "prioritisation" || x.dim === "handoff");
  const worst = delays.length ? delays.reduce((x, y) => (y.level < x.level ? y : x)) : null;
  const changed = s.arrived.find((x) => x.event.changed);
  const open = s.commitments.filter((c) => c.status === "open" || c.status === "waiting" || c.status === "escalated");
  const label = (id: string | undefined) => s.arrived.find((x) => x.event.id === id)?.event;
  return {
    version: d.version,
    dims,
    total: dims.reduce((n, x) => n + (x.level ?? 0), 0),
    /** A critical flag means this attempt needs another look, whatever the total. */
    flags,
    timelines,
    highlights: {
      changed: changed ? { event: changed.event.id, time: changed.event.time, text: changed.event.title } : null,
      goodHandoff:
        best && best.level >= 2
          ? { event: best.event, time: label(best.event)?.time ?? "", text: s.arrived.find((x) => x.event.id === best.event)?.option?.text ?? "" }
          : null,
      delay:
        worst && worst.level <= 1
          ? { event: worst.event, time: label(worst.event)?.time ?? "", text: s.arrived.find((x) => x.event.id === worst.event)?.option?.text ?? "" }
          : null,
      open: open.map((c) => ({ ...c, ownerName: d.actors.find((x) => x.id === c.owner)?.name ?? c.owner })),
    },
    statuses: d.threads.map((t) => ({ thread: t.id, name: t.name, status: a.closing[t.id] ?? null })),
    links: d.links,
  };
}
export type DayDebrief = ReturnType<typeof buildDebrief>;

// ---------------------------------------------------------------------------------------------
// Checking a case: the author's branch test
// ---------------------------------------------------------------------------------------------

/**
  Problems that make a case unpublishable, including the PRD's contradiction checks: a fact told before anyone could
  know it, a lens fact that isn't held by the person playing it, an option that needs a fact Leila can never learn, a
  commitment owner who isn't in the cast, a conditional event on a state nothing sets, and statuses with no truth.
*/
export function caseProblems(d: OneDayData): string[] {
  const out: string[] = [];
  const t = d.title || "The journey map";
  const actors = new Set(d.actors.map((x) => x.id));
  const facts = new Map(d.facts.map((f) => [f.id, f]));
  const threads = new Set(d.threads.map((x) => x.id));
  if (!d.version) out.push(`${t}: give the scenario a version.`);
  if (!actors.has(d.coordinator)) out.push(`${t}: the coordinator isn’t in the cast.`);
  for (const lane of LANE_ORDER) if (!d.actors.some((x) => x.lane === lane)) out.push(`${t}: no one is in the “${LANES[lane]}” lane.`);
  if (d.threads.length < 1) out.push(`${t}: add at least one client thread.`);
  const ids = new Set<string>();
  for (const e of d.events) {
    if (ids.has(e.id)) out.push(`${t}: two events share the id “${e.id}”.`);
    ids.add(e.id);
    if (!/^\d{2}:\d{2}$/.test(e.time)) out.push(`${t}: “${e.title}” needs a time like 09:10.`);
    if (e.thread && !threads.has(e.thread)) out.push(`${t}: “${e.title}” is on a thread that isn’t in the case.`);
    if (e.actor && !actors.has(e.actor)) out.push(`${t}: “${e.title}” names someone who isn’t in the cast.`);
    for (const f of e.tells ?? []) if (!facts.has(f)) out.push(`${t}: “${e.title}” tells Leila a fact that isn’t in the case (${f}).`);
    for (const l of e.lenses) {
      if (!actors.has(l.actor)) out.push(`${t}: “${e.title}” has a lens for someone who isn’t in the cast.`);
      if (l.actor === d.coordinator) out.push(`${t}: “${e.title}” has a lens for the coordinator; lenses are other people.`);
      for (const f of l.facts) {
        const fact = facts.get(f);
        if (!fact) out.push(`${t}: “${e.title}”: a lens reveals a fact that isn’t in the case (${f}).`);
        else if (!fact.holders.includes(l.actor))
          out.push(`${t}: “${e.title}”: the lens for ${l.actor} reveals “${fact.text}”, which ${l.actor} doesn’t know.`);
      }
    }
    for (const o of e.decision?.options ?? []) {
      for (const f of [...(o.needs ?? []), ...(o.effect.tell ?? [])]) if (!facts.has(f)) out.push(`${t}: “${e.title}”, “${o.text}”: unknown fact ${f}.`);
      for (const c of o.effect.commit ?? []) {
        if (!actors.has(c.owner)) out.push(`${t}: “${e.title}”, “${o.text}”: the commitment’s owner isn’t in the cast.`);
        if (!threads.has(c.thread)) out.push(`${t}: “${e.title}”, “${o.text}”: the commitment is on a thread that isn’t in the case.`);
      }
      for (const f of o.effect.flag ?? []) if (!(f in FLAGS)) out.push(`${t}: “${e.title}”, “${o.text}”: unknown flag ${f}.`);
    }
    if (e.decision && e.decision.options.length < 2) out.push(`${t}: “${e.title}” needs at least two options.`);
  }
  // A fact Leila needs must be one she can be told somewhere, or already know.
  const tellable = new Set<string>([
    ...d.facts.filter((f) => f.holders.includes(d.coordinator)).map((f) => f.id),
    ...d.events.flatMap((e) => [...(e.tells ?? []), ...(e.decision?.options.flatMap((o) => o.effect.tell ?? []) ?? [])]),
  ]);
  for (const e of d.events)
    for (const o of e.decision?.options ?? [])
      for (const f of o.needs ?? []) if (!tellable.has(f)) out.push(`${t}: “${o.text}” needs “${facts.get(f)?.text ?? f}”, which Leila can never be told.`);
  // A conditional event must hang on a state something can set.
  const settable = new Set<string>([
    ...Object.keys(d.start),
    ...d.events.flatMap((e) => e.decision?.options.flatMap((o) => Object.keys(o.effect.set ?? {})) ?? []),
  ]);
  for (const e of d.events) if (e.when && !settable.has(e.when.key)) out.push(`${t}: “${e.title}” waits on “${e.when.key}”, which nothing sets.`);
  if (!d.events.some((e) => e.closing)) out.push(`${t}: end the day with a close-the-loop event.`);
  for (const th of d.threads) if (!d.truths.some((x) => x.thread === th.id)) out.push(`${t}: say which end-of-day statuses are honest for ${th.name}.`);
  // The authored best path must reach the end of the day without a critical flag.
  const best = bestPath(d);
  const s = replay(d, best);
  if (!s.done) out.push(`${t}: choosing the strongest option at each step doesn’t reach the end of the day.`);
  if (s.flags.length) out.push(`${t}: the strongest path still raises a critical flag (${s.flags.map((f) => f.flag).join(", ")}).`);
  return out;
}

/** The authored strongest choice at each step (highest total score, needing only what Leila knows), for checks and the editor's preview. */
export function bestPath(d: OneDayData): Attempt {
  let a = emptyAttempt();
  for (let guard = 0; guard < 40; guard++) {
    const s = replay(d, a);
    const e = s.current;
    if (!e) break;
    if (e.closing) {
      const closing: Attempt["closing"] = {};
      for (const th of d.threads) {
        const truth = d.truths.find((x) => x.thread === th.id);
        closing[th.id] = (truth?.accept[s.vars[truth.key] ?? ""] ?? ["waiting"])[0] ?? "waiting";
      }
      a = { ...a, closing };
      continue;
    }
    const options = (e.decision?.options ?? []).filter((o) => missingFor(d, s, o).length === 0 && !(o.effect.flag ?? []).length);
    const score = (o: Option) => Object.values(o.effect.score ?? {}).reduce<number>((n, x) => n + (x ?? 0), 0);
    const pick = options.sort((x, y) => score(y) - score(x))[0];
    if (!pick) break;
    a = { ...a, choices: { ...a.choices, [e.id]: pick.id } };
  }
  return a;
}

/** What Leila and each other person know at each event on the strongest path: the author's knowledge preview. */
export function knowledgePreview(d: OneDayData) {
  const s = replay(d, bestPath(d));
  const leila = new Set(d.facts.filter((f) => f.holders.includes(d.coordinator)).map((f) => f.id));
  const seen = firstSeen(d);
  return s.arrived.map(({ event: e, option, leilaNew }) => {
    leilaNew.forEach((f) => leila.add(f));
    for (const f of option?.effect.tell ?? []) leila.add(f);
    return {
      event: e.id,
      time: e.time,
      title: e.title,
      leila: [...leila].map((f) => d.facts.find((x) => x.id === f)?.text ?? f),
      hidden: d.facts
        .filter((f) => !leila.has(f.id) && (!e.thread || f.thread === e.thread) && (seen.get(f.id) ?? "00:00") <= e.time)
        .map((f) => ({ text: f.text, who: f.holders.join(", ") })),
    };
  });
}

export const dayApproved = (d: Pick<OneDayData, "approval">) => {
  const x = d.approval;
  return Boolean(x.owner && x.story && x.operations && x.quality && x.billing && x.supplier && x.privacy && x.approvedOn);
};
/** What "Publish anyway" can't waive: the case's checks, and its sign-off and review date. */
export function oneDayHardProblems(d: OneDayData, today: string): string[] {
  const out = caseProblems(d);
  if (!dayApproved(d))
    out.push(
      `“${d.title}”: record the owner, story editor, Operations, Quality/clinical, Billing/Finance, supplier onboarding and privacy reviewers, and the date.`,
    );
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`“${d.title}” was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy of the block: the frame only. Events, facts and lenses come from the server as they arrive. */
export function oneDayForReaders<T extends OneDayData>(b: T): T {
  return {
    ...b,
    facts: [],
    events: [],
    truths: [],
    start: {},
    links: [],
    actors: b.actors.map((x) => ({ ...x, about: "" })),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a case from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const ids = (v: unknown) =>
  arr(v)
    .filter((x): x is string => typeof x === "string")
    .slice(0, 40);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const level = (v: unknown): Level => (v === 0 || v === 1 || v === 2 || v === 3 ? v : 1);

function parseEffect(o: Raw): Effect {
  const score = obj(o.score);
  const set = obj(o.set);
  return {
    ...(o.tell ? { tell: ids(o.tell) } : {}),
    ...(o.set
      ? {
          set: Object.fromEntries(
            Object.entries(set)
              .filter(([, v]) => typeof v === "string")
              .map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 40)]),
          ),
        }
      : {}),
    ...(o.commit
      ? {
          commit: arr(o.commit)
            .map(obj)
            .slice(0, 6)
            .map((c) => ({
              id: s(c.id, 40),
              thread: s(c.thread, 40),
              owner: s(c.owner, 40),
              action: s(c.action, 300),
              due: s(c.due, 60),
              status: oneOf(c.status, ["open", "waiting", "done", "escalated"] as const, "open"),
            })),
        }
      : {}),
    ...(o.flag ? { flag: ids(o.flag).filter((f): f is FlagId => f in FLAGS) } : {}),
    ...(o.score
      ? {
          score: Object.fromEntries(
            Object.entries(score)
              .filter(([k]) => k in DIMENSIONS)
              .map(([k, v]) => [k, level(v)]),
          ) as Effect["score"],
        }
      : {}),
  };
}

export function parseOneDay(o: Raw, where: string, h: ParseHelpers): OneDayData {
  const { str, list, unfinished } = h;
  const ap = obj(o.approval);
  const data: OneDayData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    version: s(o.version, 40),
    day: s(o.day, 120),
    coordinator: s(o.coordinator, 40),
    threads: list(o.threads, where, "client thread", 5).map((x) => ({
      id: s(x.id, 40),
      name: s(x.name, 60),
      goal: s(x.goal, 300),
      pattern: oneOf(x.pattern, PATTERNS, "dots"),
    })),
    actors: list(o.actors, where, "person", 20).map((x) => ({
      id: s(x.id, 40),
      name: s(x.name, 60),
      lane: oneOf(x.lane, LANE_ORDER, "clients"),
      ...(typeof x.badge === "string" && x.badge ? { badge: x.badge.slice(0, 40) } : {}),
      ...(typeof x.thread === "string" && x.thread ? { thread: x.thread.slice(0, 40) } : {}),
      about: s(x.about, 400),
    })),
    facts: list(o.facts, where, "fact", 80).map((x) => ({
      id: s(x.id, 40),
      text: s(x.text, 300),
      ...(typeof x.thread === "string" && x.thread ? { thread: x.thread.slice(0, 40) } : {}),
      kind: oneOf(x.kind, ["fact", "preference", "belief", "status"] as const, "fact"),
      holders: ids(x.holders),
      ...(x.private === true ? { private: true } : {}),
    })),
    events: list(o.events, where, "event", 20).map((x) => {
      const art = obj(x.artefact);
      const dec = obj(x.decision);
      const when = obj(x.when);
      return {
        id: s(x.id, 40),
        time: s(x.time, 5),
        title: s(x.title, 120),
        lane: oneOf(x.lane, LANE_ORDER, "coordinator"),
        ...(typeof x.thread === "string" && x.thread ? { thread: x.thread.slice(0, 40) } : {}),
        ...(typeof x.actor === "string" && x.actor ? { actor: x.actor.slice(0, 40) } : {}),
        kind: oneOf(x.kind, ["scheduled", "unexpected", "revised", "waiting"] as const, "scheduled"),
        ...(typeof when.key === "string" ? { when: { key: when.key.slice(0, 40), is: ids(when.is) } } : {}),
        artefact: {
          kind: oneOf(art.kind, ["message", "call", "note", "invoice", "booking", "plan", "email"] as const, "note"),
          from: s(art.from, 80),
          body: s(art.body, 1500),
        },
        ...(x.tells ? { tells: ids(x.tells) } : {}),
        lenses: arr(x.lenses)
          .map(obj)
          .slice(0, 6)
          .map((l) => {
            const r = obj(l.reply);
            return {
              actor: s(l.actor, 40),
              knows: s(l.knows, 600),
              wants: s(l.wants, 600),
              canDecide: s(l.canDecide, 400),
              needs: s(l.needs, 400),
              facts: ids(l.facts),
              ...(l.reply
                ? {
                    reply: {
                      prompt: s(r.prompt, 300),
                      options: arr(r.options)
                        .map(obj)
                        .slice(0, 4)
                        .map((ro) => ({ id: s(ro.id, 40), text: s(ro.text, 300), sounds: s(ro.sounds, 400) })),
                    },
                  }
                : {}),
            };
          }),
        ...(x.decision
          ? {
              decision: {
                prompt: s(dec.prompt, 400),
                options: arr(dec.options)
                  .map(obj)
                  .slice(0, 6)
                  .map((op) => ({
                    id: s(op.id, 40),
                    text: s(op.text, 400),
                    feedback: s(op.feedback, 800),
                    ...(op.needs ? { needs: ids(op.needs) } : {}),
                    effect: parseEffect(obj(op.effect)),
                  })),
              },
            }
          : {}),
        ...(x.changed === true ? { changed: true } : {}),
        ...(x.closing === true ? { closing: true } : {}),
      };
    }),
    truths: arr(o.truths)
      .map(obj)
      .slice(0, 5)
      .map((x) => ({
        thread: s(x.thread, 40),
        key: s(x.key, 40),
        accept: Object.fromEntries(
          Object.entries(obj(x.accept)).map(([k, v]) => [k.slice(0, 40), ids(v).filter((st): st is StatusId => st in STATUSES)]),
        ) as Truth["accept"],
      })),
    start: Object.fromEntries(
      Object.entries(obj(o.start))
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 40)]),
    ),
    links: arr(o.links)
      .map(obj)
      .slice(0, 6)
      .map((x) => ({ label: s(x.label, 120), why: s(x.why, 300), href: s(x.href, 200) })),
    approval: {
      owner: s(ap.owner, 120),
      story: s(ap.story, 120),
      operations: s(ap.operations, 120),
      quality: s(ap.quality, 120),
      billing: s(ap.billing, 120),
      supplier: s(ap.supplier, 120),
      privacy: s(ap.privacy, 120),
      approvedOn: typeof ap.approvedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ap.approvedOn) ? ap.approvedOn : "",
      reviewBy: typeof ap.reviewBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ap.reviewBy) ? ap.reviewBy : "",
    },
  };
  for (const p of caseProblems(data)) unfinished(`${where}: ${p}`);
  return data;
}

export function cleanAttempt(d: OneDayData, raw: unknown): Attempt {
  const o = obj(raw);
  const events = new Map(d.events.map((e) => [e.id, e]));
  const choices: Attempt["choices"] = {};
  for (const [k, v] of Object.entries(obj(o.choices))) if (typeof v === "string" && events.get(k)?.decision?.options.some((x) => x.id === v)) choices[k] = v;
  const lensKeys = new Set(d.events.flatMap((e) => e.lenses.map((l) => `${e.id}:${l.actor}`)));
  const closing: Attempt["closing"] = {};
  for (const [k, v] of Object.entries(obj(o.closing)))
    if (d.threads.some((t) => t.id === k) && typeof v === "string" && v in STATUSES) closing[k] = v as StatusId;
  const replies: Attempt["replies"] = {};
  for (const [k, v] of Object.entries(obj(o.replies))) {
    const [eid, aid] = k.split(":");
    if (
      typeof v === "string" &&
      events
        .get(eid)
        ?.lenses.find((l) => l.actor === aid)
        ?.reply?.options.some((x) => x.id === v)
    )
      replies[k] = v;
  }
  return {
    choices,
    lenses: [...new Set(ids(o.lenses).filter((k) => lensKeys.has(k)))],
    replies,
    misses: [...new Set(ids(o.misses))].slice(0, 40),
    closing,
  };
}

// ---------------------------------------------------------------------------------------------
// The learner's actions, shared by the server and the editor's preview
// ---------------------------------------------------------------------------------------------

export type DayAction =
  | { action: "choose"; eventId: string; optionId: string }
  | { action: "lens"; eventId: string; actorId: string }
  | { action: "reply"; eventId: string; actorId: string; replyId: string }
  | { action: "close"; closing: Record<string, string> };

/**
  Applies one learner action. A choice is only taken at the event waiting on the learner; one that needs facts Leila
  doesn't know yet is refused (and remembered as a knowledge gap) with its authored feedback, so acting on what only the
  learner saw in a role lens never moves the day on. A lens can be opened on any event that has arrived.
*/
export function applyDayAction(
  d: OneDayData,
  a: Attempt,
  x: DayAction,
): { attempt: Attempt; refused?: { eventId: string; optionId: string; feedback: string; missing: number }; error?: string } {
  const s = replay(d, a);
  const arrived = new Set(s.arrived.map((e) => e.event.id));
  if (x.action === "choose") {
    const e = s.current;
    if (!e || e.id !== x.eventId || !e.decision) return { attempt: a, error: "That decision isn’t waiting on you." };
    const o = e.decision.options.find((y) => y.id === x.optionId);
    if (!o) return { attempt: a, error: "That option isn’t here." };
    const missing = missingFor(d, s, o);
    if (missing.length) {
      const key = `${e.id}:${o.id}`;
      return {
        attempt: a.misses.includes(key) ? a : { ...a, misses: [...a.misses, key] },
        refused: { eventId: e.id, optionId: o.id, feedback: o.feedback, missing: missing.length },
      };
    }
    return { attempt: { ...a, choices: { ...a.choices, [e.id]: o.id } } };
  }
  if (x.action === "lens") {
    const e = d.events.find((y) => y.id === x.eventId);
    if (!e || !arrived.has(e.id) || !e.lenses.some((l) => l.actor === x.actorId)) return { attempt: a, error: "That perspective isn’t available here." };
    const key = `${e.id}:${x.actorId}`;
    return { attempt: a.lenses.includes(key) ? a : { ...a, lenses: [...a.lenses, key] } };
  }
  if (x.action === "reply") {
    const key = `${x.eventId}:${x.actorId}`;
    const l = d.events.find((y) => y.id === x.eventId)?.lenses.find((y) => y.actor === x.actorId);
    if (!a.lenses.includes(key) || !l?.reply?.options.some((r) => r.id === x.replyId)) return { attempt: a, error: "Open that perspective first." };
    return { attempt: { ...a, replies: { ...a.replies, [key]: x.replyId } } };
  }
  const e = s.current;
  if (!e?.closing) return { attempt: a, error: "The day isn’t ready to close yet." };
  const closing: Attempt["closing"] = {};
  for (const t of d.threads) {
    const v = x.closing[t.id];
    if (!v || !(v in STATUSES)) return { attempt: a, error: `Give ${t.name} a status.` };
    closing[t.id] = v as StatusId;
  }
  return { attempt: { ...a, closing } };
}
