import { FIELD_STATES, type FieldState } from "./auditorVetting";
import { interpret, type FamilyBlock, type Intent } from "./familyCall";
import { identifierWarnings } from "./redpen";
import { categoryOn, isDate, RULESET, SERVICES, type Category, type ServiceId } from "./sahRules";
import { sourceById, SHADOW_SOURCES, type ShadowSource } from "./shadowCoachSources";

/*
  First 100 Days: Shadow & Coach (docs/shadow-and-coach.md), from the PRD "Partner Hub: First 100 Days — Shadow &
  Coach" (21 November 2026). A Care Partner business owner reviews a fictional new coordinator's work and practises
  the manager's part: notice what matters, protect the participant first, tell a skill gap from a workflow defect,
  coach without humiliation, assign a short plan from content the Hub already has, and check a second, different
  sample before a scoped readiness decision. The same unnamed coordinator recurs across the 100 days, so a later
  episode carries the history of an earlier one.

  It reuses what the Hub already has rather than repeating it:
  - the Tough Family Call's reading of free text (lib/familyCall `interpret`): authored phrases sentence by sentence,
    with a hedge just before a risky phrase sending it to a human reviewer instead of a guess;
  - Red Pen's identifier check (lib/redpen `identifierWarnings`) on every line of fictional text;
  - the Contractor Vetting Card's field states (lib/auditorVetting `FIELD_STATES`) for marking the evidence in the
    second sample: verified, needs verification, a material gap, needs owner review;
  - the Hub's one effective-dated contribution rule set (lib/sahRules): a scenario's category claims are checked
    against it, so a change there flags the case;
  - the Discharge Pivot's shape: a frozen scenario per attempt, deterministic replay of moves, critical errors that a
    good score can't cancel, a debrief kept as given, and sign-off gates.

  Pure functions only: the server, the editor's preview and the tests run the same engine. No AI is called: the plan
  is proposed from authored suggestions resolved against the live catalogue on the server, and coaching text is read
  by authored rules. Nothing here reports an incident, corrects a bill, changes a care plan, assigns real learning or
  creates an HR record.
*/

export const SHADOW_VERSION = "shadow-coach-1";
export const RUBRIC_VERSION = "shadow-rubric-1";
export const ENGINE_VERSION = "shadow-engine-1";

export const SHADOW_NOTICE =
  "Fictional practice. The new coordinator, Mrs Lin and every call, note and record here are invented. Nothing here reports an incident, corrects a bill, changes a care plan, assigns real learning or creates an employment or HR record. A real concern goes to the current incident or clinical process straight away.";
export const CUES_NOTICE = "Practice cues come from authored rules about the words you used. If one seems to have misread you, a reviewer can check it.";

/** The First 100 Days framework (PRD section 5): design defaults, never automatic access grants. */
export const STAGES = {
  orient: "Days 0–14: orient and shadow",
  practise: "Days 15–30: practise with feedback",
  independence: "Days 31–60: increasing independence",
  consolidate: "Days 61–100: consolidate",
} as const;
export type Stage = keyof typeof STAGES;
const STAGE_IDS = Object.keys(STAGES) as Stage[];

export const ARTEFACT_KINDS = { call: "Call transcript", note: "Contact note", plan: "Care plan draft", thread: "Message thread", qa: "QA artefact" } as const;
export type ArtefactKind = keyof typeof ARTEFACT_KINDS;

/** What kind of evidence a passage is (PRD section 4.1). */
export const EVIDENCE_KINDS = {
  observation: "Observed fact",
  allegation: "Reported allegation",
  assumption: "Assumption",
  missing: "Missing information",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

/** What a concern needs (PRD section 6.3). */
export const CLASSES = {
  act_now: "Act now",
  correct: "Clarify and correct",
  coach: "Coach",
  process: "Process problem",
  none: "No issue on current evidence",
} as const;
export type Class = keyof typeof CLASSES;

/** A skill gap or a workflow defect (the PRD's central manager judgement). */
export const CAUSES = {
  skill: "Skill or knowledge gap",
  workflow: "Workflow or source defect",
  both: "Both",
  unclear: "Not clear yet: ask the coordinator",
} as const;
export type Cause = keyof typeof CAUSES;

export const LANES = {
  protect: "Protect the person",
  contact: "Who to contact",
  source: "Which source to check",
  record: "What to record",
  avoid: "What not to promise",
  coach: "Coaching and learning",
} as const;
export type Lane = keyof typeof LANES;
export const WHEN = { now: "Now, today", later: "After that" } as const;
export type When = keyof typeof WHEN;

export const PLAN_KINDS = {
  work: "Immediate work action",
  learning: "Approved learning",
  practice: "Supervised practice",
  observation: "Observed work check",
  process: "Process issue",
  review: "Author review request",
} as const;
export type PlanKind = keyof typeof PLAN_KINDS;

export const OUTCOMES = {
  signoff: "Sign off the defined task",
  extend: "Continue supported practice",
  escalate: "Escalate to a reviewer",
  fix_process: "Fix the workflow",
} as const;
export type Outcome = keyof typeof OUTCOMES;

/** Who a manager can involve. The workbench records a referral to their process, never their decision. */
export const REVIEWERS = {
  quality: "Quality/incident owner",
  clinical: "Clinical governance",
  operations: "Care Coordination operations",
  billing: "Support at Home billing/contributions owner",
  hr: "People/HR",
} as const;
export type Reviewer = keyof typeof REVIEWERS;

/** The evidence states a manager can give a second sample's fields: the Contractor Vetting Card's. */
export const MARK_STATES = ["verified", "needs_verification", "material_gap", "needs_owner_review"] as const satisfies readonly FieldState[];
export type MarkState = (typeof MARK_STATES)[number];
export const markLabel = (s: MarkState) => FIELD_STATES[s];

/** The rubric (PRD section 9): each 0 to 3. */
export const DIMS = {
  evidence: "Evidence recognition",
  urgency: "Urgency and first action",
  role: "Role and source accuracy",
  coaching: "Coaching quality",
  learning: "Learning selection",
  followup: "Follow-up judgement",
} as const;
export type Dim = keyof typeof DIMS;
export const DIM_ORDER = Object.keys(DIMS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and well evidenced" };
export const MAX_SCORE = DIM_ORDER.length * 3;

export const CODES = {
  // Critical (PRD section 9): no pass, whatever else went well.
  deferred_incident: "A possible incident deferred to training or to later",
  suppressed_allegation: "An allegation suppressed because the person or family asked",
  universal_rate: "Unverified contribution advice treated as a universal rate",
  missed_correction: "Advice that may have changed the participant’s decision isn’t corrected first",
  changed_real_record: "A real care or billing record changed from the training screen",
  invented_priority: "A SIRS priority or reportability decided from incomplete facts",
  clinical_conclusion: "An unsupported clinical conclusion",
  signoff_out_of_scope: "A sign-off outside a defined task or the manager’s authority",
  // Not critical: they lower a dimension.
  urgency_missed: "An urgent concern classified as something that can wait",
  sequence: "Coaching or learning put before protecting the person",
  misread_cause: "A workflow defect read as the coordinator’s skill gap, or the reverse",
  overcalled: "An accurate passage marked as a problem",
  promise: "A promise that isn’t yours to make",
  blame: "Blame in the feedback",
  humiliation: "Feedback that could humiliate",
  label: "A disciplinary or HR label in a coaching conversation",
  conclusion: "A conclusion about the person, not their action",
  vague: "Feedback too vague to act on",
  no_verification: "No agreed way to check the improvement",
  pushback_risk: "The coordinator’s explanation was dismissed",
  reading_only: "A plan of reading, without practice or an observation",
  duplicate_course: "A course repeated instead of the missing behaviour practised",
  overload: "More than a realistic two weeks alongside a caseload",
  no_process_issue: "A source or workflow problem left for training to fix",
  signoff_without_evidence: "A sign-off on evidence the sample doesn’t show",
} as const;
export type Code = keyof typeof CODES;
const CODE_IDS = Object.keys(CODES) as Code[];
export const CRITICAL = [
  "deferred_incident",
  "suppressed_allegation",
  "universal_rate",
  "missed_correction",
  "changed_real_record",
  "invented_priority",
  "clinical_conclusion",
  "signoff_out_of_scope",
] as const satisfies readonly Code[];
export type CriticalCode = (typeof CRITICAL)[number];
export const isCritical = (c: Code): c is CriticalCode => (CRITICAL as readonly Code[]).includes(c);

/** The correction shown with each critical error: what to do instead, and where it comes from. */
export const CORRECTIONS: Record<(typeof CRITICAL)[number], { text: string; source: string }> = {
  deferred_incident: {
    text: "Protect the person and notify the designated incident responder today, through the current incident management process. Coaching and a learning plan come after the escalation is underway, never instead of it.",
    source: "tc-incident-procedure",
  },
  suppressed_allegation: {
    text: "Record the person’s wishes and pass them on, but don’t wait for their agreement, or a relative’s, before escalating internally. The authorised team decides what happens next.",
    source: "acqsc-incident-management",
  },
  universal_rate: {
    text: "There is no universal contribution rate. Check the service’s category in the current approved rule set and the person’s own Services Australia determination before saying anything about cost.",
    source: "doh-contributions",
  },
  missed_correction: {
    text: "Correct the advice first, through the provider’s correction process: check the current source and the person’s determination, and make sure they can decide again with the right information before a change takes effect. A lesson in two weeks doesn’t correct today’s advice.",
    source: "tc-contribution-correction",
  },
  changed_real_record: {
    text: "Nothing in a training screen changes a real record. Services Australia determines the contribution rate; billing changes go through the approved provider process.",
    source: "tc-contribution-correction",
  },
  invented_priority: {
    text: "Escalate a possible incident promptly and let the authorised provider team assess reportability and priority. A manager doesn’t decide the SIRS outcome from an excerpt.",
    source: "acqsc-sirs-home",
  },
  clinical_conclusion: {
    text: "Record what was seen and said, and involve the clinical reviewer. Don’t add a cause the facts don’t show.",
    source: "tc-incident-procedure",
  },
  signoff_out_of_scope: {
    text: "Sign off only a defined task within the person’s role, on the evidence for that task, with the reviewer the delegation model needs. “Fully compliant” isn’t a task.",
    source: "tc-delegation-matrix",
  },
};

/** What lowers a dimension's ceiling (critical codes take it to 0). */
const CODE_CAPS: Partial<Record<Code, Partial<Record<Dim, Level>>>> = {
  deferred_incident: { urgency: 0 },
  suppressed_allegation: { urgency: 0, evidence: 1 },
  universal_rate: { role: 0, evidence: 1 },
  missed_correction: { urgency: 0 },
  changed_real_record: { role: 0 },
  invented_priority: { role: 0 },
  clinical_conclusion: { role: 0, evidence: 1 },
  signoff_out_of_scope: { followup: 0 },
  urgency_missed: { urgency: 1 },
  sequence: { urgency: 2 },
  misread_cause: { role: 2 },
  overcalled: { evidence: 2 },
  promise: { role: 1 },
  blame: { coaching: 1 },
  humiliation: { coaching: 0 },
  label: { coaching: 0 },
  conclusion: { coaching: 0 },
  vague: { coaching: 1 },
  no_verification: { coaching: 2 },
  pushback_risk: { coaching: 1, role: 1 },
  reading_only: { learning: 1 },
  duplicate_course: { learning: 1 },
  overload: { learning: 2 },
  no_process_issue: { learning: 2 },
  signoff_without_evidence: { followup: 1 },
};

// ---------------------------------------------------------------------------------------------
// The scenario model (PRD sections 12 and 15)
// ---------------------------------------------------------------------------------------------

export type Line = { id: string; speaker: string; text: string };
export type Artefact = { id: string; kind: ArtefactKind; title: string; meta: string; lines: Line[] };
/**
  Something in the sample that matters. `keys` are line ids, or `omit:<lineId>` for something missing after that
  line. `classes` and `causes` are every defensible reading; `misclassCode` is raised when it's found but called "no
  issue"; `urgent` findings must be classified "act now".
*/
export type Finding = {
  id: string;
  label: string;
  keys: string[];
  kinds: EvidenceKind[];
  classes: Class[];
  causes: Cause[];
  urgent: boolean;
  misclassCode: Code | "";
  why: string;
  source: string;
};
export type ActionOption = {
  id: string;
  label: string;
  lane: Lane;
  when: When | "either";
  verdict: "essential" | "good" | "okay" | "unsafe";
  code: Code | "";
  feedback: string;
  source: string;
};
export type PushbackOption = { id: string; label: string; verdict: "good" | "okay" | "risk"; code: Code | ""; feedback: string };
export type Coaching = {
  /** Words that name this sample's observable action ("same contribution", "family concern"). */
  notice: string[];
  replies: { defensive: string; unsure: string; explains: string; agrees: string; generic: string };
  pushback: { prompt: string; options: PushbackOption[] };
  model: string;
  alternatives: string[];
};
export type ContentRef = { type: "topic" | "magazine" | "aid"; id: string };
export type Suggestion = {
  id: string;
  kind: PlanKind;
  label: string;
  /** Which behaviour it practises, or why it's there. */
  why: string;
  ref: ContentRef | null;
  minutes: number;
  /** Day of the two weeks it's due (0 = today). */
  due: number;
  owner: string;
  fit: "good" | "okay" | "risk";
  code: Code | "";
  required: boolean;
  feedback: string;
};
export type EvidenceField = { id: string; label: string; lines: string[]; state: MarkState; why: string };
export type Scope = { id: string; label: string; needs: string[]; reviewer: Reviewer | ""; outOfScope: boolean; why: string };
export type Followup = {
  day: number;
  artefact: Artefact;
  fields: EvidenceField[];
  scopes: Scope[];
  outcomes: Partial<Record<Outcome, { verdict: "good" | "okay" | "risk"; feedback: string }>>;
};
export type Scenario = {
  id: string;
  title: string;
  day: number;
  date: string;
  stage: Stage;
  summary: string;
  brief: { handling: string; see: string; unknown: string };
  known: string[];
  missing: string[];
  /** Effective-dated category claims, checked against lib/sahRules. Null when the case makes none. */
  rules: { ruleSet: string; effective: string; claims: { service: ServiceId; category: Category }[] } | null;
  artefacts: Artefact[];
  findings: Finding[];
  actions: ActionOption[];
  /** Raised when an essential "now" action is missing. */
  essentialMiss: CriticalCode;
  coach: Coaching;
  suggestions: Suggestion[];
  maxMinutes: number;
  processIssue: boolean;
  followup: Followup;
  sources: string[];
};
export type Approval = {
  owner: string;
  operations: string;
  quality: string;
  clinical: string;
  policy: string;
  partnerships: string;
  people: string;
  privacy: string;
  approvedOn: string;
  reviewBy: string;
  scenarioReviewed: string;
};
export const APPROVAL_ROLES: Record<Exclude<keyof Approval, "approvedOn" | "reviewBy" | "scenarioReviewed">, string> = {
  owner: "Owner (Partner Enablement)",
  operations: "Care Coordination operations",
  quality: "Quality/incident management",
  clinical: "Clinical governance",
  policy: "Support at Home policy/contributions owner",
  partnerships: "Partnerships",
  people: "People/HR",
  privacy: "Privacy/security",
};
export const emptyApproval = (): Approval => ({
  owner: "",
  operations: "",
  quality: "",
  clinical: "",
  policy: "",
  partnerships: "",
  people: "",
  privacy: "",
  approvedOn: "",
  reviewBy: "",
  scenarioReviewed: "",
});

export type ShadowData = {
  title: string;
  intro: string;
  scenarioVersion: string;
  mode: "formative" | "assessed";
  passMark: number;
  /** The manager the learner steps in for: a library character (Maya). */
  manager: { name: string; role: string; situation: string };
  /** The recurring coordinator: an unnamed role, never a library character or a real person. */
  coordinator: { label: string; role: string; started: string; about: string };
  /** The recurring participant: a library character (Mrs Lin). */
  participant: { name: string; about: string };
  scenarios: Scenario[];
  jobAid: { snippetId: string; why: string };
  /** The AI Learning Designer's selection rationale, visible to authors (PRD section 12). */
  rationale: {
    signal: string;
    behaviour: string;
    barrier: string;
    why: string;
    alternatives: string;
    decision: "" | "accepted" | "edited" | "rejected";
    measure: string;
  };
  approval: Approval;
};

// ---------------------------------------------------------------------------------------------
// Coaching words: the Tough Family Call's interpreter, with Notice → Ask → Agree → Verify intents
// ---------------------------------------------------------------------------------------------

export const COACH_MOVES = { notice: "Notice", ask: "Ask", agree: "Agree", verify: "Verify" } as const;
export type CoachMove = keyof typeof COACH_MOVES;
const MOVE_HINTS: Record<CoachMove, string> = {
  notice: "Quote an observable action: “In the call I heard you say…”.",
  ask: "Ask for her reasoning: “What did you have to go on, and where did you check it?”",
  agree: "Agree the better action together: “Let’s correct it through the right process and practise the explanation.”",
  verify: "Say how and when you’ll see the change: “I’ll sit in on your next suitable call.”",
};
const COACH_RISKS = ["blame", "humiliation", "label", "conclusion", "vague"] as const satisfies readonly Code[];
type CoachRisk = (typeof COACH_RISKS)[number];
const RISK_FEEDBACK: Record<CoachRisk, string> = {
  blame:
    "This puts the fault on her before you know what she had to go on. Name the action you saw, then ask what she was working from: a confusing source or time pressure changes what needs fixing.",
  humiliation:
    "Words like this make a new coordinator hide the next mistake. Keep to the action and its effect on the participant, in private, and leave her dignity intact.",
  label:
    "A coaching conversation isn’t a disciplinary process, and a simulation score is never an HR record. If something needs HR, that goes through the business’s HR process separately.",
  conclusion: "That’s a conclusion about her as a person, which the sample can’t show. Describe the action and its effect instead.",
  vague: "She can’t act on this. Quote what you saw in the sample, and agree one specific thing to do differently and how you’ll check it.",
};

const intent = (id: string, kind: Intent["kind"], patterns: string[]): Intent => ({
  id,
  kind,
  label: id,
  patterns,
  evidence: kind === "ask" ? "" : id,
  reply: "",
  softer: "",
  reveals: "",
  sets: [],
  shift: 0,
  ignoreFloor: false,
});

/** The reviewed phrases (rubric `shadow-rubric-1`). A model is never asked; when the words alone can't settle it, a reviewer does. */
export const COACH_PHRASES: Record<CoachMove | CoachRisk, string[]> = {
  notice: [
    "i heard",
    "i noticed",
    "i saw",
    "i read",
    "in the call",
    "on the call",
    "in your note",
    "in the note",
    "you said",
    "you told",
    "you wrote",
    "you recorded",
    "you marked",
    "you gave",
    "when you",
  ],
  ask: [
    "what information",
    "where did you",
    "what did you",
    "how did you",
    "talk me through",
    "walk me through",
    "what made you",
    "what was going on",
    "what was happening",
    "help me understand",
    "what were you working from",
    "what source",
    "what would help",
    "how do you see",
    "what do you think",
  ],
  agree: [
    "let s",
    "let us",
    "we ll",
    "we will",
    "agree",
    "together",
    "next time",
    "practise",
    "practice",
    "going forward",
    "from now on",
    "can we",
    "shall we",
  ],
  verify: [
    "i ll observe",
    "i will observe",
    "i ll sit in",
    "i will sit in",
    "i ll listen",
    "i will listen",
    "i ll check",
    "i will check",
    "i ll review",
    "i will review",
    "next suitable",
    "next call",
    "next note",
    "check in",
    "catch up",
    "by friday",
    "next week",
    "in two weeks",
    "follow up",
  ],
  blame: ["your fault", "should have known", "you should have", "careless", "sloppy", "how could you", "you failed", "your mistake", "you got it wrong"],
  humiliation: ["stupid", "embarrassing", "embarrassment", "useless", "hopeless", "incompetent", "ridiculous", "pathetic", "idiot", "a joke", "basic stuff"],
  label: [
    "performance issue",
    "performance management",
    "formal warning",
    "written warning",
    "final warning",
    "disciplinary",
    "on notice",
    "probation",
    "hr file",
  ],
  conclusion: ["you don t care", "you clearly don t", "lazy", "not cut out", "you never", "you always", "not suited", "can t be trusted"],
  vague: [
    "do better",
    "be more careful",
    "lift your game",
    "needs to improve",
    "need to improve",
    "try harder",
    "pay more attention",
    "not good enough",
    "step up",
  ],
};

function coachIntents(extraNotice: string[]): Intent[] {
  return [
    // Risks are read first by the interpreter, so "you should have checked" isn't also read as agreement.
    ...COACH_RISKS.map((r) => intent(r, "risk", COACH_PHRASES[r])),
    intent("notice", "move", [...COACH_PHRASES.notice, ...extraNotice]),
    intent("ask", "ask", COACH_PHRASES.ask),
    intent("agree", "move", COACH_PHRASES.agree),
    intent("verify", "move", COACH_PHRASES.verify),
  ];
}

export type CoachReading = {
  moves: { move: CoachMove; quote: string }[];
  risks: { code: CoachRisk; quote: string; hedged: boolean }[];
};

/**
  One coaching message, read by the Tough Family Call's interpreter with this rubric's intents. A risky phrase softened
  just before it ("I’m not saying you were careless") isn't scored: it's marked for a reviewer.
*/
export function readCoaching(sc: Pick<Scenario, "coach">, text: string): CoachReading {
  const shape = { phone: { restricted: [] as string[] }, family: { intents: coachIntents(sc.coach.notice), disclosureRisk: "" } };
  const r = interpret(shape as unknown as Pick<FamilyBlock, "phone" | "family">, text);
  const moves: CoachReading["moves"] = [];
  for (const m of ["notice", "agree", "verify"] as const) {
    const t = r.moves.find((x) => x.id === m);
    if (t) moves.push({ move: m, quote: t.quote });
  }
  if (r.intents.includes("ask")) {
    const q = text.split(/(?<=[.!?])\s+|\n+/).find((x) => x.includes("?")) ?? text;
    moves.push({ move: "ask", quote: q.trim().slice(0, 200) });
  }
  const risks = r.risks
    .filter((x): x is typeof x & { id: CoachRisk } => (COACH_RISKS as readonly string[]).includes(x.id))
    .map((x) => ({ code: x.id, quote: x.quote, hedged: x.hedged }));
  return { moves, risks };
}

// ---------------------------------------------------------------------------------------------
// The learner's state: changed only by moves, replayed the same everywhere
// ---------------------------------------------------------------------------------------------

export type Mark = { kind: EvidenceKind; cls: Class; cause: Cause | ""; why: string };
export type Turn = { text: string; moves: CoachMove[]; risks: CoachRisk[]; hedged: CoachRisk[]; reply: keyof Coaching["replies"] };
export type PlanItem = { id: string; due: number };
export type Availability = { status: "current" | "missing" | "unapproved" | "withdrawn" | "preview"; title: string; version: string; href: string };
export type AvailMap = Record<string, Availability>;
export type Decision = { outcome: Outcome; scope: string; reviewer: Reviewer | "" };

export type ShadowState = {
  scenario: string;
  viewed: string[];
  marks: Record<string, Mark>;
  inspected: boolean;
  actions: { now: string[]; later: string[] } | null;
  firstActions: { now: string[]; later: string[] } | null;
  actionTries: number;
  actionsOk: boolean;
  actionCodes: Code[];
  turns: Turn[];
  pushback: string;
  involved: Reviewer[];
  coached: boolean;
  plan: PlanItem[];
  /** What the plan's content resolved to when it was shared (frozen, for the debrief). */
  assigned: (PlanItem & Availability)[] | null;
  followViewed: boolean;
  followMarks: Record<string, MarkState>;
  decision: Decision | null;
};

export const emptyState = (scenario: string): ShadowState => ({
  scenario,
  viewed: [],
  marks: {},
  inspected: false,
  actions: null,
  firstActions: null,
  actionTries: 0,
  actionsOk: false,
  actionCodes: [],
  turns: [],
  pushback: "",
  involved: [],
  coached: false,
  plan: [],
  assigned: null,
  followViewed: false,
  followMarks: {},
  decision: null,
});

export type Move =
  | { do: "view"; artefact: string }
  | { do: "mark"; key: string; kind: EvidenceKind; cls: Class; cause: Cause | ""; why: string }
  | { do: "unmark"; key: string }
  | { do: "inspected" }
  | { do: "act"; now: string[]; later: string[] }
  | { do: "coach"; text: string }
  | { do: "pushback"; option: string }
  | { do: "involve"; reviewer: Reviewer }
  | { do: "coached" }
  | { do: "plan"; items: PlanItem[] }
  | { do: "assign" }
  | { do: "followView" }
  | { do: "evidence"; field: string; state: MarkState }
  | { do: "decide"; outcome: Outcome; scope: string; reviewer: Reviewer | "" };
export class MoveError extends Error {}

export const MAX_TURNS = 3;
export const MAX_COACH_CHARS = 600;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const KEY = /^(omit:)?[a-z0-9][a-z0-9-]{0,47}$/;
const ids = (v: unknown, max = 20) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, max);
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null => (all.includes(v as T) ? (v as T) : null);
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A move from the network, checked for shape only: the engine decides whether it's allowed now. */
export function parseMove(raw: unknown): Move | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (o.do) {
    case "view":
      return typeof o.artefact === "string" && ID.test(o.artefact) ? { do: "view", artefact: o.artefact } : null;
    case "mark": {
      const kind = oneOf(o.kind, Object.keys(EVIDENCE_KINDS) as EvidenceKind[]);
      const cls = oneOf(o.cls, Object.keys(CLASSES) as Class[]);
      const cause = o.cause === "" ? "" : oneOf(o.cause, Object.keys(CAUSES) as Cause[]);
      if (typeof o.key !== "string" || !KEY.test(o.key) || !kind || !cls || cause === null) return null;
      return { do: "mark", key: o.key, kind, cls, cause, why: clip(o.why, 200) };
    }
    case "unmark":
      return typeof o.key === "string" && KEY.test(o.key) ? { do: "unmark", key: o.key } : null;
    case "act":
      return { do: "act", now: ids(o.now), later: ids(o.later) };
    case "coach":
      return typeof o.text === "string" ? { do: "coach", text: o.text.slice(0, MAX_COACH_CHARS) } : null;
    case "pushback":
      return typeof o.option === "string" && ID.test(o.option) ? { do: "pushback", option: o.option } : null;
    case "involve": {
      const r = oneOf(o.reviewer, Object.keys(REVIEWERS) as Reviewer[]);
      return r ? { do: "involve", reviewer: r } : null;
    }
    case "plan":
      return {
        do: "plan",
        items: (Array.isArray(o.items) ? o.items : [])
          .slice(0, 12)
          .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
          .filter((x) => typeof x.id === "string" && ID.test(x.id))
          .map((x) => ({ id: x.id as string, due: Number.isInteger(x.due) ? Math.max(0, Math.min(21, x.due as number)) : -1 })),
      };
    case "evidence": {
      const st = oneOf(o.state, MARK_STATES);
      return typeof o.field === "string" && ID.test(o.field) && st ? { do: "evidence", field: o.field, state: st } : null;
    }
    case "decide": {
      const outcome = oneOf(o.outcome, Object.keys(OUTCOMES) as Outcome[]);
      const reviewer = o.reviewer === "" || o.reviewer === undefined ? "" : oneOf(o.reviewer, Object.keys(REVIEWERS) as Reviewer[]);
      if (!outcome || reviewer === null || typeof o.scope !== "string" || (o.scope !== "" && !ID.test(o.scope))) return null;
      return { do: "decide", outcome, scope: o.scope, reviewer };
    }
    case "inspected":
    case "coached":
    case "assign":
    case "followView":
      return { do: o.do };
  }
  return null;
}

export const PHASES = {
  inspect: "Inspect and classify",
  act: "First actions",
  coach: "Coach",
  plan: "Two-week plan",
  followup: "Second sample",
  decide: "Readiness decision",
  submit: "Debrief",
} as const;
export type Phase = keyof typeof PHASES;
export const PHASE_ORDER = Object.keys(PHASES) as Phase[];

export const scenarioOf = (d: Pick<ShadowData, "scenarios">, id: string) => d.scenarios.find((s) => s.id === id);
const lineIds = (sc: Scenario) => new Set(sc.artefacts.flatMap((a) => a.lines.map((l) => l.id)));

export function phaseOf(s: ShadowState): Phase {
  if (!s.inspected) return "inspect";
  if (!s.actionsOk) return "act";
  if (!s.coached) return "coach";
  if (!s.assigned) return "plan";
  if (!s.decision) return s.followViewed && s.followMarks && Object.keys(s.followMarks).length ? "decide" : "followup";
  return "submit";
}
const after = (s: ShadowState, p: Phase) => PHASE_ORDER.indexOf(phaseOf(s)) > PHASE_ORDER.indexOf(p);

/** First actions, checked: the codes they raise and the essential "now" actions missing. */
export function checkActions(sc: Scenario, chosen: { now: string[]; later: string[] }) {
  const codes = new Set<Code>();
  const opt = (id: string) => sc.actions.find((a) => a.id === id);
  for (const id of [...chosen.now, ...chosen.later]) {
    const a = opt(id);
    if (a?.code) codes.add(a.code);
  }
  const missing = sc.actions.filter((a) => a.verdict === "essential" && a.when === "now" && !chosen.now.includes(a.id)).map((a) => a.id);
  if (missing.length) codes.add(sc.essentialMiss);
  // Coaching or learning first, while the person still needs protecting: the order, not only the choice.
  if (chosen.now.some((id) => opt(id)?.when === "later" && opt(id)?.lane === "coach")) codes.add("sequence");
  const list = [...codes];
  return { codes: list, missing, ok: !list.some(isCritical) && chosen.now.length > 0 };
}

/** The coordinator's next line: authored, chosen by what the manager has said so far (never generated). */
function replyFor(prev: Turn[], t: Omit<Turn, "reply">): Turn["reply"] {
  if (t.risks.some((r) => r !== "vague")) return "defensive";
  const all = [...prev.flatMap((x) => x.moves), ...t.moves];
  if (!all.includes("ask")) return t.risks.includes("vague") || !t.moves.length ? "unsure" : "generic";
  if (!prev.some((x) => x.reply === "explains")) return "explains";
  return all.includes("agree") && all.includes("verify") ? "agrees" : "generic";
}
/** Her explanation (and the source problem in it) comes once she's asked, or after two turns anyway. */
export const pushbackOpen = (s: ShadowState) => s.turns.some((t) => t.reply === "explains") || s.turns.length >= 2;

/** Plan problems that stop it being shared: what a two-week plan has to hold (PRD section 10). */
/** Whether a suggestion's content can be assigned: no content needed, or current approved content (or the editor's preview). */
export const usable = (x: Pick<Suggestion, "id" | "ref">, avail: AvailMap) => !x.ref || ["current", "preview"].includes(avail[x.id]?.status ?? "");
/** A chosen suggestion whose content isn't current and approved: it becomes a request for an author's review. */
export const isReviewRequest = (x: Pick<Suggestion, "id" | "ref" | "kind">, avail: AvailMap) => x.kind === "review" || !usable(x, avail);

export function planProblems(sc: Scenario, items: PlanItem[], avail: AvailMap): string[] {
  const out: string[] = [];
  const sug = items.map((i) => sc.suggestions.find((x) => x.id === i.id)).filter((x): x is Suggestion => Boolean(x));
  if (sug.length !== items.length) out.push("A plan can only hold the suggestions on this list.");
  const ok = (x: Suggestion) => usable(x, avail);
  for (const x of sc.suggestions.filter((y) => y.required && y.kind === "work"))
    if (!sug.includes(x)) out.push(`Keep the immediate work action: “${x.label}”. It’s work, not a learning completion.`);
  // Content that isn't current and approved is never assigned: it stays in the plan as an author review request, and
  // doesn't count as learning or practice (PRD criterion 7).
  const learning = sug.filter((x) => x.kind === "learning" && ok(x));
  if (!learning.length) out.push("Add one or two approved learning pieces that address the behaviour.");
  if (learning.length > 2) out.push("Keep it to one or two learning pieces: a short plan gets done.");
  if (!sug.some((x) => x.kind === "practice" && ok(x))) out.push("Add one supervised practice, so she applies it to a new example.");
  if (!sug.some((x) => x.kind === "observation")) out.push("Add one observed work check: completion alone isn’t evidence.");
  for (const i of items) {
    const x = sc.suggestions.find((y) => y.id === i.id);
    if (x?.kind === "work" && i.due !== 0) out.push(`“${x.label}” is due today: it has its own urgent due point.`);
  }
  return [...new Set(out)];
}

/** The sign-off rule: a defined task, on evidence the manager has marked verified, with the reviewer the scope needs. */
export function decisionProblems(sc: Scenario, s: ShadowState, d: Decision): string[] {
  const out: string[] = [];
  const f = sc.followup;
  if (!s.followViewed || f.fields.some((x) => !s.followMarks[x.id])) out.push("Review the second sample first: mark every piece of evidence before deciding.");
  const scope = f.scopes.find((x) => x.id === d.scope);
  if (d.outcome === "signoff") {
    if (!scope) out.push("Choose the defined task you’re signing off.");
    else {
      const open = scope.needs.filter((n) => s.followMarks[n] !== "verified");
      if (open.length)
        out.push(
          `You can’t sign this off: you haven’t marked ${open.map((n) => `“${f.fields.find((x) => x.id === n)?.label ?? n}”`).join(", ")} as verified in the second sample.`,
        );
      if (scope.reviewer && d.reviewer !== scope.reviewer) out.push(`This sign-off needs the ${REVIEWERS[scope.reviewer]} under the delegation model.`);
    }
  }
  if (d.outcome === "escalate" && !d.reviewer) out.push("Say which reviewer you’re referring it to.");
  return out;
}

export type Ctx = { avail?: AvailMap };

/** One move, applied. A move out of turn is refused with the reason; a repeated move changes nothing. */
export function applyMove(d: ShadowData, s: ShadowState, m: Move, ctx: Ctx = {}): ShadowState {
  const sc = scenarioOf(d, s.scenario);
  if (!sc) throw new MoveError("That scenario isn’t in this block.");
  const ph = phaseOf(s);
  const n = structuredClone(s);
  const need = (p: Phase, msg: string) => {
    if (ph !== p) throw new MoveError(msg);
  };
  switch (m.do) {
    case "view":
      if (!sc.artefacts.some((a) => a.id === m.artefact)) throw new MoveError("That isn’t one of this sample’s artefacts.");
      if (!n.viewed.includes(m.artefact)) n.viewed.push(m.artefact);
      return n;
    case "mark": {
      need("inspect", "Your marks are settled: you’ve moved on from inspecting.");
      const lid = m.key.replace(/^omit:/, "");
      if (!lineIds(sc).has(lid)) throw new MoveError("That line isn’t in this sample.");
      if (Object.keys(n.marks).length >= 15 && !n.marks[m.key]) throw new MoveError("Fifteen marks is plenty: remove one before adding another.");
      n.marks[m.key] = { kind: m.kind, cls: m.cls, cause: m.cls === "none" ? "" : m.cause || "unclear", why: m.why };
      return n;
    }
    case "unmark":
      need("inspect", "Your marks are settled: you’ve moved on from inspecting.");
      delete n.marks[m.key];
      return n;
    case "inspected":
      need("inspect", "You’ve already moved on from inspecting.");
      if (!sc.artefacts.every((a) => n.viewed.includes(a.id))) throw new MoveError("Read every artefact in the sample before you move on.");
      if (!Object.keys(n.marks).length) throw new MoveError("Mark at least one passage, or an omission, and say what it needs.");
      n.inspected = true;
      return n;
    case "act": {
      need("act", after(s, "act") ? "Your first actions are settled." : "Inspect the sample first.");
      const known = new Set(sc.actions.map((a) => a.id));
      const now = m.now.filter((x) => known.has(x));
      const later = m.later.filter((x) => known.has(x) && !now.includes(x));
      if (!now.length) throw new MoveError("Choose at least one thing that can’t wait.");
      const c = checkActions(sc, { now, later });
      n.actions = { now, later };
      if (!n.firstActions) n.firstActions = { now, later };
      n.actionTries += 1;
      n.actionCodes = [...new Set([...n.actionCodes, ...c.codes])];
      n.actionsOk = c.ok;
      return n;
    }
    case "coach": {
      need("coach", after(s, "coach") ? "The coaching conversation has finished." : "Protect the person first: settle your first actions.");
      const text = m.text.replace(/\s+/g, " ").trim();
      if (text.split(" ").filter(Boolean).length < 4) throw new MoveError("Say a little more: at least a sentence.");
      if (n.turns.length >= MAX_TURNS) throw new MoveError(`That’s ${MAX_TURNS} turns: answer her explanation, then finish the conversation.`);
      if (identifierWarnings(text).length)
        throw new MoveError("Leave out anything that looks like a real email, phone number or ID: this is a fictional case.");
      const r = readCoaching(sc, text);
      const t = {
        text,
        moves: [...new Set(r.moves.map((x) => x.move))],
        risks: [...new Set(r.risks.filter((x) => !x.hedged).map((x) => x.code))],
        hedged: [...new Set(r.risks.filter((x) => x.hedged).map((x) => x.code))],
      };
      n.turns.push({ ...t, reply: replyFor(n.turns, t) });
      return n;
    }
    case "pushback":
      need("coach", "The coaching conversation has finished.");
      if (!pushbackOpen(n)) throw new MoveError("She hasn’t explained her side yet.");
      if (!sc.coach.pushback.options.some((o) => o.id === m.option)) throw new MoveError("That isn’t one of the responses.");
      n.pushback = m.option;
      return n;
    case "involve":
      if (ph !== "coach" && ph !== "decide" && ph !== "followup") throw new MoveError("You can involve a reviewer while coaching or deciding.");
      if (!n.involved.includes(m.reviewer)) n.involved.push(m.reviewer);
      return n;
    case "coached":
      need("coach", "The coaching conversation has finished.");
      if (!n.turns.length) throw new MoveError("Open the conversation first.");
      if (!n.pushback) throw new MoveError("Respond to her explanation before you finish.");
      n.coached = true;
      return n;
    case "plan": {
      need("plan", after(s, "plan") ? "The plan has been shared." : "Finish the coaching conversation first.");
      const items: PlanItem[] = [];
      for (const i of m.items) {
        const x = sc.suggestions.find((y) => y.id === i.id);
        if (!x || items.some((y) => y.id === i.id)) continue;
        items.push({ id: i.id, due: x.kind === "work" ? 0 : i.due >= 0 ? i.due : x.due });
      }
      n.plan = items;
      return n;
    }
    case "assign": {
      need("plan", after(s, "plan") ? "The plan has been shared." : "Finish the coaching conversation first.");
      const avail = ctx.avail ?? {};
      const p = planProblems(sc, n.plan, avail);
      if (p.length) throw new MoveError(p[0]);
      const none: Availability = { status: "missing", title: "", version: "", href: "" };
      n.assigned = n.plan.map((i) => {
        const x = sc.suggestions.find((y) => y.id === i.id);
        return { ...i, ...(x?.ref ? (avail[i.id] ?? none) : { ...none, status: "current" as const }) };
      });
      return n;
    }
    case "followView":
      need("followup", after(s, "followup") ? "You’ve already decided." : "Share the plan first.");
      n.followViewed = true;
      return n;
    case "evidence":
      if (ph !== "followup" && ph !== "decide") throw new MoveError(after(s, "decide") ? "You’ve already decided." : "Share the plan first.");
      if (!n.followViewed) throw new MoveError("Open the second sample first.");
      if (!sc.followup.fields.some((f) => f.id === m.field)) throw new MoveError("That isn’t one of the second sample’s checks.");
      n.followMarks[m.field] = m.state;
      return n;
    case "decide": {
      if (ph !== "decide") throw new MoveError(after(s, "decide") ? "You’ve already decided." : "Review the second sample first: readiness needs it.");
      const dec: Decision = { outcome: m.outcome, scope: m.scope, reviewer: m.reviewer };
      const p = decisionProblems(sc, n, dec);
      if (p.length) throw new MoveError(p[0]);
      n.decision = dec;
      if (dec.reviewer && !n.involved.includes(dec.reviewer)) n.involved.push(dec.reviewer);
      return n;
    }
  }
}

export function submitProblems(d: ShadowData, s: ShadowState): string[] {
  if (!scenarioOf(d, s.scenario)) return ["That scenario isn’t in this block."];
  return phaseOf(s) === "submit" ? [] : [`Finish the steps first: you’re at “${PHASES[phaseOf(s)]}”.`];
}

// ---------------------------------------------------------------------------------------------
// The debrief: deterministic, evidence-based, kept as given
// ---------------------------------------------------------------------------------------------

export type Debrief = {
  scenario: string;
  ending: "critical" | Outcome;
  endingLabel: string;
  defensible: boolean;
  critical: { code: Code; label: string; text: string; source: string }[];
  codes: Code[];
  score: number;
  max: number;
  passed: boolean | null;
  review: boolean;
  dims: { dim: Dim; label: string; level: Level; levelLabel: string; did: string[]; todo: string[] }[];
  findings: {
    id: string;
    label: string;
    found: boolean;
    kind: string;
    kindRight: boolean;
    cls: string;
    classRight: boolean;
    cause: string;
    causeRight: boolean;
    why: string;
  }[];
  overcalled: string[];
  actions: { id: string; label: string; chosen: "" | When; firstTry: "" | When; verdict: ActionOption["verdict"]; feedback: string }[];
  actionTries: number;
  coaching: {
    turns: { text: string; moves: string[]; risks: { label: string; feedback: string }[]; review: string[]; reply: string }[];
    missingMoves: { move: string; hint: string }[];
    pushback: { label: string; verdict: string; feedback: string } | null;
    involved: string[];
    model: string;
    alternatives: string[];
  };
  plan: { id: string; label: string; kind: string; due: number; status: string; title: string; version: string; why: string; feedback: string }[];
  reviewRequests: string[];
  followup: {
    fields: { id: string; label: string; yours: string; key: string; right: boolean; why: string }[];
    outcome: string;
    scope: string;
    reviewer: string;
    feedback: string;
  };
  sources: ShadowSource[];
  versions: { shadow: string; rubric: string; engine: string; scenario: string; rules: string };
};

const markFor = (s: ShadowState, f: Finding) => {
  const k = f.keys.find((x) => s.marks[x]);
  return k ? s.marks[k] : undefined;
};

export function buildDebrief(d: ShadowData, s: ShadowState): Debrief {
  const sc = scenarioOf(d, s.scenario);
  if (!sc) throw new MoveError("That scenario isn’t in this block.");
  const codes = new Set<Code>(s.actionCodes);
  const did: Record<Dim, string[]> = { evidence: [], urgency: [], role: [], coaching: [], learning: [], followup: [] };
  const todo: Record<Dim, string[]> = { evidence: [], urgency: [], role: [], coaching: [], learning: [], followup: [] };

  // Evidence recognition, classification and cause
  const findings = sc.findings.map((f) => {
    const m = markFor(s, f);
    const kindRight = Boolean(m && f.kinds.includes(m.kind));
    const classRight = Boolean(m && f.classes.includes(m.cls));
    const causeRight = Boolean(m && (m.cls === "none" || !f.causes.length || (m.cause && f.causes.includes(m.cause))));
    if (m && m.cls === "none" && f.misclassCode) codes.add(f.misclassCode);
    if (m && f.urgent && m.cls !== "act_now") codes.add("urgency_missed");
    if (m && !causeRight && f.causes.length && m.cause !== "unclear") codes.add("misread_cause");
    if (!m && f.urgent && f.misclassCode) codes.add(f.misclassCode);
    return {
      id: f.id,
      label: f.label,
      found: Boolean(m),
      kind: m ? EVIDENCE_KINDS[m.kind] : "",
      kindRight,
      cls: m ? CLASSES[m.cls] : "",
      classRight,
      cause: m?.cause ? CAUSES[m.cause] : "",
      causeRight,
      why: f.why,
    };
  });
  const findingKeys = new Set(sc.findings.flatMap((f) => f.keys));
  const overcalled = Object.entries(s.marks)
    .filter(([k, m]) => !findingKeys.has(k) && m.cls !== "none" && m.cls !== "coach")
    .map(([k]) => k);
  if (overcalled.length) codes.add("overcalled");
  const found = findings.filter((x) => x.found).length;
  const total = findings.length;
  const rightCls = findings.filter((x) => x.found && x.classRight && x.kindRight).length;
  let evidence: Level =
    found === total && rightCls >= Math.ceil(found * 0.75) ? 3 : found >= Math.ceil(total * 0.75) ? 2 : found >= Math.ceil(total * 0.4) ? 1 : 0;
  if (sc.findings.some((f) => f.urgent && !markFor(s, f))) evidence = Math.min(evidence, 1) as Level;
  for (const f of findings) (f.found ? did : todo).evidence.push(f.found ? `Marked: ${f.label}` : `Not marked: ${f.label}`);

  // Urgency and first action
  const first = s.firstActions ?? { now: [], later: [] };
  const firstCheck = checkActions(sc, first);
  let urgency: Level = 3;
  if (firstCheck.codes.some(isCritical)) urgency = 0;
  else {
    const goodNowMissing = sc.actions.filter((a) => a.verdict === "good" && a.when === "now" && !s.actions?.now.includes(a.id));
    if (goodNowMissing.length) {
      urgency = 2;
      todo.urgency.push(...goodNowMissing.map((a) => `Also now: ${a.label}`));
    }
    if (s.actionTries > 1) urgency = Math.min(urgency, 2) as Level;
  }
  if (firstCheck.missing.length)
    todo.urgency.push(...firstCheck.missing.map((id) => `Missing on your first try: ${sc.actions.find((a) => a.id === id)?.label ?? id}`));
  for (const id of s.actions?.now ?? []) {
    const a = sc.actions.find((x) => x.id === id);
    if (a?.verdict === "essential") did.urgency.push(`Now: ${a.label}`);
  }

  // Role and source accuracy
  let role: Level = 3;
  if (codes.has("misread_cause")) todo.role.push("Tell the coordinator’s skill gap apart from a source or workflow defect: the fix differs.");
  const push = sc.coach.pushback.options.find((o) => o.id === s.pushback);
  if (push?.verdict === "okay") role = 2;
  if (push?.code) codes.add(push.code);
  if (push?.verdict === "risk" && !push.code) codes.add("pushback_risk");
  const sourceChosen = sc.actions.filter((a) => a.lane === "source" && s.actions?.now.includes(a.id));
  if (sourceChosen.length) did.role.push(...sourceChosen.map((a) => `Checked the source: ${a.label}`));
  else {
    role = Math.min(role, 2) as Level;
    todo.role.push("Check the current approved source before deciding what was wrong.");
  }

  // Coaching quality
  const moves = new Set(s.turns.flatMap((t) => t.moves));
  const coachRisks = new Set(s.turns.flatMap((t) => t.risks));
  for (const r of coachRisks) codes.add(r);
  if (!moves.has("notice") && s.turns.length) codes.add("vague");
  if (!moves.has("verify") && s.turns.length) codes.add("no_verification");
  const coaching = Math.max(0, moves.size - 1) as Level;
  for (const m of Object.keys(COACH_MOVES) as CoachMove[])
    (moves.has(m) ? did : todo).coaching.push(moves.has(m) ? `${COACH_MOVES[m]}: shown` : `${COACH_MOVES[m]}: ${MOVE_HINTS[m]}`);
  if (push) (push.verdict === "good" ? did : todo).coaching.push(`Her explanation: ${push.feedback}`);
  if (s.involved.length) did.role.push(`Involved: ${s.involved.map((r) => REVIEWERS[r]).join(", ")}`);

  // Learning selection
  const assigned = s.assigned ?? [];
  const chosenSug = assigned.map((i) => sc.suggestions.find((x) => x.id === i.id)).filter((x): x is Suggestion => Boolean(x));
  let learning: Level = 3;
  for (const x of chosenSug.filter((y) => y.fit === "risk")) {
    learning = Math.max(0, learning - 1) as Level;
    if (x.code) codes.add(x.code);
    todo.learning.push(x.feedback || `Reconsider: ${x.label}`);
  }
  const minutes = chosenSug.reduce((t, x) => t + x.minutes, 0);
  if (minutes > sc.maxMinutes) codes.add("overload");
  if (sc.processIssue && !chosenSug.some((x) => x.kind === "process")) codes.add("no_process_issue");
  const frozenAvail: AvailMap = Object.fromEntries(assigned.map((i) => [i.id, i]));
  for (const x of chosenSug.filter((y) => y.fit === "good" && !isReviewRequest(y, frozenAvail))) did.learning.push(`${PLAN_KINDS[x.kind]}: ${x.label}`);
  const reviewRequests = chosenSug.filter((x) => isReviewRequest(x, frozenAvail)).map((x) => x.label);

  // Follow-up judgement
  const f = sc.followup;
  const fields = f.fields.map((x) => {
    const yours = s.followMarks[x.id];
    return { id: x.id, label: x.label, yours: yours ? markLabel(yours) : "Not marked", key: markLabel(x.state), right: yours === x.state, why: x.why };
  });
  const right = fields.filter((x) => x.right).length;
  let followup: Level = right === fields.length ? 3 : right >= Math.ceil(fields.length * 0.75) ? 2 : right >= Math.ceil(fields.length * 0.5) ? 1 : 0;
  const dec = s.decision;
  const scope = dec ? f.scopes.find((x) => x.id === dec.scope) : undefined;
  const verdict = dec ? f.outcomes[dec.outcome] : undefined;
  if (dec?.outcome === "signoff" && scope?.outOfScope) codes.add("signoff_out_of_scope");
  if (dec?.outcome === "signoff" && scope && scope.needs.some((n) => f.fields.find((x) => x.id === n)?.state !== "verified"))
    codes.add("signoff_without_evidence");
  if (verdict?.verdict === "okay") followup = Math.min(followup, 2) as Level;
  if (verdict?.verdict === "risk" || !verdict) followup = Math.min(followup, 1) as Level;
  for (const x of fields)
    (x.right ? did : todo).followup.push(
      x.right ? `${x.label}: ${x.key}` : `${x.label}: you said ${x.yours.toLowerCase()}; the sample shows ${x.key.toLowerCase()}`,
    );

  // Caps from codes
  const levels: Record<Dim, Level> = { evidence, urgency, role, coaching, learning, followup };
  for (const c of codes) for (const [k, cap] of Object.entries(CODE_CAPS[c] ?? {}) as [Dim, Level][]) levels[k] = Math.min(levels[k], cap) as Level;
  const critical = [...codes].filter(isCritical).map((c) => ({ code: c, label: CODES[c], ...CORRECTIONS[c as CriticalCode] }));
  const score = DIM_ORDER.reduce((t, k) => t + levels[k], 0);
  const ending: Debrief["ending"] = critical.length ? "critical" : (dec?.outcome ?? "extend");

  const review = s.turns.some((t) => t.hedged.length > 0);
  return {
    scenario: sc.id,
    ending,
    endingLabel: ending === "critical" ? "A critical error to correct" : OUTCOMES[ending],
    defensible: !critical.length && verdict?.verdict !== "risk",
    critical,
    codes: [...codes].sort(),
    score,
    max: MAX_SCORE,
    passed: d.mode === "assessed" ? !critical.length && score >= d.passMark : null,
    review,
    dims: DIM_ORDER.map((k) => ({ dim: k, label: DIMS[k], level: levels[k], levelLabel: LEVELS[levels[k]], did: did[k], todo: todo[k] })),
    findings,
    overcalled,
    actions: sc.actions.map((a) => ({
      id: a.id,
      label: a.label,
      chosen: s.actions?.now.includes(a.id) ? "now" : s.actions?.later.includes(a.id) ? "later" : "",
      firstTry: first.now.includes(a.id) ? "now" : first.later.includes(a.id) ? "later" : "",
      verdict: a.verdict,
      feedback: a.feedback,
    })),
    actionTries: s.actionTries,
    coaching: {
      turns: s.turns.map((t) => ({
        text: t.text,
        moves: t.moves.map((m) => COACH_MOVES[m]),
        risks: t.risks.map((r) => ({ label: CODES[r], feedback: RISK_FEEDBACK[r] })),
        review: t.hedged.map((r) => `“${CODES[r]}”: softened in your words, so a reviewer checks it rather than the rules guessing.`),
        reply: sc.coach.replies[t.reply],
      })),
      missingMoves: (Object.keys(COACH_MOVES) as CoachMove[]).filter((m) => !moves.has(m)).map((m) => ({ move: COACH_MOVES[m], hint: MOVE_HINTS[m] })),
      pushback: push ? { label: push.label, verdict: push.verdict, feedback: push.feedback } : null,
      involved: s.involved.map((r) => REVIEWERS[r]),
      model: sc.coach.model,
      alternatives: sc.coach.alternatives,
    },
    plan: [...assigned]
      .sort((a, b) => a.due - b.due)
      .map((i) => {
        const x = sc.suggestions.find((y) => y.id === i.id)!;
        return {
          id: i.id,
          label: x.label,
          kind: isReviewRequest(x, frozenAvail) ? PLAN_KINDS.review : PLAN_KINDS[x.kind],
          due: i.due,
          status: i.status,
          title: i.title,
          version: i.version,
          why: x.why,
          feedback: x.feedback,
        };
      }),
    reviewRequests,
    followup: {
      fields,
      outcome: dec ? OUTCOMES[dec.outcome] : "",
      scope: scope?.label ?? "",
      reviewer: dec?.reviewer ? REVIEWERS[dec.reviewer] : "",
      feedback: verdict?.feedback ?? "",
    },
    sources: sc.sources.map((id) => sourceById(id)).filter((x): x is ShadowSource => Boolean(x)),
    versions: { shadow: SHADOW_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: d.scenarioVersion, rules: sc.rules?.ruleSet ?? "" },
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner's page holds: what's arrived, never the answer key
// ---------------------------------------------------------------------------------------------

export type History = { scenario: string; title: string; outcome: string; scope: string };

export function shadowView(d: ShadowData, s: ShadowState, ctx: Ctx & { history?: History[] } = {}) {
  const sc = scenarioOf(d, s.scenario);
  if (!sc) throw new MoveError("That scenario isn’t in this block.");
  const ph = phaseOf(s);
  const reached = (p: Phase) => PHASE_ORDER.indexOf(ph) >= PHASE_ORDER.indexOf(p);
  const lastCheck = s.actions ? checkActions(sc, s.actions) : null;
  const formative = d.mode === "formative";
  const last = s.turns.at(-1);
  return {
    phase: ph,
    phaseLabel: PHASES[ph],
    scenario: {
      id: sc.id,
      title: sc.title,
      day: sc.day,
      date: sc.date,
      stage: STAGES[sc.stage],
      summary: sc.summary,
      brief: sc.brief,
      known: sc.known,
      missing: sc.missing,
      rules: sc.rules ? { ruleSet: sc.rules.ruleSet, effective: sc.rules.effective } : null,
    },
    history: ctx.history ?? [],
    artefacts: sc.artefacts.map((a) => ({ ...a, kindLabel: ARTEFACT_KINDS[a.kind], viewed: s.viewed.includes(a.id) })),
    marks: Object.entries(s.marks).map(([key, m]) => ({ key, ...m })),
    actions: reached("act")
      ? {
          options: sc.actions.map((a) => ({ id: a.id, label: a.label, lane: a.lane, laneLabel: LANES[a.lane] })),
          chosen: s.actions,
          tries: s.actionTries,
          ok: s.actionsOk,
          // The correction for a critical gap is shown straight away (PRD criterion 2): what's missing, and why.
          feedback:
            lastCheck && !lastCheck.ok
              ? {
                  critical: lastCheck.codes.filter(isCritical).map((c) => ({ label: CODES[c], text: CORRECTIONS[c as CriticalCode].text })),
                  missing: lastCheck.missing.map((id) => sc.actions.find((a) => a.id === id)?.label ?? id),
                }
              : null,
        }
      : null,
    coach: reached("coach")
      ? {
          turns: s.turns.map((t) => ({
            text: t.text,
            reply: sc.coach.replies[t.reply],
            // Practice cues (formative only): the authored reading of the words, never a score.
            cues: formative ? [...t.risks.map((r) => RISK_FEEDBACK[r]), ...t.hedged.map(() => "Part of this was softened, so a reviewer would check it.")] : [],
          })),
          canTurn: ph === "coach" && s.turns.length < MAX_TURNS,
          pushback: pushbackOpen(s)
            ? { prompt: sc.coach.pushback.prompt, options: sc.coach.pushback.options.map((o) => ({ id: o.id, label: o.label })), chosen: s.pushback }
            : null,
          involved: s.involved,
          lastReply: last ? sc.coach.replies[last.reply] : "",
        }
      : null,
    plan: reached("plan")
      ? {
          suggestions: sc.suggestions.map((x) => ({
            id: x.id,
            kind: x.kind,
            kindLabel: PLAN_KINDS[x.kind],
            label: x.label,
            why: x.why,
            minutes: x.minutes,
            due: x.due,
            owner: x.owner,
            required: x.required,
            content: x.ref ? (ctx.avail?.[x.id] ?? null) : null,
          })),
          draft: s.plan,
          assigned: s.assigned,
          maxMinutes: sc.maxMinutes,
          problems: ph === "plan" && s.plan.length ? planProblems(sc, s.plan, ctx.avail ?? {}) : [],
        }
      : null,
    followup: reached("followup")
      ? {
          day: sc.followup.day,
          viewed: s.followViewed,
          artefact: s.followViewed ? { ...sc.followup.artefact, kindLabel: ARTEFACT_KINDS[sc.followup.artefact.kind] } : null,
          fields: sc.followup.fields.map((x) => ({ id: x.id, label: x.label, yours: s.followMarks[x.id] ?? "" })),
          scopes: sc.followup.scopes.map((x) => ({ id: x.id, label: x.label, reviewer: x.reviewer, reviewerLabel: x.reviewer ? REVIEWERS[x.reviewer] : "" })),
          outcomes: (Object.keys(OUTCOMES) as Outcome[]).map((o) => ({ id: o, label: OUTCOMES[o] })),
          decision: s.decision,
        }
      : null,
    canSubmit: ph === "submit",
  };
}
export type ShadowView = ReturnType<typeof shadowView>;

// ---------------------------------------------------------------------------------------------
// Checks: the case must hold together (structural, unwaivable) and be signed off (inside the demo wrapper)
// ---------------------------------------------------------------------------------------------

const textOf = (d: ShadowData) =>
  [
    d.title,
    d.intro,
    d.coordinator.about,
    ...d.scenarios.flatMap((sc) => [
      sc.summary,
      sc.brief.handling,
      sc.brief.see,
      sc.brief.unknown,
      ...sc.known,
      ...sc.missing,
      ...[...sc.artefacts, sc.followup.artefact].flatMap((a) => a.lines.map((l) => l.text)),
      ...Object.values(sc.coach.replies),
    ]),
  ].join("\n");

const SCORE_WORDS = /\b(rank(ed|ing)?|league table|leaderboard|productivity score|performance score)\b/i;

/** The case's own logic: if this fails, it's never published, demo sign-off or not. */
export function caseProblems(d: ShadowData): string[] {
  const out: string[] = [];
  if (!d.scenarios.length) out.push("Add at least one scenario.");
  if (!/coordinator/i.test(d.coordinator.label)) out.push("The recurring coordinator is a role (“Maya’s new coordinator”), never a named person.");
  const seen = new Set<string>();
  for (const sc of d.scenarios) {
    const w = `Scenario “${sc.title || sc.id}”`;
    if (seen.has(sc.id)) out.push(`${w}: its id is used twice.`);
    seen.add(sc.id);
    if (!sc.artefacts.length || sc.artefacts.some((a) => a.lines.length < 2)) out.push(`${w}: every artefact needs at least two lines.`);
    const lines = lineIds(sc);
    const fLines = new Set(sc.followup.artefact.lines.map((l) => l.id));
    if (lines.size !== sc.artefacts.reduce((t, a) => t + a.lines.length, 0)) out.push(`${w}: line ids must be unique.`);
    if (!sc.findings.length) out.push(`${w}: add at least one finding.`);
    for (const f of sc.findings) {
      if (!f.keys.length || f.keys.some((k) => !lines.has(k.replace(/^omit:/, "")))) out.push(`${w}: finding “${f.label}” points at a line that isn’t there.`);
      if (!f.classes.length || !f.kinds.length) out.push(`${w}: finding “${f.label}” needs its accepted kinds and classes.`);
      if (f.urgent && !f.classes.includes("act_now")) out.push(`${w}: urgent finding “${f.label}” must accept “Act now”.`);
      if (f.source && !sourceById(f.source)) out.push(`${w}: finding “${f.label}” cites an unknown source.`);
    }
    if (sc.findings.some((f) => f.urgent) && !sc.actions.some((a) => a.verdict === "essential" && a.when === "now"))
      out.push(`${w}: an urgent finding needs an essential action that can’t wait.`);
    if (!isCritical(sc.essentialMiss)) out.push(`${w}: the missing-essential code must be a critical one.`);
    for (const a of sc.actions) if (a.verdict === "unsafe" && !a.code) out.push(`${w}: unsafe action “${a.label}” needs its code.`);
    if (sc.actions.some((a) => a.verdict === "essential" && a.code)) out.push(`${w}: an essential action can’t raise a code.`);
    if (!sc.coach.pushback.options.some((o) => o.verdict === "good")) out.push(`${w}: her explanation needs at least one good response.`);
    if (Object.values(sc.coach.replies).some((r) => !r.trim())) out.push(`${w}: every coordinator reply needs its words.`);
    // The plan: real content only, with a practice and an observation available to choose.
    for (const k of ["learning", "practice", "observation"] as const)
      if (!sc.suggestions.some((x) => x.kind === k)) out.push(`${w}: the plan needs a ${PLAN_KINDS[k].toLowerCase()} suggestion.`);
    for (const x of sc.suggestions) {
      if ((x.kind === "learning" || x.kind === "review") && !x.ref)
        out.push(`${w}: “${x.label}” must point at existing content (a Topic, Magazine page or Job Aid).`);
      if (x.ref && !/^[a-z0-9][a-z0-9-]{0,119}$/.test(x.ref.id)) out.push(`${w}: “${x.label}” has a content reference that isn’t an id.`);
      if (x.fit === "risk" && !x.feedback) out.push(`${w}: “${x.label}” needs feedback for when it’s chosen.`);
    }
    // The second sample tests transfer: a different artefact, not the same answer.
    const firstText = new Set(sc.artefacts.flatMap((a) => a.lines.map((l) => l.text.trim().toLowerCase())));
    if (sc.followup.artefact.lines.some((l) => firstText.has(l.text.trim().toLowerCase()))) out.push(`${w}: the second sample repeats a line from the first.`);
    if (sc.followup.artefact.lines.some((l) => lines.has(l.id))) out.push(`${w}: the second sample’s line ids must differ from the first’s.`);
    if (sc.followup.day <= sc.day) out.push(`${w}: the second sample comes after the first.`);
    if (!sc.followup.fields.length) out.push(`${w}: the second sample needs evidence to mark.`);
    for (const x of sc.followup.fields)
      if (x.lines.some((l) => !fLines.has(l.replace(/^omit:/, "")))) out.push(`${w}: evidence “${x.label}” points at a line that isn’t in the second sample.`);
    if (!sc.followup.scopes.some((x) => !x.outOfScope)) out.push(`${w}: add at least one defined task that can be signed off.`);
    for (const x of sc.followup.scopes)
      if (x.needs.some((n) => !sc.followup.fields.some((y) => y.id === n))) out.push(`${w}: task “${x.label}” needs evidence that isn’t listed.`);
    if (!Object.values(sc.followup.outcomes).some((o) => o?.verdict === "good")) out.push(`${w}: at least one readiness outcome must be defensible.`);
    // Contribution claims: checked against the Hub's effective-dated rule set, never a timeless rule.
    if (sc.rules) {
      if (sc.rules.ruleSet !== RULESET.version)
        out.push(`${w}: it rests on contribution rule set ${sc.rules.ruleSet}, but the current one is ${RULESET.version}.`);
      if (!isDate(sc.date)) out.push(`${w}: a contribution case needs its date.`);
      for (const c of sc.rules.claims)
        if (isDate(sc.date) && categoryOn(c.service, sc.date) !== c.category)
          out.push(`${w}: on ${sc.date}, ${SERVICES[c.service].label.toLowerCase()} isn’t ${c.category} in the current rule set.`);
    }
    if (!sc.sources.length || sc.sources.some((x) => !sourceById(x))) out.push(`${w}: cite its sources from the register.`);
  }
  const ids = identifierWarnings(textOf(d));
  if (ids.length) out.push(`Something looks like a real identifier (${ids.join(", ")}). Every person and record here is fictional.`);
  if (SCORE_WORDS.test(textOf(d))) out.push("No ranking or score of people: this practises a manager’s judgement, never a league table.");
  return out;
}

export const shadowApproved = (d: Pick<ShadowData, "approval">) => {
  const a = d.approval;
  return (Object.keys(APPROVAL_ROLES) as (keyof typeof APPROVAL_ROLES)[]).every((k) => a[k].trim()) && Boolean(a.approvedOn && a.reviewBy);
};

/** Sign-off and sources: checked inside the demo sign-off wrapper. "Publish anyway" doesn't cover them. */
export function signOffProblems(d: ShadowData, today: string, sources: ShadowSource[] = SHADOW_SOURCES): string[] {
  const out: string[] = [];
  const a = d.approval;
  const missing = (Object.keys(APPROVAL_ROLES) as (keyof typeof APPROVAL_ROLES)[]).filter((k) => !a[k].trim());
  if (missing.length) out.push(`Sign-off still needed: ${missing.map((k) => APPROVAL_ROLES[k]).join(", ")}.`);
  if (!a.approvedOn) out.push("Record the date it was approved.");
  if (!a.reviewBy || (today && a.reviewBy < today)) out.push("Set a review date that hasn’t passed.");
  if (a.scenarioReviewed !== d.scenarioVersion) out.push(`The sign-off is for scenario version “${a.scenarioReviewed || "none"}”, not “${d.scenarioVersion}”.`);
  if (!d.jobAid.snippetId) out.push("Link the coaching conversation Job Aid.");
  if (d.mode === "assessed" && (d.passMark < 1 || d.passMark > MAX_SCORE)) out.push("An assessed block needs a pass mark.");
  if (d.rationale.decision === "rejected") out.push("The selection rationale was rejected: route the problem to the process fix instead.");
  const cited = [
    ...new Set(d.scenarios.flatMap((sc) => [...sc.sources, ...sc.findings.map((f) => f.source), ...sc.actions.map((x) => x.source)]).filter(Boolean)),
  ];
  for (const id of cited) {
    const s = sources.find((x) => x.id === id);
    if (!s) continue;
    if (s.placeholder) out.push(`“${s.title}” is a placeholder: Trilogy Care’s current version is needed.`);
    else if (s.status !== "current" || (s.reviewBy && today && s.reviewBy < today)) out.push(`“${s.title}” needs review before this can be published.`);
  }
  return out;
}

/** Whether new attempts can start: not when a source it rests on is withdrawn, or the rule set it was written for has changed. */
export function shadowUsable(d: ShadowData, sources: ShadowSource[] = SHADOW_SOURCES): { ok: boolean; reason: string } {
  const cited = new Set(d.scenarios.flatMap((sc) => sc.sources));
  const gone = sources.filter((s) => cited.has(s.id) && s.status === "withdrawn");
  if (gone.length) return { ok: false, reason: `This practice is paused while “${gone[0].title}” is reviewed.` };
  if (d.scenarios.some((sc) => sc.rules && sc.rules.ruleSet !== RULESET.version))
    return { ok: false, reason: "This practice is paused: the contribution rules it uses have changed." };
  return { ok: true, reason: "" };
}

/** The readers' copy: the frame only. Artefacts, the key, the options and the follow-up come from the attempt API. */
export function shadowForReaders<T extends ShadowData>(b: T): T {
  return {
    ...b,
    scenarios: b.scenarios.map((sc) => ({
      ...sc,
      known: [],
      missing: [],
      artefacts: [],
      findings: [],
      actions: [],
      coach: {
        notice: [],
        replies: { defensive: "", unsure: "", explains: "", agrees: "", generic: "" },
        pushback: { prompt: "", options: [] },
        model: "",
        alternatives: [],
      },
      suggestions: [],
      followup: { day: sc.followup.day, artefact: { id: "", kind: "note", title: "", meta: "", lines: [] }, fields: [], scopes: [], outcomes: {} },
    })),
    rationale: { signal: "", behaviour: "", barrier: "", why: "", alternatives: "", decision: "", measure: "" },
  };
}

/** Every content reference in a block, for the server to resolve against the live catalogue. */
export const contentRefs = (d: Pick<ShadowData, "scenarios">) =>
  d.scenarios.flatMap((sc) =>
    sc.suggestions.filter((x) => x.ref).map((x) => ({ scenario: sc.id, suggestion: x.id, ref: x.ref as ContentRef, label: x.label })),
  );

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str?: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown, dflt: string) => (typeof v === "string" && ID.test(v) ? v : dflt);
const strs = (v: unknown, max = 12, len = 300) =>
  arr(v)
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.slice(0, len))
    .slice(0, max);
const int = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : dflt);
const many = <T extends string>(v: unknown, all: readonly T[]) => [...new Set(arr(v).filter((x): x is T => all.includes(x as T)))];
const pick = <T extends string>(v: unknown, all: readonly T[], dflt: T): T => (all.includes(v as T) ? (v as T) : dflt);
const code = (v: unknown): Code | "" => (typeof v === "string" && (CODE_IDS as string[]).includes(v) ? (v as Code) : "");
const date = (v: unknown) => (isDate(v) ? v : "");

function parseArtefact(v: unknown, k: number): Artefact {
  const r = obj(v);
  return {
    id: id(r.id, `artefact-${k + 1}`),
    kind: pick(r.kind, Object.keys(ARTEFACT_KINDS) as ArtefactKind[], "note"),
    title: s(r.title, 160),
    meta: s(r.meta, 200),
    lines: arr(r.lines)
      .slice(0, 30)
      .map((x, i) => {
        const l = obj(x);
        return { id: id(l.id, `${id(r.id, `a${k + 1}`)}-l${i + 1}`), speaker: s(l.speaker, 60), text: s(l.text, 400) };
      }),
  };
}

function parseScenario(v: unknown, k: number): Scenario {
  const r = obj(v);
  const br = obj(r.brief);
  const co = obj(r.coach);
  const rep = obj(co.replies);
  const pb = obj(co.pushback);
  const fu = obj(r.followup);
  const ru = r.rules && typeof r.rules === "object" ? obj(r.rules) : null;
  const outcomes: Followup["outcomes"] = {};
  for (const [o, x] of Object.entries(obj(fu.outcomes))) {
    if (!(o in OUTCOMES)) continue;
    const y = obj(x);
    outcomes[o as Outcome] = { verdict: pick(y.verdict, ["good", "okay", "risk"] as const, "okay"), feedback: s(y.feedback, 600) };
  }
  return {
    id: id(r.id, `scenario-${k + 1}`),
    title: s(r.title, 160),
    day: int(r.day, 0, 100, 15),
    date: date(r.date),
    stage: pick(r.stage, STAGE_IDS, "practise"),
    summary: s(r.summary, 600),
    brief: { handling: s(br.handling, 600), see: s(br.see, 600), unknown: s(br.unknown, 600) },
    known: strs(r.known),
    missing: strs(r.missing),
    rules: ru
      ? {
          ruleSet: s(ru.ruleSet, 40),
          effective: date(ru.effective),
          claims: arr(ru.claims)
            .slice(0, 10)
            .map(obj)
            .filter(
              (c) =>
                typeof c.service === "string" &&
                c.service in SERVICES &&
                typeof c.category === "string" &&
                ["clinical", "independence", "everyday"].includes(c.category),
            )
            .map((c) => ({ service: c.service as ServiceId, category: c.category as Category })),
        }
      : null,
    artefacts: arr(r.artefacts).slice(0, 5).map(parseArtefact),
    findings: arr(r.findings)
      .slice(0, 20)
      .map((x, i) => {
        const f = obj(x);
        return {
          id: id(f.id, `finding-${i + 1}`),
          label: s(f.label, 200),
          keys: arr(f.keys)
            .filter((y): y is string => typeof y === "string" && KEY.test(y))
            .slice(0, 8),
          kinds: many(f.kinds, Object.keys(EVIDENCE_KINDS) as EvidenceKind[]),
          classes: many(f.classes, Object.keys(CLASSES) as Class[]),
          causes: many(f.causes, Object.keys(CAUSES) as Cause[]),
          urgent: f.urgent === true,
          misclassCode: code(f.misclassCode),
          why: s(f.why, 600),
          source: s(f.source, 60),
        };
      }),
    actions: arr(r.actions)
      .slice(0, 20)
      .map((x, i) => {
        const a = obj(x);
        return {
          id: id(a.id, `action-${i + 1}`),
          label: s(a.label, 240),
          lane: pick(a.lane, Object.keys(LANES) as Lane[], "contact"),
          when: pick(a.when, ["now", "later", "either"] as const, "either"),
          verdict: pick(a.verdict, ["essential", "good", "okay", "unsafe"] as const, "okay"),
          code: code(a.code),
          feedback: s(a.feedback, 600),
          source: s(a.source, 60),
        };
      }),
    essentialMiss: pick(r.essentialMiss, CRITICAL, "missed_correction"),
    coach: {
      notice: strs(co.notice, 12, 60),
      replies: {
        defensive: s(rep.defensive, 600),
        unsure: s(rep.unsure, 600),
        explains: s(rep.explains, 600),
        agrees: s(rep.agrees, 600),
        generic: s(rep.generic, 600),
      },
      pushback: {
        prompt: s(pb.prompt, 400),
        options: arr(pb.options)
          .slice(0, 6)
          .map((x, i) => {
            const o = obj(x);
            return {
              id: id(o.id, `pushback-${i + 1}`),
              label: s(o.label, 240),
              verdict: pick(o.verdict, ["good", "okay", "risk"] as const, "okay"),
              code: code(o.code),
              feedback: s(o.feedback, 600),
            };
          }),
      },
      model: s(co.model, 1200),
      alternatives: strs(co.alternatives, 6, 600),
    },
    suggestions: arr(r.suggestions)
      .slice(0, 16)
      .map((x, i) => {
        const g = obj(x);
        const ref = g.ref && typeof g.ref === "object" ? obj(g.ref) : null;
        return {
          id: id(g.id, `suggestion-${i + 1}`),
          kind: pick(g.kind, Object.keys(PLAN_KINDS) as PlanKind[], "learning"),
          label: s(g.label, 200),
          why: s(g.why, 400),
          ref: ref ? { type: pick(ref.type, ["topic", "magazine", "aid"] as const, "topic"), id: s(ref.id, 120) } : null,
          minutes: int(g.minutes, 0, 600, 0),
          due: int(g.due, 0, 21, 7),
          owner: s(g.owner, 120),
          fit: pick(g.fit, ["good", "okay", "risk"] as const, "good"),
          code: code(g.code),
          required: g.required === true,
          feedback: s(g.feedback, 600),
        };
      }),
    maxMinutes: int(r.maxMinutes, 10, 600, 120),
    processIssue: r.processIssue === true,
    followup: {
      day: int(fu.day, 0, 100, 30),
      artefact: parseArtefact(fu.artefact, 9),
      fields: arr(fu.fields)
        .slice(0, 10)
        .map((x, i) => {
          const f = obj(x);
          return {
            id: id(f.id, `evidence-${i + 1}`),
            label: s(f.label, 200),
            lines: strs(f.lines, 6, 60),
            state: pick(f.state, MARK_STATES, "needs_verification"),
            why: s(f.why, 600),
          };
        }),
      scopes: arr(fu.scopes)
        .slice(0, 6)
        .map((x, i) => {
          const c = obj(x);
          return {
            id: id(c.id, `scope-${i + 1}`),
            label: s(c.label, 240),
            needs: strs(c.needs, 10, 60),
            reviewer: c.reviewer === "" ? "" : pick(c.reviewer, Object.keys(REVIEWERS) as Reviewer[], "quality"),
            outOfScope: c.outOfScope === true,
            why: s(c.why, 600),
          };
        }),
      outcomes,
    },
    sources: strs(r.sources, 10, 60),
  };
}

export function parseShadow(o: Raw, where: string, h: ParseHelpers): ShadowData {
  const mg = obj(o.manager);
  const cd = obj(o.coordinator);
  const pt = obj(o.participant);
  const ja = obj(o.jobAid);
  const ra = obj(o.rationale);
  const ap = obj(o.approval);
  const title = (h.str ? h.str(o.title, `${where} title`, { required: true, max: 160 }) : s(o.title, 160)) ?? "";
  const data: ShadowData = {
    title,
    intro: s(o.intro, 800),
    scenarioVersion: s(o.scenarioVersion, 60),
    mode: o.mode === "assessed" ? "assessed" : "formative",
    passMark: int(o.passMark, 0, MAX_SCORE, 12),
    manager: { name: s(mg.name, 60), role: s(mg.role, 200), situation: s(mg.situation, 800) },
    coordinator: { label: s(cd.label, 80), role: s(cd.role, 200), started: s(cd.started, 80), about: s(cd.about, 600) },
    participant: { name: s(pt.name, 60), about: s(pt.about, 400) },
    scenarios: arr(o.scenarios).slice(0, 6).map(parseScenario),
    jobAid: { snippetId: s(ja.snippetId, 80), why: s(ja.why, 400) },
    rationale: {
      signal: s(ra.signal, 600),
      behaviour: s(ra.behaviour, 400),
      barrier: s(ra.barrier, 400),
      why: s(ra.why, 800),
      alternatives: s(ra.alternatives, 600),
      decision: pick(ra.decision, ["", "accepted", "edited", "rejected"] as const, ""),
      measure: s(ra.measure, 400),
    },
    approval: (Object.keys(emptyApproval()) as (keyof Approval)[]).reduce(
      (acc, k) => ({ ...acc, [k]: k === "approvedOn" || k === "reviewBy" ? date(ap[k]) : s(ap[k], 120) }),
      emptyApproval(),
    ),
  };
  if (!data.scenarios.length) h.unfinished(`${where}: add a Shadow & Coach scenario.`);
  return data;
}
