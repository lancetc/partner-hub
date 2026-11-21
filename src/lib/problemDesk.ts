import type { Barrier } from "./blockRegistry";

/*
  The Problem desk (docs/learning-designer.md): the trail from a signal to a reasoned response and evidence of
  change. signal → problem → target behaviour → barrier → response → learning design → evidence.

  The Hub is the learning and improvement layer. It is not the complaints or incident system: it holds
  de-identified theme summaries and links back to the authorised record, and nothing here acknowledges, resolves
  or closes a real case. A theme can be closed without any training, and a course is never required to close one.

  Counting rules, kept apart everywhere:
  - a case is one unique issue in its source system;
  - a case event is one dated contact about it: the initial report, a follow-up, a material change, a repeat
    contact, a closure, a reopening. One case with three follow-ups is one case and four contact events;
  - an update (a follow-up or a material change) is new information on the same case. A repeat contact is the same
    person or business coming back because the issue is unresolved or has happened again. Both are contacts; only
    the second is counted as a repeat. Neither is ever another unique case;
  - a theme is a human-reviewed grouping of cases. A model's or a person's first guess at a grouping is a
    candidate until someone verifies it.
*/

export const THEME_STATUS = {
  investigate: "Investigate",
  immediate: "Immediate operational action",
  plan: "Plan response",
  addressed: "Already addressed",
  monitor: "Monitor",
  closed: "Closed with evidence",
} as const;
export type ThemeStatus = keyof typeof THEME_STATUS;
export const RISK = { routine: "Routine", elevated: "Elevated", safety: "Safety significance" } as const;
export type Risk = keyof typeof RISK;
export const SOURCES = {
  complaint: "Complaint",
  incident: "Incident review",
  billing: "Billing rework",
  portal: "Portal question",
  community: "Community theme",
  webinar: "Webinar question",
  policy: "Policy change",
  audit: "Audit finding",
  content: "Content report",
} as const;
export type SourceKind = keyof typeof SOURCES;
export const EVENT_KINDS = {
  initial: "Initial report",
  update: "Follow-up",
  change: "Material change",
  repeat: "Repeat contact",
  close: "Closed",
  reopen: "Reopened",
} as const;
/** The kinds that are someone raising something. A closure or a reopening is a change of state, not a contact. */
export const CONTACT_KINDS: readonly EventKind[] = ["initial", "update", "change", "repeat"];
export type EventKind = keyof typeof EVENT_KINDS;
export const CONFIDENCE = { known: "Known", suspected: "Suspected", unknown: "Unknown" } as const;
export type Confidence = keyof typeof CONFIDENCE;

export const ACTION_KINDS = {
  process: "Process change",
  portal: "Portal or product change",
  guidance: "Clearer guidance or search",
  job_aid: "Job aid at the point of work",
  comms: "Targeted communication",
  coaching: "Manager coaching",
  learning: "Learning",
  other: "Something else",
} as const;
export type ActionKind = keyof typeof ACTION_KINDS;
export const ACTION_STATUS = { planned: "Planned", in_progress: "In progress", done: "Done", dropped: "Dropped" } as const;
export type ActionStatus = keyof typeof ACTION_STATUS;
export const RESULTS = { improved: "Improved", mixed: "Mixed", no_change: "No observed change", too_early: "Too early or insufficient data" } as const;
export type ResultStatus = keyof typeof RESULTS;
/** What to do about existing learning: there's no requirement to build anything. */
export const LEARNING_DECISIONS = {
  reuse: "Reuse as it is",
  revise: "Revise existing",
  role_section: "Add a role-specific section",
  combine: "Combine overlapping items",
  new: "Create new",
  none: "No learning item",
} as const;
export type LearningDecision = keyof typeof LEARNING_DECISIONS;
export const REVIEW_DECISIONS = {
  keep: "Keep",
  revise: "Revise",
  target: "Target differently",
  withdraw: "Withdraw",
  process: "Process fix",
  close: "Close with evidence",
} as const;
export type ReviewDecision = keyof typeof REVIEW_DECISIONS;

/** What's weighed when ordering the queue. Shown as considerations, never added up into a score. */
export const CONSIDERATIONS = {
  harm: "Potential harm",
  recurrence: "Recurrence and trend",
  reach: "How many people meet the task",
  evidence: "Quality of the evidence",
  actionable: "Whether an action can address the cause",
  load: "Current learning load on the audience",
} as const;

export type CaseEvent = { id: string; kind: EventKind; on: string; note: string };
export type Case = {
  id: string;
  themeId: string | null;
  source: SourceKind;
  sourceRef: string;
  summary: string;
  link: string;
  falseMatch: boolean;
  events: CaseEvent[];
  /** A stable, de-identified label for who the case concerns ("Partner business A"). Never a name. */
  party?: string;
};

export type DiagnosisBarrier = { id: string; barrier: Barrier; text: string; evidence: string; confidence: Confidence; validator: string };
export type Diagnosis = {
  situation: string;
  role: string;
  observed: string;
  desired: string;
  barriers: DiagnosisBarrier[];
  unknowns: string;
  checkedWith: string;
  /** The operational expert has confirmed the work situation. Until then it's a hypothesis to test. */
  verified: boolean;
};
export const emptyDiagnosis = (): Diagnosis => ({
  situation: "",
  role: "",
  observed: "",
  desired: "",
  barriers: [],
  unknowns: "",
  checkedWith: "",
  verified: false,
});

/** "In [situation], [role] currently [observed]. The desired behaviour is [desired]. We think the main barrier is [...]." */
export function workingStatement(d: Diagnosis, barrierLabel: (b: Barrier) => string) {
  if (!d.situation && !d.observed && !d.desired) return "";
  const main = d.barriers[0];
  return [
    `In ${d.situation || "[work situation]"}, ${d.role || "[role]"} currently ${d.observed || "[observed action or omission]"}.`,
    `The desired behaviour is ${d.desired || "[specific safe action]"}.`,
    main
      ? `We think the main barrier is ${(main.text || barrierLabel(main.barrier)).replace(/\.$/, "")} (${CONFIDENCE[main.confidence].toLowerCase()}).`
      : "The barrier hasn’t been worked out yet.",
  ].join(" ");
}

export type ResponseData = {
  problem: string;
  audience: string;
  audienceSize: number | null;
  desired: string;
  barrierSummary: string;
  learning: LearningDecision | "";
  why: string;
  measure: { name: string; definition: string; owner: string; link: string };
  baseline: { window: string; note: string };
  lag: string;
  competing: string;
  reviewOn: string;
  effort: { authorHours: number; reviewHours: number; learnerMinutes: number; supportHours: number; maintenance: string };
  assignment: { required: boolean; roles: string; reason: string; due: string };
  owner: string;
  /** What the learning plan can build from: a realistic artefact, an approved source, and whether a criterion must be met. */
  brief: { hasArtefact: boolean; hasSource: boolean; assessed: boolean };
};
export const emptyResponse = (): ResponseData => ({
  problem: "",
  audience: "",
  audienceSize: null,
  desired: "",
  barrierSummary: "",
  learning: "",
  why: "",
  measure: { name: "", definition: "", owner: "", link: "" },
  baseline: { window: "", note: "" },
  lag: "",
  competing: "",
  reviewOn: "",
  effort: { authorHours: 0, reviewHours: 0, learnerMinutes: 0, supportHours: 0, maintenance: "" },
  assignment: { required: false, roles: "", reason: "", due: "" },
  owner: "",
  brief: { hasArtefact: false, hasSource: false, assessed: false },
});

/** What a response needs before an owner can approve it. A no-course decision is valid; a missing measure isn't. */
export function responseProblems(r: ResponseData, hasActions: boolean): string[] {
  const out: string[] = [];
  if (r.problem.trim().length < 10) out.push("State the problem and its evidence.");
  if (!r.audience.trim()) out.push("Say who is affected.");
  if (r.desired.trim().length < 10) out.push("State the specific behaviour wanted.");
  if (!r.barrierSummary.trim()) out.push("Record the barrier, and how sure anyone is.");
  if (!r.learning) out.push("Decide what to do about learning: reuse, revise, new, or no learning item.");
  if (r.why.trim().length < 10) out.push("Say why this response was chosen.");
  if (!hasActions) out.push("Add at least one action with an owner.");
  if (!r.measure.name.trim()) out.push("Name the work measure that would show improvement.");
  if (!r.baseline.window.trim() && !r.baseline.note.trim()) out.push("Give the baseline, or the plan to collect one.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewOn)) out.push("Set the review date.");
  if (!r.owner.trim()) out.push("Name the response owner.");
  if (r.assignment.required && (!r.assignment.roles.trim() || !r.assignment.reason.trim())) out.push("A required assignment needs its roles and its reason.");
  return out;
}

/** A blanket ten minutes across 11,000 coordinators is about 1,833 learner hours: effort is part of the decision. */
export const learnerHours = (people: number | null, minutes: number) => (people && minutes ? Math.round((people * minutes) / 6) / 10 : null);

// ---------------------------------------------------------------------------------------------
// Counting cases and their events
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
const sorted = (c: Case) => [...c.events].sort((a, b) => a.on.localeCompare(b.on));

/** Whether a case is open as at a day: opened by its first event, closed by "close", open again on "reopen". */
export function caseOpen(c: Case, asAt: string) {
  let open = false;
  for (const e of sorted(c)) {
    if (e.on > asAt) break;
    if (e.kind === "close") open = false;
    else open = true;
  }
  return open;
}

export type CaseCounts = {
  cases: number;
  contactEvents: number;
  followUps: number;
  /** New information on the same case: follow-ups and material changes. */
  updates: number;
  /** The same person or business back about an unresolved or recurring issue. A subset of follow-ups. */
  repeatContacts: number;
  /** Distinct de-identified parties among the cases, and how many cases name none. */
  parties: number;
  casesWithoutParty: number;
  reopened: number;
  open: number;
  /** Cases with at least one follow-up or change after the first report. */
  repeatCases: number;
  /** Median days from first report to first closure, for cases that have closed. Null when none have. */
  medianDaysToClose: number | null;
  closedCases: number;
};

export function countCases(cases: Case[], asAt: string): CaseCounts {
  const real = cases.filter((c) => !c.falseMatch && c.events.length);
  const days: number[] = [];
  let contact = 0;
  let follow = 0;
  let reopened = 0;
  let repeat = 0;
  let updates = 0;
  let repeatContacts = 0;
  const parties = new Set<string>();
  let noParty = 0;
  for (const c of real) {
    const ev = sorted(c).filter((e) => e.on <= asAt);
    // Contacts are what someone raised: the report, follow-ups, changes and repeat contacts. A closure or reopening is a state change.
    const contacts = ev.filter((e) => CONTACT_KINDS.includes(e.kind));
    contact += contacts.length;
    updates += contacts.filter((e) => e.kind === "update" || e.kind === "change").length;
    repeatContacts += contacts.filter((e) => e.kind === "repeat").length;
    if (c.party?.trim()) parties.add(c.party.trim().toLowerCase());
    else noParty += 1;
    const after = contacts.length - 1;
    follow += Math.max(0, after);
    if (after > 0) repeat += 1;
    // A reopening only counts if the case had been closed first.
    let closed = false;
    for (const e of ev) {
      if (e.kind === "close") closed = true;
      else if (e.kind === "reopen" && closed) {
        reopened += 1;
        closed = false;
      }
    }
    const first = ev[0];
    const close = ev.find((e) => e.kind === "close");
    if (first && close) days.push(Math.round((at(close.on) - at(first.on)) / DAY));
  }
  days.sort((a, b) => a - b);
  return {
    cases: real.length,
    contactEvents: contact,
    followUps: follow,
    updates,
    repeatContacts,
    parties: parties.size,
    casesWithoutParty: noParty,
    reopened,
    open: real.filter((c) => caseOpen(c, asAt)).length,
    repeatCases: repeat,
    medianDaysToClose: days.length
      ? days.length % 2
        ? days[(days.length - 1) / 2]
        : Math.round((days[days.length / 2 - 1] + days[days.length / 2]) / 2)
      : null,
    closedCases: days.length,
  };
}

export type TrendPoint = { bucket: string; newCases: number; followUps: number; reopened: number; repeats: number; contacts: number };
/** Month buckets (YYYY-MM) from one month to another, inclusive. */
export function months(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  for (let i = 0; i < 60 && (y < ty || (y === ty && m <= tm)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** New unique cases, follow-up contacts and reopenings by month: three separate series, never added together. */
export function trend(cases: Case[], from: string, to: string): TrendPoint[] {
  const real = cases.filter((c) => !c.falseMatch);
  return months(from, to).map((bucket) => {
    let newCases = 0;
    let followUps = 0;
    let reopened = 0;
    let repeats = 0;
    for (const c of real) {
      let closed = false;
      for (const e of sorted(c)) {
        const inBucket = e.on.slice(0, 7) === bucket;
        if (e.kind === "initial" && inBucket) newCases += 1;
        if ((e.kind === "update" || e.kind === "change" || e.kind === "repeat") && inBucket) followUps += 1;
        if (e.kind === "repeat" && inBucket) repeats += 1;
        if (e.kind === "close") closed = true;
        if (e.kind === "reopen") {
          if (closed && inBucket) reopened += 1;
          closed = false;
        }
      }
    }
    return { bucket, newCases, followUps, reopened, repeats, contacts: newCases + followUps };
  });
}

export type MetricPoint = {
  id: string;
  metric: "work" | "practice";
  bucket: string;
  numerator: number;
  denominator: number | null;
  note: string;
  asAt: string;
  link: string;
};
/** A rate per 100, or null when there's no denominator: never a made-up percentage. */
export const ratePer100 = (p: Pick<MetricPoint, "numerator" | "denominator">) => (p.denominator ? Math.round((p.numerator / p.denominator) * 1000) / 10 : null);
/** Under this many in the denominator, a rate is too thin to read a trend from. */
export const SMALL_SAMPLE = 30;

/** The Hub's own report for an asset, if it has one. Never an invented address. */
export function reportLink(kind: string, ref: string): string | null {
  if (kind === "topic" && /^[a-z0-9-]+$/.test(ref)) return `/admin/completions/lessons/${ref}`;
  return null;
}
export function assetLink(kind: string, ref: string): string | null {
  if (kind === "topic" && /^[a-z0-9-]+$/.test(ref)) return `/admin/lessons/${ref}/edit`;
  if (kind === "course" && /^[\w-]+$/.test(ref)) return `/admin/magazine/${ref}`;
  return null;
}
