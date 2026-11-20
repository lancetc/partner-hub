/*
  First 30 Days Mission Board (docs/mission-board.md): a Magazine block where a learner manages the start
  of a fictional participant's care. A board of tasks with owners, dependencies and dated targets, a few
  time-stamped events to decide on, and a close-the-loop step. Everything here is pure, so the server, the
  learner's page and the editor's preview all run the same rules.

  - Dates come from explicit anchors (funding allocation, referral accepted, the first service, the end of a
    calendar month), never from "30 days covers a statement cycle".
  - The 56-day allocation clock is shown on its own. It has nothing to do with leaving a provider.
  - Nothing scores keeping the participant. Leaving is their right; the readings are about safe, honest,
    well-sequenced work.
  - What marks a decision right stays on the server until the learner has made it.
*/

// ---------------------------------------------------------------------------------------------
// The case's parts
// ---------------------------------------------------------------------------------------------

export const MISSION_STATUSES = ["to_plan", "waiting", "ready", "at_risk", "done"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export const STATUSES: Record<MissionStatus, { label: string; text: string }> = {
  to_plan: { label: "To plan", text: "Not started yet." },
  waiting: { label: "Waiting on someone", text: "Someone else has the next step." },
  ready: { label: "Ready", text: "Everything it needs is in place." },
  at_risk: { label: "At risk", text: "Something threatens it, or a promise that rests on it." },
  done: { label: "Done", text: "Finished, with the evidence on record." },
};

export const ANCHORS = {
  funding_allocation: "Funding allocated",
  provider_selection: "Provider chosen",
  referral_accepted: "Referral accepted (Day 0)",
  first_service: "First planned service",
  month_end: "End of the first calendar month",
  statement_due: "First statement due",
  statement_issued: "First statement issued",
} as const;
export type DateAnchor = keyof typeof ANCHORS;

export const TARGET_KINDS = { law: "Government rule", trilogy: "Trilogy Care target", case: "Made-up case target" } as const;
export type TargetKind = keyof typeof TARGET_KINDS;

export const CARE_MODELS = {
  self_managed: {
    label: "Self Managed",
    sourcing:
      "The participant chooses and schedules their own workers. Trilogy Care still checks every worker before they’re engaged, manages their care and keeps clinical oversight.",
  },
  fully_coordinated: {
    label: "Fully Coordinated",
    sourcing:
      "Trilogy Care’s team finds and schedules workers, with the participant’s preferences. Trilogy Care checks every worker, manages their care and keeps clinical oversight.",
  },
} as const;
export type CareModel = keyof typeof CARE_MODELS;

export const LEARNER_ROLES = {
  care_partner: { label: "Care Partner", text: "You own the care plan and budget decisions, with the participant." },
  care_coordinator: {
    label: "Care Coordinator",
    text: "You gather what’s needed, coordinate approved services and take decisions outside your role to the Care Partner.",
  },
} as const;
export type LearnerRole = keyof typeof LEARNER_ROLES;

export type MissionTask = {
  id: string;
  title: string;
  /** Who owns it: a role, never a real person. */
  owner: string;
  /** The evidence or decision it needs. */
  needs: string;
  dependsOn: string[];
  target: { anchor: DateAnchor; offset: number; kind: TargetKind };
  /** It can't be done before this day of the case (for example, a statement that isn't issued yet). */
  notBeforeDay: number | null;
  notBeforeWhy: string;
  start: MissionStatus;
};

export const ACTION_ROLES = {
  essential: "Needed in this case",
  helpful: "Helpful",
  insufficient: "Not enough on its own",
  unsafe: "Unsafe or misleading here",
} as const;
export type ActionRole = keyof typeof ACTION_ROLES;

export const DIMENSIONS = {
  sequencing: { label: "Sequencing" },
  safe: { label: "Safe start" },
  choice: { label: "Participant choice and consent" },
  recovery: { label: "Service recovery" },
  explain: { label: "Explaining the budget and statement" },
} as const;
export type Dim = keyof typeof DIMENSIONS;

export const READINESS = { ready: "On track", at_risk: "At risk", held: "Held safely", unsafe: "Not safe" } as const;
export type Readiness = keyof typeof READINESS;
export const INFORMED = { yes: "Knows what’s happening", partly: "Partly told", no: "Not told" } as const;
export type Informed = keyof typeof INFORMED;

export type MissionAction = {
  id: string;
  label: string;
  role: ActionRole;
  dim: Dim;
  feedback: string;
  /** What happens next in the made-up story, if anything. */
  consequence: string;
  /** What the participant hears, for the participant view. */
  told: string;
  /** A commitment this makes, which has to be kept or handed over by Day 30. */
  promise: string;
  /** The action (at an earlier point) whose promise this keeps. */
  keeps: string;
  readiness: Readiness | "";
  informed: Informed | "";
  risk: string;
  /** What choosing it does to the board. */
  sets: { task: string; status: MissionStatus }[];
};

export type MissionMessage = { prompt: string; checklist: string[]; model: string };

export type MissionCheckpoint = {
  id: string;
  /** Days after the referral was accepted (Day 0). */
  day: number;
  title: string;
  facts: string[];
  /** Tasks this event puts at risk when it arrives. */
  atRisk: string[];
  /** Tasks that must be done before the case can reach this point: the start gates. */
  requires: string[];
  requireWhy: string;
  actions: MissionAction[];
  message: MissionMessage | null;
  /** How things stand if nothing chosen says otherwise. */
  readiness: Readiness;
  risk: string;
};

export type MissionBlockData = {
  title: string;
  intro: string;
  participant: { name: string; age: number | null; about: string; consent: string };
  careModel: CareModel;
  learnerRole: LearnerRole;
  /** Who the learner is in this case. */
  roleNote: string;
  dates: { fundingAllocation: string; providerSelection: string; referralAccepted: string };
  firstServiceDay: number;
  /** The day of the case the first real statement is issued. It may well be after Day 30. */
  statementIssuedDay: number;
  /** No services in the first calendar month: a statement still comes. */
  noServicesFirstMonth: boolean;
  tasks: MissionTask[];
  checkpoints: MissionCheckpoint[];
  /** A senior reviewer's example of a well-closed loop, shown in the debrief. */
  closing: string;
  source: { title: string; version: string; reviewedOn: string };
  approval: { owner: string; compliance: string; finance: string; quality: string; approvedOn: string };
};

export const MISSION_NOTICE =
  "This is a training case. Nothing you do here rosters a worker, starts care, issues a statement or contacts anyone. Everyone in it is made up.";
export const ALLOCATION_NOTE =
  "This clock is about starting services. It isn’t a notice period: a participant can change provider for any reason, Trilogy Care doesn’t require notice, and nobody can be charged an exit amount.";
export const NOT_RETENTION =
  "Nothing here scores whether the participant stays. If someone chooses another provider after an honest, helpful conversation, they’ve used a right they have.";

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ms = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(ms(d) + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000);
/** The last day of the month `months` after the one `d` is in. */
export function monthEnd(d: string, months = 0) {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1 + months;
  return iso(Date.UTC(y, m + 1, 0));
}
export const showDate = (d: string) =>
  ISO.test(d)
    ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(ms(d)))
    : "";
export const showMonth = (d: string) =>
  ISO.test(d) ? new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ms(d))) : "";

type Dated = Pick<MissionBlockData, "dates" | "firstServiceDay" | "statementIssuedDay">;
/** The date an anchor falls on in this case. */
export function anchorDate(b: Dated, a: DateAnchor): string {
  const day0 = b.dates.referralAccepted;
  if (!ISO.test(day0)) return "";
  switch (a) {
    case "funding_allocation":
      return b.dates.fundingAllocation;
    case "provider_selection":
      return b.dates.providerSelection;
    case "referral_accepted":
      return day0;
    case "first_service":
      return addDays(day0, b.firstServiceDay);
    case "month_end":
      return monthEnd(day0);
    case "statement_due":
      // The statement for a calendar month is due by the last day of the next month.
      return monthEnd(day0, 1);
    case "statement_issued":
      return addDays(day0, b.statementIssuedDay);
  }
}
export const dayDate = (b: Dated, day: number) => (ISO.test(b.dates.referralAccepted) ? addDays(b.dates.referralAccepted, day) : "");
export const targetDate = (b: Dated, t: MissionTask) => {
  const d = anchorDate(b, t.target.anchor);
  return d ? addDays(d, t.target.offset) : "";
};

/** The funding-allocation clock: 56 days to have an agreement and services started, and the 28-day extension a participant can ask My Aged Care for. */
export function allocationClock(b: Dated, day: number) {
  const from = b.dates.fundingAllocation;
  if (!ISO.test(from) || !ISO.test(b.dates.referralAccepted)) return null;
  const startBy = addDays(from, 56);
  return {
    allocated: from,
    startBy,
    extendedTo: addDays(startBy, 28),
    /** How many of the 56 days have gone by on this day of the case. */
    used: Math.max(0, daysBetween(from, dayDate(b, day))),
    beforeReferral: daysBetween(from, b.dates.referralAccepted),
  };
}

/** The first monthly statement: which month it covers, when it's due, and when it's issued in this case. */
export function firstStatement(b: Dated & Pick<MissionBlockData, "noServicesFirstMonth">) {
  const day0 = b.dates.referralAccepted;
  if (!ISO.test(day0)) return null;
  const due = anchorDate(b, "statement_due");
  const issued = anchorDate(b, "statement_issued");
  return {
    month: showMonth(day0),
    due,
    dueDay: daysBetween(day0, due),
    issued,
    issuedDay: b.statementIssuedDay,
    afterDay30: b.statementIssuedDay > 30,
    noServices: b.noServicesFirstMonth,
  };
}

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
const int = (v: unknown, lo: number, hi: number, d: number) =>
  v !== null && v !== "" && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d;
const date = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : "");
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : []);

/**
  The block's fields, checked. Publishing needs the dates in order, tasks whose dependencies exist and don't
  loop, at least one decision point with a safe choice, the source and its version, and sign-off from Care
  Operations, Supplier Compliance, Finance and Quality.
*/
export function parseMission(o: Raw, where: string, h: ParseHelpers): MissionBlockData {
  const { str, idOf, list, unfinished } = h;
  const p = obj(o.participant);
  const d = obj(o.dates);
  const dates = { fundingAllocation: date(d.fundingAllocation), providerSelection: date(d.providerSelection), referralAccepted: date(d.referralAccepted) };
  if (!dates.fundingAllocation || !dates.providerSelection || !dates.referralAccepted)
    unfinished(`${where} needs the dates funding was allocated, the provider was chosen and the referral was accepted.`);
  else if (dates.providerSelection < dates.fundingAllocation || dates.referralAccepted < dates.providerSelection)
    unfinished(`${where}: funding is allocated first, then the provider is chosen, then the referral is accepted (they can fall on the same day).`);

  const tasks = list(o.tasks, where, "tasks", 16).map((t, i): MissionTask => {
    const at = `${where} task ${i + 1}`;
    const tg = obj(t.target);
    const nb = t.notBeforeDay === null || t.notBeforeDay === undefined || t.notBeforeDay === "" ? null : int(t.notBeforeDay, 0, 120, 0);
    return {
      id: idOf(t.id, at),
      title: str(t.title, `${at} title`, { required: true, max: 120 }) ?? "",
      owner: str(t.owner, `${at} owner`, { required: true, max: 120 }) ?? "",
      needs: str(t.needs, `${at}: what it needs`, { max: 600 }) ?? "",
      dependsOn: ids(t.dependsOn),
      target: {
        anchor: oneOf(tg.anchor, Object.keys(ANCHORS) as DateAnchor[], "referral_accepted"),
        offset: int(tg.offset, -60, 120, 0),
        kind: oneOf(tg.kind, Object.keys(TARGET_KINDS) as TargetKind[], "case"),
      },
      notBeforeDay: nb,
      notBeforeWhy: str(t.notBeforeWhy, `${at}: why not before then`, { max: 300 }) ?? "",
      start: oneOf(t.start, MISSION_STATUSES, "to_plan"),
    };
  });
  if (tasks.length < 3) unfinished(`${where} needs at least 3 tasks on the board.`);
  const known = new Set(tasks.map((t) => t.id));
  for (const t of tasks) t.dependsOn = t.dependsOn.filter((x) => known.has(x) && x !== t.id);
  if (hasLoop(tasks)) unfinished(`${where}: the tasks’ dependencies go round in a circle, so none of them could ever be done.`);

  const checkpoints = list(o.checkpoints, where, "decision points", 10).map((c, i): MissionCheckpoint => {
    const at = `${where} decision point ${i + 1}`;
    const m = c.message && typeof c.message === "object" ? obj(c.message) : null;
    const actions = list(c.actions, at, "choices", 10).map((a, j): MissionAction => ({
      id: idOf(a.id, `${at} choice ${j + 1}`),
      label: str(a.label, `${at} choice ${j + 1}`, { required: true, max: 200 }) ?? "",
      role: oneOf(a.role, Object.keys(ACTION_ROLES) as ActionRole[], "helpful"),
      dim: oneOf(a.dim, Object.keys(DIMENSIONS) as Dim[], "sequencing"),
      feedback: str(a.feedback, `${at} choice ${j + 1} feedback`, { required: true, max: 700 }) ?? "",
      consequence: str(a.consequence, `${at} choice ${j + 1}: what happens next`, { max: 400 }) ?? "",
      told: str(a.told, `${at} choice ${j + 1}: what the participant hears`, { max: 400 }) ?? "",
      promise: str(a.promise, `${at} choice ${j + 1} promise`, { max: 200 }) ?? "",
      keeps: typeof a.keeps === "string" ? a.keeps : "",
      readiness: oneOf(a.readiness, ["", ...(Object.keys(READINESS) as Readiness[])], ""),
      informed: oneOf(a.informed, ["", ...(Object.keys(INFORMED) as Informed[])], ""),
      risk: str(a.risk, `${at} choice ${j + 1} risk`, { max: 300 }) ?? "",
      sets: (Array.isArray(a.sets) ? a.sets : [])
        .slice(0, 6)
        .map((s) => obj(s))
        .filter((s) => typeof s.task === "string" && known.has(s.task))
        .map((s) => ({ task: s.task as string, status: oneOf(s.status, MISSION_STATUSES, "ready") })),
    }));
    if (actions.length < 3) unfinished(`${at} needs at least 3 choices.`);
    if (!actions.some((a) => a.role === "essential")) unfinished(`${at} needs at least one choice marked as needed in this case.`);
    const message = m
      ? {
          prompt: str(m.prompt, `${at} message prompt`, { required: true, max: 300 }) ?? "",
          checklist: (Array.isArray(m.checklist) ? m.checklist : [])
            .slice(0, 8)
            .map((x, k) => str(x, `${at} message checklist ${k + 1}`, { max: 200 }) ?? "")
            .filter(Boolean),
          model: str(m.model, `${at} example message`, { required: true, max: 1500 }) ?? "",
        }
      : null;
    return {
      id: idOf(c.id, at),
      day: int(c.day, 0, 120, 0),
      title: str(c.title, `${at} title`, { required: true, max: 120 }) ?? "",
      facts: (Array.isArray(c.facts) ? c.facts : [])
        .slice(0, 8)
        .map((x, k) => str(x, `${at} fact ${k + 1}`, { max: 500 }) ?? "")
        .filter(Boolean),
      atRisk: ids(c.atRisk).filter((x) => known.has(x)),
      requires: ids(c.requires).filter((x) => known.has(x)),
      requireWhy: str(c.requireWhy, `${at}: why those tasks come first`, { max: 400 }) ?? "",
      actions,
      message,
      readiness: oneOf(c.readiness, Object.keys(READINESS) as Readiness[], "ready"),
      risk: str(c.risk, `${at} outstanding risk`, { max: 300 }) ?? "",
    };
  });
  if (!checkpoints.length) unfinished(`${where} needs at least one decision point.`);
  checkpoints.sort((a, b) => a.day - b.day);
  const actionIds = new Set(checkpoints.flatMap((c) => c.actions.map((a) => a.id)));
  for (const c of checkpoints) for (const a of c.actions) if (a.keeps && !actionIds.has(a.keeps)) a.keeps = "";

  const firstServiceDay = int(o.firstServiceDay, 0, 120, 7);
  const statementIssuedDay = int(o.statementIssuedDay, 0, 120, 40);
  if (dates.referralAccepted) {
    const day0 = dates.referralAccepted;
    const ended = daysBetween(day0, monthEnd(day0));
    const due = daysBetween(day0, monthEnd(day0, 1));
    if (statementIssuedDay <= ended || statementIssuedDay > due)
      unfinished(
        `${where}: the first statement is issued after ${showMonth(day0)} ends and by ${showDate(monthEnd(day0, 1))} (between Day ${ended + 1} and Day ${due}).`,
      );
  }
  const s = obj(o.source);
  const ap = obj(o.approval);
  const approval = {
    owner: str(ap.owner, `${where} Care Operations owner`, { max: 120 }) ?? "",
    compliance: str(ap.compliance, `${where} Supplier Compliance reviewer`, { max: 120 }) ?? "",
    finance: str(ap.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
    quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    approvedOn: date(ap.approvedOn),
  };
  if (!missionApproved({ approval, source: { title: "x", version: "x" } }))
    unfinished(
      `${where}: sign-off is required. Record the Care Operations owner, the Supplier Compliance, Finance and Quality reviewers, and the date they approved the case.`,
    );
  const source = {
    title: str(s.title, `${where} source`, { max: 200 }) ?? "",
    version: str(s.version, `${where} source version`, { max: 80 }) ?? "",
    reviewedOn: date(s.reviewedOn),
  };
  if (!source.title || !source.version) unfinished(`${where}: record the policy source and its version that the case was checked against.`);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    participant: {
      name: str(p.name, `${where}: the participant’s name`, { required: true, max: 80 }) ?? "",
      age: p.age === null || p.age === undefined || p.age === "" ? null : int(p.age, 50, 110, 80),
      about: str(p.about, `${where}: about the participant`, { max: 800 }) ?? "",
      consent: str(p.consent, `${where}: who may be involved`, { max: 400 }) ?? "",
    },
    careModel: oneOf(o.careModel, Object.keys(CARE_MODELS) as CareModel[], "self_managed"),
    learnerRole: oneOf(o.learnerRole, Object.keys(LEARNER_ROLES) as LearnerRole[], "care_partner"),
    roleNote: str(o.roleNote, `${where}: who the learner is`, { max: 300 }) ?? "",
    dates,
    firstServiceDay,
    statementIssuedDay,
    noServicesFirstMonth: o.noServicesFirstMonth === true,
    tasks,
    checkpoints,
    closing: str(o.closing, `${where}: the example close-the-loop`, { max: 1500 }) ?? "",
    source,
    approval,
  };
}

function hasLoop(tasks: MissionTask[]) {
  const by = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    const loop = (by.get(id)?.dependsOn ?? []).some(visit);
    state.set(id, 2);
    return loop;
  };
  return tasks.some((t) => visit(t.id));
}

/** Whether a case has its sign-off: who approved it, when, and against which source. */
export const missionApproved = (b: { approval: MissionBlockData["approval"]; source: { title: string; version: string } }) =>
  Boolean(b.approval.owner && b.approval.compliance && b.approval.finance && b.approval.quality && b.approval.approvedOn && b.source.title && b.source.version);

/** The block as a learner's browser gets it: the case and the board, without what marks a choice right. */
export function missionForReaders<T extends MissionBlockData>(b: T): T {
  return {
    ...b,
    checkpoints: b.checkpoints.map((c) => ({
      ...c,
      actions: c.actions.map((a) => ({
        ...a,
        role: "helpful" as const,
        dim: "sequencing" as const,
        feedback: "",
        consequence: "",
        told: "",
        promise: "",
        keeps: "",
        readiness: "" as const,
        informed: "" as const,
        risk: "",
        sets: [],
      })),
      message: c.message ? { prompt: c.message.prompt, checklist: [], model: "" } : null,
      readiness: "ready" as const,
      risk: "",
    })),
    closing: "",
  };
}

/** A copy with ids of its own, so two boards in one course never share an id. References follow. */
export function freshMission(data: MissionBlockData, tag = Math.random().toString(36).slice(2, 7)): MissionBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  return {
    ...structuredClone(data),
    tasks: data.tasks.map((t) => ({ ...t, id: re(t.id), dependsOn: t.dependsOn.map(re), target: { ...t.target } })),
    checkpoints: data.checkpoints.map((c) => ({
      ...c,
      id: re(c.id),
      facts: [...c.facts],
      atRisk: c.atRisk.map(re),
      requires: c.requires.map(re),
      actions: c.actions.map((a) => ({ ...a, id: re(a.id), keeps: re(a.keeps), sets: a.sets.map((s) => ({ ...s, task: re(s.task) })) })),
      message: c.message ? { ...c.message, checklist: [...c.message.checklist] } : null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Decision = {
  /** The choices that stand. */
  actions: string[];
  /** Every set of choices they sent, first to last. */
  tries: string[][];
  message: string;
  /** Checklist items the learner says their message covered. */
  covered: number[];
  settled: boolean;
};
export type CloseItem = { owner: string; date: string; resolved: boolean };
export type MissionState = {
  /** Which decision point they're at. One past the last is "Close the loop". */
  at: number;
  board: Record<string, MissionStatus>;
  /** The learner's own order of the cards. */
  order: string[];
  /** A task they've handed to someone else. */
  owners: Record<string, string>;
  decisions: Record<string, Decision>;
  /** Drafts of messages they haven't sent yet. */
  drafts: Record<string, string>;
  /** Moves the board refused because something had to come first. */
  refusals: number;
  close: Record<string, CloseItem>;
  nextCheckIn: string;
  /** After the debrief: one decision point tried again. */
  redo: { checkpoint: string; actions: string[] } | null;
};

export function initialState(b: MissionBlockData): MissionState {
  const s: MissionState = {
    at: 0,
    board: Object.fromEntries(b.tasks.map((t) => [t.id, t.start])),
    order: b.tasks.map((t) => t.id),
    owners: {},
    decisions: {},
    drafts: {},
    refusals: 0,
    close: {},
    nextCheckIn: "",
    redo: null,
  };
  return arrive(b, s);
}

/** What an event puts at risk when the case reaches it. */
function arrive(b: MissionBlockData, s: MissionState): MissionState {
  const c = b.checkpoints[s.at];
  if (!c) return s;
  const board = { ...s.board };
  for (const id of c.atRisk) if (board[id] !== "done") board[id] = "at_risk";
  return { ...s, board };
}

/** The day the case is on: the decision point's, or Day 30 (or the last event, if later) for closing the loop. */
export const dayOf = (b: MissionBlockData, at: number) => b.checkpoints[at]?.day ?? Math.max(30, ...b.checkpoints.map((c) => c.day));

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Saved work, checked against the case: unknown ids dropped, strings capped. */
export function cleanState(b: MissionBlockData, raw: unknown): MissionState {
  const r = obj(raw);
  const base = initialState(b);
  const taskIds = new Set(b.tasks.map((t) => t.id));
  const board = { ...base.board };
  for (const [k, v] of Object.entries(obj(r.board))) if (taskIds.has(k) && MISSION_STATUSES.includes(v as MissionStatus)) board[k] = v as MissionStatus;
  const order = ids(r.order).filter((x) => taskIds.has(x));
  for (const t of b.tasks) if (!order.includes(t.id)) order.push(t.id);
  const owners: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.owners))) if (taskIds.has(k) && typeof v === "string" && v.trim()) owners[k] = v.slice(0, 120);
  const decisions: Record<string, Decision> = {};
  for (const c of b.checkpoints) {
    const d = obj(obj(r.decisions)[c.id]);
    if (!Object.keys(d).length) continue;
    const valid = new Set(c.actions.map((a) => a.id));
    const pick = (v: unknown) => [...new Set(ids(v).filter((x) => valid.has(x)))];
    decisions[c.id] = {
      actions: pick(d.actions),
      tries: (Array.isArray(d.tries) ? d.tries : []).slice(0, 20).map(pick),
      message: text(d.message, 2000),
      covered: (Array.isArray(d.covered) ? d.covered : []).filter((n): n is number => Number.isInteger(n) && n >= 0 && n < (c.message?.checklist.length ?? 8)),
      settled: d.settled === true,
    };
  }
  const drafts: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.drafts))) if (b.checkpoints.some((c) => c.id === k)) drafts[k] = text(v, 2000);
  const close: Record<string, CloseItem> = {};
  for (const [k, v] of Object.entries(obj(r.close))) {
    const c = obj(v);
    close[k.slice(0, 80)] = { owner: text(c.owner, 120), date: date(c.date), resolved: c.resolved === true };
  }
  const at = int(r.at, 0, b.checkpoints.length, 0);
  const redo = obj(r.redo);
  const redoCp = b.checkpoints.find((c) => c.id === redo.checkpoint);
  return {
    at,
    board,
    order,
    owners,
    decisions,
    drafts,
    refusals: int(r.refusals, 0, 999, 0),
    close,
    nextCheckIn: date(r.nextCheckIn),
    redo: redoCp ? { checkpoint: redoCp.id, actions: ids(redo.actions).filter((x) => redoCp.actions.some((a) => a.id === x)) } : null,
  };
}

/** Why the board won't take a move, or null if it will. Moving to anything but Done is always allowed. */
export function moveProblem(b: MissionBlockData, s: MissionState, taskId: string, status: MissionStatus): string | null {
  const t = b.tasks.find((x) => x.id === taskId);
  if (!t) return "That task isn’t on this board.";
  if (status !== "done") return null;
  const blocking = t.dependsOn.map((id) => b.tasks.find((x) => x.id === id)).filter((x): x is MissionTask => Boolean(x) && s.board[x!.id] !== "done");
  if (blocking.length) return `“${t.title}” needs ${blocking.map((x) => `“${x.title}”`).join(" and ")} done first.`;
  const day = dayOf(b, s.at);
  if (t.notBeforeDay !== null && day < t.notBeforeDay)
    return (
      t.notBeforeWhy || `“${t.title}” can’t be done yet: in this case it can’t happen before ${showDate(dayDate(b, t.notBeforeDay))} (Day ${t.notBeforeDay}).`
    );
  return null;
}

/** Board changes from a learner's saved work that the rules allow; anything else stays as it was. */
export function applyBoard(b: MissionBlockData, prev: MissionState, next: MissionState): MissionState {
  const board = { ...prev.board };
  for (const t of b.tasks) {
    const want = next.board[t.id];
    if (!want || want === board[t.id]) continue;
    if (!moveProblem(b, { ...prev, board }, t.id, want)) board[t.id] = want;
  }
  // A task that's Done stays Done only while what it depends on is.
  for (const t of b.tasks) if (board[t.id] === "done" && t.dependsOn.some((d) => board[d] !== "done")) board[t.id] = "ready";
  return {
    ...prev,
    board,
    order: next.order,
    owners: next.owners,
    drafts: next.drafts,
    refusals: Math.max(prev.refusals, next.refusals),
    close: next.close,
    nextCheckIn: next.nextCheckIn,
  };
}

export type DecisionFeedback = {
  chosen: { id: string; label: string; role: ActionRole; feedback: string; consequence: string }[];
  /** Why they have to look again. Empty when the decision stands. */
  critical: string[];
  /** Needed choices they didn't make. Only given once the decision stands, so it isn't a hint. */
  missed: string[];
  status: StatusNow;
  /** The example message and its checklist, once they've written theirs. */
  message: MissionMessage | null;
};
export type StatusNow = { readiness: Readiness; informed: Informed; risk: string; promises: { made: number; kept: number; open: number } };

/** What a set of choices amounts to at a decision point. Unsafe or misleading choices, or nothing that's needed, have to be looked at again. */
export function checkDecision(b: MissionBlockData, c: MissionCheckpoint, chosen: string[], s: MissionState): DecisionFeedback {
  const picked = chosen.map((id) => c.actions.find((a) => a.id === id)).filter((a): a is MissionAction => Boolean(a));
  const critical: string[] = [];
  const unsafe = picked.filter((a) => a.role === "unsafe");
  if (unsafe.length) critical.push(...unsafe.map((a) => `“${a.label}”: ${a.feedback}`));
  else if (!picked.some((a) => a.role === "essential"))
    critical.push(
      "What you’ve chosen doesn’t deal with what this moment needs. Think about what has to be true before anything starts, and who needs to know.",
      // Why each choice falls short, so the learner has something to work from without being handed the answer.
      ...picked.filter((a) => a.role === "insufficient").map((a) => `“${a.label}”: ${a.feedback}`),
    );
  const settledState = { ...s, decisions: { ...s.decisions, [c.id]: { actions: chosen, tries: [], message: "", covered: [], settled: true } } };
  return {
    chosen: picked.map(({ id, label, role, feedback, consequence }) => ({ id, label, role, feedback, consequence })),
    critical,
    missed: critical.length ? [] : c.actions.filter((a) => a.role === "essential" && !chosen.includes(a.id)).map((a) => a.label),
    status: statusNow(b, c, picked, critical.length ? s : settledState),
    message: c.message,
  };
}

const READY_RANK: Readiness[] = ["ready", "at_risk", "held", "unsafe"];
const INFORMED_RANK: Informed[] = ["no", "partly", "yes"];
function statusNow(b: MissionBlockData, c: MissionCheckpoint, picked: MissionAction[], s: MissionState): StatusNow {
  const r = picked.map((a) => a.readiness).filter((x): x is Readiness => Boolean(x));
  const i = picked.map((a) => a.informed).filter((x): x is Informed => Boolean(x));
  const risks = picked.map((a) => a.risk).filter(Boolean);
  const p = promises(b, s);
  return {
    readiness: r.length ? r.reduce((w, x) => (READY_RANK.indexOf(x) > READY_RANK.indexOf(w) ? x : w), "ready" as Readiness) : c.readiness,
    informed: i.length ? i.reduce((w, x) => (INFORMED_RANK.indexOf(x) > INFORMED_RANK.indexOf(w) ? x : w), "no" as Informed) : "no",
    risk: risks.join(" ") || c.risk,
    promises: { made: p.length, kept: p.filter((x) => x.keptAt).length, open: p.filter((x) => !x.keptAt).length },
  };
}

/** The learner decides at the current point. Returns the new state, or a reason it can't be taken yet. */
export function decide(
  b: MissionBlockData,
  s: MissionState,
  input: { checkpoint: unknown; actions: unknown; message?: unknown; covered?: unknown },
): { state: MissionState; feedback: DecisionFeedback } | { problem: string } {
  const c = b.checkpoints[s.at];
  if (!c || c.id !== input.checkpoint) return { problem: "That moment has passed. Pick up where the case is now." };
  if (s.decisions[c.id]?.settled) return { problem: "You’ve already decided this one. Move on when you’re ready." };
  const valid = new Set(c.actions.map((a) => a.id));
  const chosen = [...new Set(ids(input.actions).filter((x) => valid.has(x)))];
  if (!chosen.length) return { problem: "Choose what you’d do." };
  const message = text(input.message, 2000).trim();
  if (c.message && message.length < 20) return { problem: "Write what you’d say first, in a sentence or two." };
  const fb = checkDecision(b, c, chosen, s);
  const prev = s.decisions[c.id];
  const d: Decision = {
    actions: chosen,
    tries: [...(prev?.tries ?? []), chosen].slice(-20),
    message,
    covered: (Array.isArray(input.covered) ? input.covered : []).filter(
      (n): n is number => Number.isInteger(n) && n >= 0 && n < (c.message?.checklist.length ?? 0),
    ),
    settled: fb.critical.length === 0,
  };
  let board = s.board;
  if (d.settled) {
    board = { ...board };
    // A choice moves the board along; it never undoes something the learner has already finished.
    for (const a of c.actions) if (chosen.includes(a.id)) for (const x of a.sets) if (board[x.task] !== "done" || x.status === "done") board[x.task] = x.status;
  }
  const drafts = { ...s.drafts };
  delete drafts[c.id];
  return {
    state: { ...s, board, drafts, decisions: { ...s.decisions, [c.id]: d } },
    // The example message only once the decision stands, so it's never a crib for a second try.
    feedback: { ...fb, message: d.settled ? c.message : null },
  };
}

/** On to the next point, if the board has what that point needs. */
export function advance(b: MissionBlockData, s: MissionState): { state: MissionState } | { problem: string; missing: string[] } {
  const c = b.checkpoints[s.at];
  if (!c) return { problem: "The case is at its end. Close the loop.", missing: [] };
  if (!s.decisions[c.id]?.settled) return { problem: "Decide what you’ll do here first.", missing: [] };
  const next = b.checkpoints[s.at + 1];
  if (next) {
    const missing = next.requires.filter((id) => s.board[id] !== "done").map((id) => b.tasks.find((t) => t.id === id)?.title ?? id);
    if (missing.length)
      return {
        problem: `Not yet. Before Day ${next.day} (${next.title.toLowerCase()}): ${next.requireWhy || "these need to be done."}`,
        missing,
      };
  }
  return { state: arrive(b, { ...s, at: s.at + 1 }) };
}

export type MissionPromise = { id: string; text: string; day: number; keptAt: string | null };
/** The commitments the learner's settled choices made, and whether a later choice kept each one. */
export function promises(b: MissionBlockData, s: MissionState): MissionPromise[] {
  const settled = b.checkpoints.filter((c) => s.decisions[c.id]?.settled);
  const chosen = settled.flatMap((c) => c.actions.filter((a) => s.decisions[c.id].actions.includes(a.id)).map((a) => ({ a, c })));
  return chosen
    .filter(({ a }) => a.promise)
    .map(({ a, c }) => {
      const keeper = chosen.find((x) => x.a.keeps === a.id);
      return { id: a.id, text: a.promise, day: c.day, keptAt: keeper ? `Day ${keeper.c.day}: ${keeper.a.label}` : null };
    });
}

/** What still needs an owner and a date (or to be marked resolved) before the case can close. */
export function openItems(b: MissionBlockData, s: MissionState) {
  return [
    ...b.tasks
      .filter((t) => s.board[t.id] !== "done")
      .map((t) => ({ key: `task:${t.id}`, label: t.title, kind: "task" as const, owner: s.owners[t.id] || t.owner, target: targetDate(b, t) })),
    ...promises(b, s)
      .filter((p) => !p.keptAt)
      .map((p) => ({ key: `promise:${p.id}`, label: p.text, kind: "promise" as const, owner: "", target: "" })),
  ];
}

/** What's missing before the learner can finish. */
export function finishProblems(b: MissionBlockData, s: MissionState): string[] {
  if (s.at < b.checkpoints.length) return ["Work through the case to Day 30 first."];
  const out = openItems(b, s)
    .filter((i) => {
      const c = s.close[i.key];
      return !c || (!c.resolved && (!c.owner.trim() || !c.date));
    })
    .map((i) => `“${i.label}” needs an owner and a date, or to be marked resolved.`);
  if (!s.nextCheckIn) out.push("Agree the date of the next check-in with the participant.");
  return out;
}

/** What the participant has actually been told: the participant view. */
export function participantView(b: MissionBlockData, s: MissionState) {
  return b.checkpoints
    .filter((c) => s.decisions[c.id]?.settled)
    .map((c) => ({
      day: c.day,
      date: dayDate(b, c.day),
      title: c.title,
      told: c.actions.filter((a) => s.decisions[c.id].actions.includes(a.id) && a.told).map((a) => a.told),
      message: s.decisions[c.id].message,
    }))
    .filter((x) => x.told.length || x.message);
}

/**
  What the learner's page needs that only the full case can work out, because the reader's copy has the
  promises and the participant's lines taken out: what the participant has been told, and the promises made.
*/
export const learnerView = (b: MissionBlockData, s: MissionState) => ({ told: participantView(b, s), promises: promises(b, s) });
export type LearnerView = ReturnType<typeof learnerView>;

// ---------------------------------------------------------------------------------------------
// How it reads: five readings in words, never a retention score
// ---------------------------------------------------------------------------------------------

export const RATING = ["Worth another look", "Partly there", "Strong"] as const;
export const ratingOf = (score: number) => RATING[score >= 0.8 ? 2 : score >= 0.45 ? 1 : 0];

export type MissionResult = {
  dims: Record<Dim, { score: number; notes: string[] }>;
  /** Kept with the attempt for totals; the learner sees the words. */
  total: number;
  flags: { changedCourse: number; refusals: number; promisesOpen: number; promisesKept: number };
};

export function scoreMission(b: MissionBlockData, s: MissionState): MissionResult {
  const dims = Object.fromEntries((Object.keys(DIMENSIONS) as Dim[]).map((d) => [d, { score: 1, notes: [] as string[] }])) as MissionResult["dims"];
  let changedCourse = 0;
  for (const d of Object.keys(DIMENSIONS) as Dim[]) {
    // The share of needed choices made, less a little for each unsafe or misleading choice that had to be undone.
    let need = 0;
    let got = 0;
    let undone = 0;
    for (const c of b.checkpoints) {
      const dec = s.decisions[c.id];
      const essential = c.actions.filter((a) => a.role === "essential" && a.dim === d);
      need += essential.length;
      got += essential.filter((a) => dec?.actions.includes(a.id)).length;
      for (const a of essential) if (dec && !dec.actions.includes(a.id)) dims[d].notes.push(`Day ${c.day}: not chosen: ${a.label}.`);
      const unsafe = c.actions.filter((a) => a.role === "unsafe" && a.dim === d && dec?.tries.some((t) => t.includes(a.id)));
      for (const a of unsafe) dims[d].notes.push(`Day ${c.day}: you first chose “${a.label}”, then changed course.`);
      undone += unsafe.length;
    }
    dims[d].score = Math.max(0, (need ? got / need : 1) - 0.3 * undone);
  }
  // Sequencing also reads the board: moves it had to stop because something came first.
  if (s.refusals) {
    dims.sequencing.score = Math.max(0, dims.sequencing.score - Math.min(0.6, 0.15 * s.refusals));
    dims.sequencing.notes.push(
      `The board stopped ${s.refusals} ${s.refusals === 1 ? "move" : "moves"} that came before what ${s.refusals === 1 ? "it depends" : "they depend"} on.`,
    );
  }
  for (const c of b.checkpoints) if ((s.decisions[c.id]?.tries.length ?? 0) > 1) changedCourse += 1;
  const p = promises(b, s);
  const kept = p.filter((x) => x.keptAt).length;
  if (p.length)
    dims.recovery.notes.push(
      `${kept} of ${p.length} ${p.length === 1 ? "promise" : "promises"} kept within the case; the rest handed on with an owner and a date.`,
    );
  const weights: Record<Dim, number> = { sequencing: 20, safe: 30, choice: 20, recovery: 15, explain: 15 };
  return {
    dims,
    total: Math.round((Object.keys(DIMENSIONS) as Dim[]).reduce((n, d) => n + dims[d].score * weights[d], 0)),
    flags: { changedCourse, refusals: s.refusals, promisesOpen: p.length - kept, promisesKept: kept },
  };
}

/** Everything the debrief shows. Built from the full case, so only after the learner has finished. */
export function buildDebrief(b: MissionBlockData, s: MissionState, r: MissionResult) {
  const label = (c: MissionCheckpoint, id: string) => c.actions.find((a) => a.id === id)?.label ?? id;
  return {
    dims: (Object.keys(DIMENSIONS) as Dim[]).map((d) => ({ id: d, label: DIMENSIONS[d].label, rating: ratingOf(r.dims[d].score), notes: r.dims[d].notes })),
    timeline: b.checkpoints.map((c, i) => {
      const dec = s.decisions[c.id];
      const first = dec?.tries[0] ?? [];
      const picked = c.actions.filter((a) => dec?.actions.includes(a.id));
      return {
        id: c.id,
        day: c.day,
        date: dayDate(b, c.day),
        title: c.title,
        chosen: picked.map((a) => ({ label: a.label, role: a.role, feedback: a.feedback })),
        firstTry: dec && dec.tries.length > 1 ? first.map((id) => label(c, id)) : [],
        missed: c.actions.filter((a) => a.role === "essential" && !dec?.actions.includes(a.id)).map((a) => a.label),
        // How things stood that day: promises counted only from decisions made by then.
        status: statusNow(b, c, picked, {
          ...s,
          decisions: Object.fromEntries(
            b.checkpoints
              .slice(0, i + 1)
              .filter((x) => s.decisions[x.id])
              .map((x) => [x.id, s.decisions[x.id]]),
          ),
        }),
        message: dec?.message ?? "",
        model: c.message,
        actions: c.actions.map(({ id, label, role, feedback }) => ({ id, label, role, feedback })),
      };
    }),
    promises: promises(b, s).map((p) => ({ ...p, handover: p.keptAt ? null : (s.close[`promise:${p.id}`] ?? null) })),
    open: openItems(b, s).map((i) => ({ ...i, close: s.close[i.key] ?? null })),
    board: b.tasks.map((t) => ({ id: t.id, title: t.title, status: s.board[t.id], target: targetDate(b, t), kind: t.target.kind })),
    statement: firstStatement(b),
    nextCheckIn: s.nextCheckIn,
    closing: b.closing,
    told: participantView(b, s),
    source: b.source,
  };
}
export type MissionDebrief = ReturnType<typeof buildDebrief>;
