import { interpret, type SharingRule } from "./familyCall";
import { carryoverOf, carryoverThreshold, money, type Threshold } from "./quarterBudget";
import { quarterRules, ruleStatus, QUARTER_RULES } from "./quarterEndRules";
import { OUTCOMES, REASONS, RECOVERY_REASONS, type Outcome, type Reason } from "./serviceReliability";
import { FIONA_GARDENER } from "@/content/familyCalls";

/*
  The 28-Day Trust Check (docs/trust-check.md): a fictional Service Recovery Diagnostic & Save Simulator, built from the
  PRD "Partner Hub: 28-Day Trust Check and Service Recovery Playbook" (21 November 2026). Four decisions, in the
  playbook's order: is this actually a concern (Notice), what does the person want (Ask), what needs fixing and who
  owns it (Act), and did the response help (Check), then what should change beyond this case (Learn).

  Deterministic throughout, in the Discharge Pivot's pattern: a case is data (signals, steps, a plan builder, follow-up
  checkpoints, endings, a rubric of option levels and codes), and the learner's state is their ordered choices. The
  server, the editor's preview and the tests replay the same functions. Nothing here is a model.

  Principles the engine enforces, whatever a case says:
  - A signal is not a prediction. There is no churn score, probability or "will leave" output anywhere: the most a
    signal can do (`triageFromSignals`) is name a type of unresolved problem, and a budget balance on its own is never
    more than "review with the person". A known pause or a claim lag explains it.
  - The person's own voice and recorded sharing preferences come first. Who may be told what reuses the Tough Family
    Call's preference model (`SharingRule`, lib/familyCall): telling a relative a topic the person hasn't agreed to is
    a critical error, however the plan is worded.
  - Retention pressure never overrides choice. Choosing to move is a defensible ending with full marks for a supported
    handoff; pressing her to stay, an inducement, or recording her choice as a failure is critical.
  - Never discourage a complaint. A plan's own words are read with the Tough Family Call's reviewed complaint wording
    and its hedging rule (`discouragesComplaint`), not a copy of them.
  - "Did it help?" needs evidence: calling it resolved without a delivery record and the person's own view is coded,
    and never reaches the "resolved" ending.

  Missed visits use the Service Reliability Calculator's definitions (outcomes, initiating reasons and which reasons
  need recovery), and the money card uses the Quarterly Budget Decision Lab's carryover threshold, so "unspent" means
  the same thing in all three.
*/

export const TRUST_VERSION = "trust-check-1";
/** The Quarterly Budget Decision Lab's current rule set: the default for a new case and the Work Tool's demo. */
export const QUARTER_RULE_SET = QUARTER_RULES[0].id;
export const RUBRIC_VERSION = "trust-rubric-1";
export const ENGINE_VERSION = "trust-engine-1";

export const TRUST_NOTICE =
  "A fictional case for practice. Nothing here reads or changes a real participant’s record, sends a message, books a service, lodges a complaint or starts a transfer.";

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

export const PHASES = { notice: "Notice", ask: "Ask", act: "Act", check: "Check", learn: "Learn" } as const;
export type Phase = keyof typeof PHASES;
export const PHASE_ORDER = Object.keys(PHASES) as Phase[];
export const PHASE_QUESTIONS: Record<Phase, string> = {
  notice: "Is this actually a concern?",
  ask: "What does the person want?",
  act: "What needs fixing, and who owns it?",
  check: "Did the response help?",
  learn: "What should change beyond this case?",
};

/** Triage levels (PRD section 6): the type of unresolved problem, never a judgement about the person. */
export const TRIAGE = {
  immediate: "Immediate escalation",
  recovery: "Service recovery",
  review: "Review with the person",
  context: "Context explained: no action",
} as const;
export type Triage = keyof typeof TRIAGE;
export const TRIAGE_HINTS: Record<Triage, string> = {
  immediate: "A possible safety, clinical or incident issue. It follows the urgent process now, and never waits in a 28-day queue.",
  recovery:
    "A concrete missed service, repeated delay, disputed bill, unexplained statement or expressed dissatisfaction: an accountable response and a follow-up.",
  review: "Planned and delivered support don’t match, or a goal has changed, and the cause isn’t known: ask before prescribing a fix.",
  context:
    "A known pause, the person’s own preference, a claim lag or something already resolved. Record enough to avoid duplicate nudges; nobody is labelled at risk.",
};

/** Workflow statuses (PRD section 16): where an issue is, never a hidden probability band. */
export const WORKFLOW = {
  needsVerification: "Needs verification",
  waitingOwner: "Waiting for owner",
  actionDue: "Action due",
  checking: "Checking outcome",
  resolved: "Resolved with person",
  transferred: "Transferred by choice",
  escalated: "Escalated to authoritative process",
} as const;
export type Workflow = keyof typeof WORKFLOW;
export const WORKFLOW_ORDER = Object.keys(WORKFLOW) as Workflow[];

export const RELIABILITY = { verified: "Verified record", reported: "Reported, not verified", unverified: "Not yet verified", stale: "Out of date" } as const;
export type SignalReliability = keyof typeof RELIABILITY;

/** What a follow-up record shows. A booking or a sent message is never delivery; the person's own view is its own kind. */
export const EVIDENCE_KINDS = {
  booking: "A booking or a message (not delivery)",
  delivery: "A delivery record",
  billing: "A billing correction",
  person: "The person’s own view",
  transfer: "The person’s choice to move",
  safety: "A safety concern",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

export const DIMS = {
  signal: "Signal interpretation",
  voice: "Participant voice and permissions",
  cause: "Cause and priority",
  policy: "Policy accuracy",
  action: "Accountable action",
  outcome: "Outcome check and choice",
  system: "System learning",
} as const;
export type Dim = keyof typeof DIMS;
export const DIM_ORDER = Object.keys(DIMS) as Dim[];
export const DIM_HINTS: Record<Dim, string> = {
  signal: "Tells low use, missed care, billing lag, complaints and known pauses apart, and names what must be verified.",
  voice: "Asks the person about their goals and how they want a relative involved; doesn’t let the family decide.",
  cause: "Finds reliability and invoice clarity as separate causes, and escalates a safety issue promptly if one appears.",
  policy: "Explains the projected balance, carryover and the AT–HM boundary correctly, without promising an item or contribution.",
  action: "Names an operational owner, a realistic next update and a contingency if the supplier can’t deliver.",
  outcome: "Verifies what changed and how the person feels about it, and supports a move if they choose one.",
  system: "Connects a repeat issue to the right supplier, process, content or training owner.",
};
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };
export const MAX_SCORE = DIM_ORDER.length * 3;

/** The PRD's critical flags (section 11) first: a total score never overrides one. */
export const CODES = {
  spendPressure: "Pressed to spend the budget for its own sake",
  atHmFromOngoing: "Suggested an AT–HM item from the ongoing quarterly budget",
  bypassedReview: "Bypassed the care-plan or clinical review",
  complaintDiscouraged: "Discouraged, delayed or downgraded a complaint",
  restrictedDisclosure: "Shared something with a relative that the person hasn’t agreed to",
  unverifiedPromise: "Promised a worker, a date or a fix that wasn’t confirmed",
  retentionPressure: "Pressed the person to stay, or offered an inducement",
  transferAsFailure: "Treated the person’s choice to move as a failure",
  delayedSafety: "Held a safety concern for the 28-day check",
  fabricated: "Stated a service, fee or outcome the record doesn’t show",
  labelledPerson: "Labelled the person a churn risk",
  churnVerdict: "Read one signal as a prediction that she’ll leave",
  inferenceAsFact: "Treated an inference as an observed fact",
  pauseAsRisk: "Treated a known pause or a claim lag as a problem",
  familyFirst: "Went to the family before hearing the person",
  callOnly: "Planned a call, not a fix",
  noOwner: "No accountable operational owner",
  noContingency: "No plan for the first fix failing",
  noEvidence: "Called it resolved without a delivery record and the person’s own view",
  duplicateCourse: "Asked for new training where a process fix was needed",
} as const;
export type Code = keyof typeof CODES;
export const CRITICAL: readonly Code[] = [
  "spendPressure",
  "atHmFromOngoing",
  "bypassedReview",
  "complaintDiscouraged",
  "restrictedDisclosure",
  "unverifiedPromise",
  "retentionPressure",
  "transferAsFailure",
  "delayedSafety",
  "fabricated",
  "labelledPerson",
];
/** How far a code caps a dimension, whatever else was done: one table a reviewer reads. */
export const CODE_CAPS: Record<Code, Partial<Record<Dim, Level>>> = {
  spendPressure: { policy: 0, voice: 1 },
  atHmFromOngoing: { policy: 0 },
  bypassedReview: { policy: 0, cause: 1 },
  complaintDiscouraged: { voice: 0, outcome: 1 },
  restrictedDisclosure: { voice: 0 },
  unverifiedPromise: { action: 0, outcome: 1 },
  retentionPressure: { outcome: 0, voice: 0 },
  transferAsFailure: { outcome: 0, system: 1 },
  delayedSafety: { cause: 0 },
  fabricated: { policy: 0, action: 0 },
  labelledPerson: { signal: 0, voice: 1 },
  churnVerdict: { signal: 1 },
  inferenceAsFact: { signal: 1 },
  pauseAsRisk: { signal: 1 },
  familyFirst: { voice: 1 },
  callOnly: { action: 1 },
  noOwner: { action: 1 },
  noContingency: { action: 1 },
  noEvidence: { outcome: 1 },
  duplicateCourse: { system: 1 },
};
/** The correction shown with each code, and the source it rests on (a source id in the case's register). */
export const CORRECTIONS: Record<Code, { text: string; source: string }> = {
  spendPressure: {
    text: "A projected balance deserves an explanation, not a sales target. Services follow assessed needs and the goals she agreed; up to the higher of $1,000 or 10% of the quarterly budget can carry over.",
    source: "budgets",
  },
  atHmFromOngoing: {
    text: "Equipment and home modifications go through the separate AT–HM scheme, with an assessment and, where needed, a prescription. If a real need emerges, ask for an AT–HM assessment; never pay for an item from the ongoing quarterly budget because money remains.",
    source: "at-hm",
  },
  bypassedReview: {
    text: "When needs or services change, the care plan and budget are reviewed together, with the clinical team where health is involved. A coordinator doesn’t add or prescribe a service on their own.",
    source: "care-plans",
  },
  complaintDiscouraged: {
    text: "A person can raise a concern or complaint at any time without reprisal, with the provider or with the Aged Care Quality and Safety Commission. Offer the route and help lodge it; the fix goes ahead either way, and the two statuses are kept separate.",
    source: "acqsc",
  },
  restrictedDisclosure: {
    text: "Share only what the person has agreed a relative may know. Mrs Patel asked that Asha be copied on appointment changes, not on her budget or statement.",
    source: "responsibilities",
  },
  unverifiedPromise: {
    text: "Say what is confirmed and what isn’t. A booking request, a supplier’s ‘we’ll try’ or a roster not yet done isn’t a confirmed worker or date.",
    source: "responsibilities",
  },
  retentionPressure: {
    text: "A person may change providers for any reason. Acknowledge the choice, ask what handoff they need and use the approved exit and transfer process. No gifts, discounts or family pressure.",
    source: "changing",
  },
  transferAsFailure: {
    text: "A supported move to the provider she chose is a defensible outcome, not a failure. Record the reason she gives, if she wants to say, and complete the exit obligations.",
    source: "changing",
  },
  delayedSafety: {
    text: "A possible safety or clinical concern goes to the current clinical and incident escalation process now. The 28-day check never holds it.",
    source: "tc-escalation",
  },
  fabricated: {
    text: "Say only what the record shows. An unexplained line goes to billing for review; nobody invents a reason for it.",
    source: "statements",
  },
  labelledPerson: {
    text: "Risk tags describe the type of unresolved problem, never the person. No ‘churn risk’ or ‘poor value’ label, and no ranking of people by budget.",
    source: "responsibilities",
  },
  churnVerdict: {
    text: "A balance or an unreturned call isn’t a validated prediction that someone will leave. Check the context and ask the person.",
    source: "budgets",
  },
  inferenceAsFact: { text: "Keep what the record shows apart from what you infer from it, and name what still needs verifying.", source: "statements" },
  pauseAsRisk: {
    text: "A pause the person chose, a hospital stay or a claim that hasn’t reached the statement explains a low balance. Record it so nobody nudges her again.",
    source: "mac",
  },
  familyFirst: {
    text: "Hear the person first, then involve a relative within the role she has chosen for them. A family member’s frustration doesn’t speak for her.",
    source: "responsibilities",
  },
  callOnly: { text: "A call is a step, not a fix. Name the action that changes the service, its owner and when she’ll hear back.", source: "responsibilities" },
  noOwner: {
    text: "Every action needs an accountable operational owner: the booking owner, billing, or you. Never the person or her family.",
    source: "responsibilities",
  },
  noContingency: {
    text: "Say what happens if the first fix fails, before it does: another day, another supplier, or help comparing providers.",
    source: "responsibilities",
  },
  noEvidence: {
    text: "A booking or a sent message isn’t resolution. Check the delivery record and ask her whether it helped before you close anything.",
    source: "responsibilities",
  },
  duplicateCourse: {
    text: "A roster that keeps failing is a supplier and process problem. Raise it with the owner and the evidence; don’t write a course for every cancellation.",
    source: "responsibilities",
  },
};

export const ENDINGS = {
  stays: "Resolved with her: Tuesdays are reliable and the charge is explained",
  transfer: "A respectful, supported move to the provider she chose",
  context: "No concern after verification: the context is recorded, and she isn’t pestered",
  escalated: "A safety concern escalated straight away, with the service fix still owned",
  open: "Still open, honestly: the fix isn’t verified yet, and the next check is agreed",
  unverified: "Not verified: closed without a delivery record or her own view",
  unsafe: "A critical error",
} as const;
export type EndingId = keyof typeof ENDINGS;
export const DEFENSIBLE: readonly EndingId[] = ["stays", "transfer", "context", "escalated", "open"];
/** When a play reaches more than one ending, the one that says most about what happened wins. */
const ENDING_RANK: EndingId[] = ["escalated", "transfer", "context", "stays", "open"];

export const OWNER_ROLES = {
  booking: "The booking and scheduling owner",
  billing: "Billing / Finance",
  coordinator: "You (the Care Partner or coordinator)",
  clinical: "The clinical lead",
  complaints: "The feedback and complaints team",
  supplier: "The cleaning supplier",
  participant: "The participant herself",
  family: "A family member",
} as const;
export type OwnerRole = keyof typeof OWNER_ROLES;
const OWNER_IDS = Object.keys(OWNER_ROLES) as OwnerRole[];
/** Who can own an operational action. The person and her family are never the accountable owner. */
export const OPERATIONAL: readonly OwnerRole[] = ["booking", "billing", "coordinator", "clinical", "complaints"];

// ---------------------------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------------------------

/** A missed or changed visit, in the Service Reliability Calculator's terms. */
export type Visit = { date: string; outcome: Outcome; reason: Reason; note: string };

/** The money card's figures (PRD section 6), in whole cents. Illustrative quantities, adapted to no real data contract. */
export type BudgetFigures = {
  quarterlyCents: number;
  week: number;
  weeks: number;
  /** Value of agreed services scheduled through today. */
  plannedToDateCents: number;
  /** Value of services actually delivered through today. */
  deliveredToDateCents: number;
  /** Value processed through the funding/statement source. */
  claimedToDateCents: number;
  /** Delivered services not yet in the processed balance; null: not known yet. */
  pendingClaimsCents: number | null;
  /** Agreed future services this quarter. */
  scheduledRemainderCents: number;
  /** Agreed pauses: excluded from the service gap. */
  pausedCents: number;
  /** When the claims feed was last updated, as shown. */
  feedUpdated: string;
};

export type Signal = {
  id: string;
  /** When it can first be seen. A check-phase signal belongs to a follow-up checkpoint. */
  phase: Phase;
  checkpoint: "" | "day7" | "day28";
  group: "delivery" | "money" | "person" | "supporter" | "contractor" | "gaps" | "followup";
  title: string;
  /** What we noticed: the observed fact, as the source records it. */
  noticed: string;
  matters: string;
  alternatives: string;
  verify: string;
  canAct: string;
  source: string;
  /** Source updated, as a story time ("Fri 20 Nov, 4:10 pm"). */
  updated: string;
  reliability: SignalReliability;
  /** At a checkpoint: what kind of evidence it is. */
  kind: "" | EvidenceKind;
  visits: Visit[];
  budget: BudgetFigures | null;
  /** Shown only once an option that reveals it has been chosen (a requested artefact). */
  hidden: boolean;
  only: string[];
  notIn: string[];
};

export type Override = { levels?: Partial<Record<Dim, Level>>; codes?: Code[]; feedback?: string; reply?: string; ending?: EndingId };
export type Option = {
  id: string;
  text: string;
  feedback: string;
  levels: Partial<Record<Dim, Level>>;
  codes: Code[];
  ending?: EndingId;
  /** What the person says when this is chosen (a conversation step); `guarded` when she hasn't been heard yet. */
  reply: string;
  guarded: string;
  /** Flags this choice sets ("heard"), and the flags the full reply needs. */
  sets: string[];
  needs: string[];
  /** A hidden signal this releases (a requested artefact). */
  reveals: string;
  /** An alternative explanation (Notice): one is needed before a triage. */
  alt: boolean;
  /** A status that needs these kinds of evidence chosen in the checkpoint's evidence step. */
  evidence: EvidenceKind[];
  /** A plan action's owner. */
  owner: OwnerRole | "";
  /** A plan action that is only a contact ("call her"), not a fix. */
  contactOnly: boolean;
  /** One of the moves the debrief names if it was missed. */
  key: boolean;
  only: string[];
  notIn: string[];
  /** The same choice, read differently in a variation. */
  in: Record<string, Override>;
};
export const STEP_SIGNALS = [
  "",
  "evidence_selected",
  "alternative_explanation_selected",
  "triage_selected",
  "participant_question_asked",
  "outcome_recorded",
  "transfer_branch_completed",
  "improvement_issue_raised",
] as const;
export type StepSignal = (typeof STEP_SIGNALS)[number];
export type Step = {
  id: string;
  phase: Phase;
  /** "evidence": the options are the checkpoint's released signals. */
  kind: "single" | "multi" | "evidence";
  title: string;
  prompt: string;
  min: number;
  max: number;
  signal: StepSignal;
  /** In the act phase: comes after the plan is proposed. */
  afterPlan: boolean;
  /** Needs an alternative explanation chosen first (the triage). */
  needsAlt: boolean;
  /** This step revises an earlier one: the earlier answer is kept, and only this one is scored. */
  revises: string;
  /** For an evidence step, or a status step: the checkpoint it reads. */
  checkpoint: "" | "day7" | "day28";
  /** A status step's evidence step. */
  evidenceStep: string;
  options: Option[];
  only: string[];
  notIn: string[];
};

export type PlanSpec = {
  actions: Option[];
  updates: Option[];
  contingencies: Option[];
  checks: Option[];
};
export type Plan = {
  /** The concern in the person's words. */
  concern: string;
  actions: string[];
  owner: OwnerRole | "";
  update: string;
  contingency: string;
  check: string;
  /** Sharing topics (SharingRule ids) the supporter will be told about. */
  share: string[];
  /** What you'll say to the person, in your words. */
  say: string;
};
export const emptyPlan = (): Plan => ({ concern: "", actions: [], owner: "", update: "", contingency: "", check: "", share: [], say: "" });

export type Source = { id: string; title: string; url: string; owner: string; checked: string; reviewBy: string; placeholder: boolean };
export type Variation = { id: string; label: string; text: string };
export type Path = { id: string; label: string; variation: string; answers: Record<string, string[]>; plan: Plan; expect: EndingId };

export type TrustData = {
  title: string;
  intro: string;
  scenarioVersion: string;
  mode: "formative" | "assessed";
  passMark: number;
  /** The Quarterly Budget Decision Lab's rule set the money card's carryover threshold uses (an effective-dated record). */
  ruleSetId: string;
  /** The internal follow-up window: configurable, never a statutory period. */
  windowDays: number;
  story: { setting: string; role: string; situation: string; temptation: string };
  participant: { name: string; about: string; goal: string };
  supporter: { name: string; relation: string; status: string };
  /** The person's recorded information-sharing preferences: the Tough Family Call's model. */
  sharing: SharingRule[];
  signals: Signal[];
  /** Notice signals to open before the first decision. */
  minOpen: number;
  steps: Step[];
  plan: PlanSpec;
  variations: Variation[];
  paths: Path[];
  endings: Record<EndingId, string>;
  debrief: string;
  sources: Source[];
  jobAid: { snippetId: string; why: string };
  related: { label: string; href: string; why: string }[];
  /** Why this block (the AI Learning Designer's selection rationale), versioned with the scenario. */
  rationale: {
    signal: string;
    themeId: string;
    behaviour: string;
    nonLearning: string;
    whyFit: string;
    existing: string;
    reviewer: string;
    measure: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  /** AI dialogue and drafting: a disabled stub in this release (no paid call). */
  ai: { dialogue: false };
  approval: {
    owner: string;
    operations: string;
    quality: string;
    policy: string;
    finance: string;
    clinical: string;
    partnerships: string;
    privacy: string;
    learning: string;
    approvedOn: string;
    reviewBy: string;
    scenarioReviewed: string;
  };
};

// ---------------------------------------------------------------------------------------------
// Shared rules: signals, money, sharing and complaints
// ---------------------------------------------------------------------------------------------

const inVariation = (x: { only: string[]; notIn: string[] }, v: string) => (!x.only.length || x.only.includes(v)) && !x.notIn.includes(v);

/**
  What a set of signals can support, deterministically. It names the type of unresolved problem and why, and that's
  all: no score, no probability, and never "will leave". A budget figure alone is at most a review with the person, and
  a known pause, hospital stay or the person's own cancellation explains a missed visit rather than raising it.
*/
export function triageFromSignals(signals: Pick<Signal, "group" | "kind" | "visits" | "reliability" | "budget">[]): { level: Triage; why: string[] } {
  const why: string[] = [];
  if (signals.some((s) => s.kind === "safety")) return { level: "immediate", why: ["A possible safety concern: the urgent process, now."] };
  const visits = signals.flatMap((s) => s.visits);
  const recovery = visits.filter((v) => (v.outcome === "missed" || v.outcome === "unknown") && RECOVERY_REASONS.includes(v.reason));
  const explained = visits.filter((v) => !RECOVERY_REASONS.includes(v.reason));
  if (recovery.length)
    why.push(`${recovery.length} visit${recovery.length === 1 ? "" : "s"} not delivered for a reason that needs recovery (${REASONS[recovery[0].reason]}).`);
  if (explained.length)
    why.push(`${explained.length} visit${explained.length === 1 ? "" : "s"} explained: ${[...new Set(explained.map((v) => REASONS[v.reason]))].join(", ")}.`);
  const disputed = signals.some((s) => s.kind === "billing" && s.reliability !== "verified");
  if (disputed) why.push("A charge the person doesn’t recognise: billing reviews it.");
  if (recovery.length || disputed) return { level: "recovery", why };
  const fig = signals.find((s) => s.budget)?.budget ?? null;
  if (fig) {
    const b = budgetSignal(fig, null);
    if (b.serviceGapCents > 0) {
      why.push(`A service gap of ${money(b.serviceGapCents)} with no known reason: ask the person.`);
      return { level: "review", why };
    }
    why.push("The balance is explained by known pauses, pending claims and scheduled services.");
  }
  if (signals.some((s) => s.kind === "transfer")) {
    why.push("The person has said what they want: ask what they need, and support it.");
    return { level: "review", why };
  }
  return { level: "context", why: why.length ? why : ["Nothing here needs action."] };
}

export type BudgetView = {
  lines: { id: string; label: string; cents: number | null; note: string; estimate: boolean }[];
  /** The dashboard's "about X% remains": shown, labelled, and never used as a measure of anything. */
  remainingShare: number;
  balanceCents: number;
  projectedClosingCents: number;
  serviceGapCents: number;
  carryover: Threshold | null;
  aboveCarryoverCents: number;
  notes: string[];
};

/** The money card (PRD section 6): delivered, claimed, pending and scheduled kept apart, the gap without known pauses, and the carryover threshold. */
export function budgetSignal(f: BudgetFigures, ruleSetId: string | null): BudgetView {
  const balance = f.quarterlyCents - f.claimedToDateCents;
  const pending = f.pendingClaimsCents ?? 0;
  const projected = balance - pending - f.scheduledRemainderCents;
  const gap = Math.max(0, f.plannedToDateCents - f.deliveredToDateCents - f.pausedCents);
  const rules = ruleSetId ? quarterRules(ruleSetId) : undefined;
  const carryover = rules ? carryoverThreshold(f.quarterlyCents, rules) : null;
  const notes = [
    "The balance shown is what has been processed. Delivered services still waiting to be claimed make it look higher than it is.",
    ...(f.pendingClaimsCents === null ? ["Whether another invoice is pending isn’t known yet: the projection may be lower."] : []),
    ...(f.pausedCents ? [`${money(f.pausedCents)} of planned services were paused at the person’s request: not a gap.`] : []),
    "A projected balance is a prompt to talk about the plan with the person: not a prediction about them, and not a reason to add a service.",
  ];
  return {
    lines: [
      { id: "planned", label: "Planned to date", cents: f.plannedToDateCents, note: `Agreed services scheduled through week ${f.week}`, estimate: false },
      { id: "delivered", label: "Delivered to date", cents: f.deliveredToDateCents, note: "Services that actually happened", estimate: false },
      {
        id: "claimed",
        label: "Processed (claimed) to date",
        cents: f.claimedToDateCents,
        note: `From the statement feed, updated ${f.feedUpdated}`,
        estimate: false,
      },
      {
        id: "pending",
        label: "Delivered, not yet claimed",
        cents: f.pendingClaimsCents,
        note: f.pendingClaimsCents === null ? "Not known yet" : "Not in the processed balance yet",
        estimate: true,
      },
      { id: "scheduled", label: "Scheduled for the rest of the quarter", cents: f.scheduledRemainderCents, note: "Agreed future services", estimate: true },
      { id: "projected", label: "Projected closing balance", cents: projected, note: "Balance less pending claims and scheduled services", estimate: true },
      { id: "gap", label: "Service gap (known pauses excluded)", cents: gap, note: "Planned less delivered less agreed pauses", estimate: false },
    ],
    remainingShare: f.quarterlyCents > 0 ? Math.round((balance / f.quarterlyCents) * 100) : 0,
    balanceCents: balance,
    projectedClosingCents: projected,
    serviceGapCents: gap,
    carryover,
    aboveCarryoverCents: carryover ? carryoverOf(projected, carryover.cents).aboveCents : 0,
    notes,
  };
}

/** The topics a supporter would be told that the person hasn't agreed to share (lib/familyCall's preference model). */
export const restrictedTopics = (sharing: SharingRule[], topics: string[]) => sharing.filter((r) => topics.includes(r.id) && !r.allowed);

/**
  The Tough Family Call's reviewed complaint wording (its "Discourages or dismisses a complaint" risk, in
  content/familyCalls) and its hedging rule (lib/familyCall `interpret`), applied to what a learner writes. Never a
  copy: if the family call's reviewed phrases change, this reads the new ones.
*/
const COMPLAINT_RISK = FIONA_GARDENER.family?.intents.find((i) => i.kind === "risk" && i.sets.includes("complaintDiscouraged"));
export const complaintWording = () => COMPLAINT_RISK?.patterns ?? [];
export function discouragesComplaint(text: string): { quote: string; hedged: boolean } | null {
  const family = FIONA_GARDENER.family;
  if (!COMPLAINT_RISK || !family || !text.trim()) return null;
  const r = interpret({ phone: { ...FIONA_GARDENER.phone, restricted: [] }, family: { ...family, intents: [COMPLAINT_RISK], disclosureRisk: "" } }, text);
  const tag = r.risks.find((t) => t.id === COMPLAINT_RISK.evidence);
  return tag ? { quote: tag.quote, hedged: tag.hedged } : null;
}

/** Whether the evidence chosen covers what a status needs. A record that isn't verified (or the person's own report) doesn't count. */
export function evidenceCovers(chosen: Pick<Signal, "kind" | "reliability">[], needs: EvidenceKind[]) {
  // The person's own words are reported by nature: they count as her view (and her choice), never as a delivery record.
  const ok = (s: Pick<Signal, "kind" | "reliability">) =>
    s.reliability === "verified" || ((s.kind === "person" || s.kind === "transfer") && s.reliability === "reported");
  return needs.every((k) => chosen.some((s) => s.kind === k && ok(s)));
}

/**
  The Work Tool's guard on a workflow status (PRD section 16): "" when the move is allowed, or the reason. A safety
  concern never leaves the urgent process; "resolved" needs the evidence the issue names; a transfer needs the person's
  own choice on record. There is deliberately no status that withdraws, closes or downgrades a complaint: its status
  lives in the complaints system.
*/
export function workflowProblem(
  issue: { signals: Pick<Signal, "group" | "kind" | "visits" | "reliability" | "budget">[]; transferChoice: boolean; resolveNeeds: EvidenceKind[] },
  to: Workflow,
  evidence: Pick<Signal, "kind" | "reliability">[],
): string {
  if (triageFromSignals(issue.signals).level === "immediate" && to !== "escalated")
    return "A possible safety concern stays with the urgent clinical and incident process. It can’t be moved into the 28-day workflow.";
  if (to === "resolved" && !evidenceCovers(evidence, issue.resolveNeeds))
    return `“${WORKFLOW.resolved}” needs ${issue.resolveNeeds.map((k) => EVIDENCE_KINDS[k].toLowerCase()).join(" and ")}, ticked from what happened. A booking or a message isn’t resolution.`;
  if (to === "transferred" && !(issue.transferChoice && evidence.some((e) => e.kind === "transfer")))
    return `“${WORKFLOW.transferred}” needs the person’s own decision, ticked from what happened. A move is never assumed, and never recorded as a failure.`;
  return "";
}

// ---------------------------------------------------------------------------------------------
// The learner's state, and its moves
// ---------------------------------------------------------------------------------------------

export type TrustState = {
  variation: string;
  opened: string[];
  answers: Record<string, string[]>;
  plan: Plan | null;
  proposed: boolean;
};
export const emptyState = (variation = ""): TrustState => ({ variation, opened: [], answers: {}, plan: null, proposed: false });

export type Move = { do: "open"; signal: string } | { do: "answer"; step: string; options: string[] } | { do: "plan"; plan: Plan } | { do: "propose" };
export class MoveError extends Error {}

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function cleanPlan(d: Pick<TrustData, "plan" | "sharing">, v: unknown): Plan {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const one = (x: unknown, list: Option[]) => (typeof x === "string" && list.some((y) => y.id === x) ? x : "");
  const many = (x: unknown, allowed: string[]) => [
    ...new Set((Array.isArray(x) ? x : []).filter((y): y is string => typeof y === "string" && allowed.includes(y))),
  ];
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return {
    concern: text(o.concern, 400),
    actions: many(
      o.actions,
      d.plan.actions.map((a) => a.id),
    ),
    owner: typeof o.owner === "string" && (OWNER_IDS as string[]).includes(o.owner) ? (o.owner as OwnerRole) : "",
    update: one(o.update, d.plan.updates),
    contingency: one(o.contingency, d.plan.contingencies),
    check: one(o.check, d.plan.checks),
    share: many(
      o.share,
      d.sharing.map((r) => r.id),
    ),
    say: text(o.say, 600),
  };
}

export function parseMove(raw: unknown): Move | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && ID.test(v) ? v : "");
  switch (o.do) {
    case "open":
      return id(o.signal) ? { do: "open", signal: id(o.signal) } : null;
    case "answer":
      return id(o.step) && Array.isArray(o.options) ? { do: "answer", step: id(o.step), options: o.options.map(id).filter(Boolean).slice(0, 12) } : null;
    case "plan":
      return o.plan && typeof o.plan === "object" ? { do: "plan", plan: o.plan as Plan } : null;
    case "propose":
      return { do: "propose" };
    default:
      return null;
  }
}

/** The case's steps, signals and options in this attempt's variation. */
export const stepsFor = (d: Pick<TrustData, "steps">, v: string) => d.steps.filter((s) => inVariation(s, v));
export const optionsFor = (list: Option[], v: string) => list.filter((o) => inVariation(o, v));
/** An option as read in a variation: its overrides applied. */
export function readOption(o: Option, v: string): Option {
  const x = o.in[v];
  if (!x) return o;
  return {
    ...o,
    ...(x.levels && { levels: x.levels }),
    ...(x.codes && { codes: x.codes }),
    ...(x.feedback && { feedback: x.feedback }),
    ...(x.reply && { reply: x.reply }),
    ...(x.ending && { ending: x.ending }),
  };
}
const stepsIn = (d: TrustData, v: string, ph: Phase) => stepsFor(d, v).filter((s) => s.phase === ph);
const answered = (s: TrustState, st: Step) => Boolean(s.answers[st.id]?.length);

/** Where the attempt is: the phase whose decisions are still open, or "submit". */
export function phaseOf(d: TrustData, s: TrustState): Phase | "submit" {
  for (const ph of PHASE_ORDER) {
    if (ph === "act" && !s.proposed) return "act";
    if (stepsIn(d, s.variation, ph).some((st) => !answered(s, st))) return ph;
  }
  return "submit";
}
const reached = (d: TrustData, s: TrustState, ph: Phase) => {
  const now = phaseOf(d, s);
  return now === "submit" || PHASE_ORDER.indexOf(now) >= PHASE_ORDER.indexOf(ph);
};

/** Signals visible now: the variation's, released by phase and checkpoint, and any requested artefact once requested. */
export function visibleSignals(d: TrustData, s: TrustState): Signal[] {
  const chosen = new Set(Object.values(s.answers).flat());
  const revealed = new Set(
    stepsFor(d, s.variation).flatMap((st) =>
      optionsFor(st.options, s.variation)
        .filter((o) => o.reveals && chosen.has(o.id))
        .map((o) => o.reveals),
    ),
  );
  const day7Done = stepsFor(d, s.variation)
    .filter((st) => st.checkpoint === "day7")
    .every((st) => answered(s, st));
  return d.signals.filter(
    (x) => inVariation(x, s.variation) && reached(d, s, x.phase) && (!x.hidden || revealed.has(x.id)) && (x.checkpoint !== "day28" || day7Done),
  );
}

/** The options a step offers in this attempt: its authored ones, or for an evidence step, the checkpoint's signals as released. */
export function stepOptions(d: TrustData, s: TrustState, st: Step): Option[] {
  if (st.kind !== "evidence") return optionsFor(st.options, s.variation).map((o) => readOption(o, s.variation));
  return visibleSignals(d, s)
    .filter((x) => x.checkpoint === st.checkpoint)
    .map((x) => ({ ...blankOption(x.id), text: `${x.title}: ${x.noticed}` }));
}

/** Whether a step can be answered now, and if not, why. */
export function stepOpen(d: TrustData, s: TrustState, st: Step): { ok: boolean; why: string } {
  const phase = phaseOf(d, s);
  if (phase !== st.phase) return { ok: false, why: phase === "submit" ? "The case is finished." : `That comes in “${PHASES[st.phase]}”.` };
  if (st.phase === "notice" && s.opened.filter((id) => d.signals.find((x) => x.id === id)?.phase === "notice").length < d.minOpen)
    return { ok: false, why: `Open at least ${d.minOpen} signal cards first: the dashboard isn’t the whole story.` };
  if (st.phase === "act" && st.afterPlan && !s.proposed) return { ok: false, why: "Propose your plan first." };
  const earlier = stepsIn(d, s.variation, st.phase);
  for (const e of earlier.slice(0, earlier.indexOf(st))) if (!answered(s, e)) return { ok: false, why: `Answer “${e.title}” first.` };
  if (st.needsAlt) {
    const alt = stepsFor(d, s.variation).some((x) => optionsFor(x.options, s.variation).some((o) => o.alt && s.answers[x.id]?.includes(o.id)));
    if (!alt) return { ok: false, why: "Name at least one alternative explanation first." };
  }
  return { ok: true, why: "" };
}

/** What's still missing from a plan before it can be proposed. */
export function planProblems(d: TrustData, p: Plan | null): string[] {
  if (!p) return ["Build the plan first."];
  const out: string[] = [];
  if (words(p.concern) < 3) out.push("Write the concern in her words (a few words at least).");
  if (!p.actions.length) out.push("Choose at least one action.");
  if (!p.owner) out.push("Name the accountable owner of the main action.");
  if (!p.update) out.push("Say when she’ll next hear from you, or what will trigger the update.");
  if (!p.contingency) out.push("Say what happens if the first fix fails.");
  if (!p.check) out.push("Say how you’ll check it worked.");
  return out;
}

/**
  One move. The order is the playbook's: open signals and answer Notice; Ask; build and propose the plan, then the
  act-phase decisions; the checkpoints; Learn. An answer, once given, stands; sending it again changes nothing, so a
  retried request never duplicates a choice. The plan can be edited until it is proposed.
*/
export function applyMove(d: TrustData, s: TrustState, m: Move): TrustState {
  switch (m.do) {
    case "open": {
      if (!visibleSignals(d, s).some((x) => x.id === m.signal)) throw new MoveError("That signal isn’t on the board.");
      return s.opened.includes(m.signal) ? s : { ...s, opened: [...s.opened, m.signal] };
    }
    case "answer": {
      const st = stepsFor(d, s.variation).find((x) => x.id === m.step);
      if (!st) throw new MoveError("That decision isn’t in this case.");
      const picked = [...new Set(m.options)];
      const had = s.answers[st.id];
      if (had?.length) {
        if (had.length === picked.length && had.every((x) => picked.includes(x))) return s;
        throw new MoveError("You’ve already decided this one. The debrief shows how it went.");
      }
      const open = stepOpen(d, s, st);
      if (!open.ok) throw new MoveError(open.why);
      const allowed = stepOptions(d, s, st).map((o) => o.id);
      if (!picked.length || picked.some((x) => !allowed.includes(x))) throw new MoveError("That isn’t one of the choices.");
      const max = st.kind === "single" ? 1 : st.max;
      if (picked.length < Math.max(1, st.min) || picked.length > max)
        throw new MoveError(max === 1 ? "Choose one." : `Choose ${st.min === max ? st.min : `between ${Math.max(1, st.min)} and ${max}`}.`);
      return { ...s, answers: { ...s.answers, [st.id]: picked } };
    }
    case "plan": {
      const p = cleanPlan(d, m.plan);
      if (s.plan && JSON.stringify(s.plan) === JSON.stringify(p)) return s;
      if (s.proposed) throw new MoveError("The plan is proposed: the case has moved on.");
      if (phaseOf(d, s) !== "act") throw new MoveError("Finish Notice and Ask first: hear her before you plan.");
      return { ...s, plan: p };
    }
    case "propose": {
      if (s.proposed) return s;
      if (phaseOf(d, s) !== "act") throw new MoveError("Finish Notice and Ask first.");
      const problems = planProblems(d, s.plan);
      if (problems.length) throw new MoveError(`Not yet. ${problems[0]}`);
      return { ...s, proposed: true };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

export type Debrief = {
  ending: EndingId;
  endingLabel: string;
  endingText: string;
  defensible: boolean;
  critical: { code: Code; text: string; correction: string; source: { title: string; url: string } }[];
  codes: Code[];
  dims: { dim: Dim; label: string; level: Level; words: string; why: string }[];
  score: number;
  max: number;
  passMark: number;
  passed: boolean | null;
  mode: "formative" | "assessed";
  choices: { step: string; phase: Phase; title: string; chosen: string[]; feedback: string[]; revised: boolean }[];
  conversation: { who: "you" | "her"; text: string }[];
  revised: { from: string; to: string } | null;
  plan: {
    concern: string;
    actions: { text: string; feedback: string }[];
    owner: string;
    update: string;
    contingency: string;
    check: string;
    shared: { label: string; allowed: boolean }[];
    complaint: { quote: string; hedged: boolean } | null;
  } | null;
  signals: { level: Triage; label: string; why: string[] };
  budget: BudgetView | null;
  missed: { text: string; feedback: string }[];
  summary: string;
  sources: { id: string; title: string; url: string; owner: string }[];
  variation: { label: string; text: string } | null;
  versions: { trust: string; rubric: string; engine: string; scenario: string; rules: string };
};

/** Every choice in this attempt, as read in its variation: step by step, then the plan. */
function choicesOf(d: TrustData, s: TrustState) {
  const v = s.variation;
  const revisedSteps = new Set(stepsFor(d, v).flatMap((st) => (st.revises && answered(s, st) ? [st.revises] : [])));
  const steps = stepsFor(d, v).map((st) => {
    const opts = stepOptions(d, s, st);
    const chosen = (s.answers[st.id] ?? []).map((id) => opts.find((o) => o.id === id)).filter((o): o is Option => Boolean(o));
    return { st, chosen, revised: revisedSteps.has(st.id) };
  });
  const p = s.plan;
  const planOpts = p
    ? [
        ...optionsFor(d.plan.actions, v)
          .filter((o) => p.actions.includes(o.id))
          .map((o) => readOption(o, v)),
        ...[
          d.plan.updates.find((o) => o.id === p.update),
          d.plan.contingencies.find((o) => o.id === p.contingency),
          d.plan.checks.find((o) => o.id === p.check),
        ]
          .filter((o): o is Option => Boolean(o))
          .map((o) => readOption(o, v)),
      ]
    : [];
  return { steps, planOpts };
}

export function buildDebrief(d: TrustData, s: TrustState): Debrief {
  const v = s.variation;
  const { steps, planOpts } = choicesOf(d, s);
  const scored = [...steps.filter((x) => !x.revised).flatMap((x) => x.chosen), ...planOpts];
  const codes = new Set<Code>(scored.flatMap((o) => o.codes));
  const extra: Partial<Record<Dim, Level[]>> = {};
  const add = (dim: Dim, l: Level) => (extra[dim] ??= []).push(l);
  // The plan's own rules: who owns it, who is told what, whether it fixes anything, and what it says.
  const p = s.plan;
  let complaint: { quote: string; hedged: boolean } | null = null;
  if (p) {
    const actions = optionsFor(d.plan.actions, v).filter((o) => p.actions.includes(o.id));
    if (actions.length && actions.every((a) => a.contactOnly)) codes.add("callOnly");
    if (!p.owner || !OPERATIONAL.includes(p.owner)) codes.add("noOwner");
    else add("action", actions.some((a) => a.owner === p.owner) ? 3 : 2);
    const restricted = restrictedTopics(d.sharing, p.share);
    if (restricted.length) codes.add("restrictedDisclosure");
    else if (p.share.length) add("voice", 3);
    complaint = discouragesComplaint(p.say);
    if (complaint && !complaint.hedged) codes.add("complaintDiscouraged");
  }
  // "Did it help?": a status that needs evidence, without it, is coded, and never reaches its ending.
  const unverifiedEnding = new Set<string>();
  for (const x of steps) {
    for (const o of x.chosen) {
      if (!o.evidence.length) continue;
      const evStep = steps.find((y) => y.st.id === x.st.evidenceStep);
      const chosenSignals = (evStep?.chosen ?? []).map((c) => d.signals.find((sg) => sg.id === c.id)).filter((sg): sg is Signal => Boolean(sg));
      if (!evidenceCovers(chosenSignals, o.evidence)) {
        codes.add("noEvidence");
        unverifiedEnding.add(o.id);
      }
    }
  }
  const capOf = (dim: Dim): Level => Math.min(3, ...[...codes].map((c) => CODE_CAPS[c][dim] ?? 3)) as Level;
  const dims = DIM_ORDER.map((dim) => {
    const ls = [...scored.flatMap((o) => (o.levels[dim] !== undefined ? [o.levels[dim]!] : [])), ...(extra[dim] ?? [])];
    const base = (ls.length ? Math.min(3, ...ls) : 0) as Level;
    const level = Math.min(base, capOf(dim)) as Level;
    return { dim, label: DIMS[dim], level, words: LEVELS[level], why: DIM_HINTS[dim] };
  });
  const score = dims.reduce((t, x) => t + x.level, 0);
  const source = (id: string) => d.sources.find((x) => x.id === id);
  const critical = CRITICAL.filter((c) => codes.has(c)).map((code) => {
    const src = source(CORRECTIONS[code].source);
    return { code, text: CODES[code], correction: CORRECTIONS[code].text, source: { title: src?.title ?? "", url: src?.url ?? "" } };
  });
  const endingsReached = scored.flatMap((o) => (o.ending && !unverifiedEnding.has(o.id) ? [o.ending] : []));
  const ending: EndingId = critical.length
    ? "unsafe"
    : // A status claimed without evidence is coded either way; the ending is "not verified" only if nothing later was verified.
      codes.has("noEvidence") && !endingsReached.length
      ? "unverified"
      : (ENDING_RANK.find((e) => endingsReached.includes(e)) ?? "open");
  // Her words, as the conversation went: what she said depends on whether she'd been heard.
  const flags = new Set<string>();
  const conversation: Debrief["conversation"] = [];
  for (const x of steps.filter((y) => y.st.phase === "ask"))
    for (const o of x.chosen) {
      const heard = o.needs.every((f) => flags.has(f));
      const line = heard ? o.reply : o.guarded || o.reply;
      if (line) conversation.push({ who: "you", text: o.text }, { who: "her", text: line });
      for (const f of o.sets) flags.add(f);
    }
  const revisedStep = steps.find((x) => x.st.revises && x.chosen.length);
  const before = revisedStep ? steps.find((x) => x.st.id === revisedStep.st.revises) : undefined;
  const revised =
    revisedStep && before?.chosen.length && before.chosen[0].text !== revisedStep.chosen[0].text
      ? { from: before.chosen.map((o) => o.text).join("; "), to: revisedStep.chosen.map((o) => o.text).join("; ") }
      : null;
  const noticeSignals = d.signals.filter((x) => inVariation(x, v) && x.phase !== "check");
  const sig = triageFromSignals(noticeSignals.filter((x) => !x.hidden || s.opened.includes(x.id)));
  const figures = noticeSignals.find((x) => x.budget)?.budget ?? null;
  const allChosen = new Set([...steps.flatMap((x) => x.chosen.map((o) => o.id)), ...planOpts.map((o) => o.id)]);
  const missed = [
    ...stepsFor(d, v).flatMap((st) => optionsFor(st.options, v).map((o) => readOption(o, v))),
    ...optionsFor(d.plan.actions, v).map((o) => readOption(o, v)),
  ].filter((o) => o.key && !allChosen.has(o.id));
  const cited = [...new Set([...critical.map((c) => CORRECTIONS[c.code].source), "responsibilities", "budgets"])];
  const variation = d.variations.find((x) => x.id === v);
  return {
    ending,
    endingLabel: ENDINGS[ending],
    endingText: d.endings[ending] || ENDINGS[ending],
    defensible: DEFENSIBLE.includes(ending),
    critical,
    codes: [...codes],
    dims,
    score,
    max: MAX_SCORE,
    passMark: d.passMark,
    passed: d.mode === "assessed" ? !critical.length && score >= d.passMark : null,
    mode: d.mode,
    choices: steps
      .filter((x) => x.chosen.length)
      .map((x) => ({
        step: x.st.id,
        phase: x.st.phase,
        title: x.st.title,
        chosen: x.chosen.map((o) => o.text),
        feedback: x.chosen.map((o) => o.feedback).filter(Boolean),
        revised: x.revised,
      })),
    conversation,
    revised,
    plan: p
      ? {
          concern: p.concern,
          actions: optionsFor(d.plan.actions, v)
            .filter((o) => p.actions.includes(o.id))
            .map((o) => readOption(o, v))
            .map((o) => ({ text: o.text, feedback: o.feedback })),
          owner: p.owner ? OWNER_ROLES[p.owner] : "",
          update: d.plan.updates.find((o) => o.id === p.update)?.text ?? "",
          contingency: d.plan.contingencies.find((o) => o.id === p.contingency)?.text ?? "",
          check: d.plan.checks.find((o) => o.id === p.check)?.text ?? "",
          shared: d.sharing.filter((r) => p.share.includes(r.id)).map((r) => ({ label: r.label, allowed: r.allowed })),
          complaint,
        }
      : null,
    signals: { level: sig.level, label: TRIAGE[sig.level], why: sig.why },
    budget: figures ? budgetSignal(figures, d.ruleSetId) : null,
    missed: missed.map((o) => ({ text: o.text, feedback: o.feedback })),
    summary: d.debrief,
    sources: cited.flatMap((id) => {
      const src = source(id);
      return src ? [{ id, title: src.title, url: src.url, owner: src.owner }] : [];
    }),
    variation: variation ? { label: variation.label, text: variation.text } : null,
    versions: { trust: TRUST_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: d.scenarioVersion, rules: d.ruleSetId },
  };
}

export function submitProblems(d: TrustData, s: TrustState): string[] {
  const ph = phaseOf(d, s);
  return ph === "submit" ? [] : [`Finish the case first (${PHASES[ph]}: ${PHASE_QUESTIONS[ph].toLowerCase()})`];
}

// ---------------------------------------------------------------------------------------------
// What the learner's page holds
// ---------------------------------------------------------------------------------------------

/** The learner's view now: what has arrived, the decisions up to now, the plan. No feedback, levels, codes or endings. */
export function trustView(d: TrustData, s: TrustState) {
  const v = s.variation;
  const phase = phaseOf(d, s);
  const visible = visibleSignals(d, s);
  const flags = new Set<string>();
  const shownSteps = stepsFor(d, v).filter((st) => phase === "submit" || PHASE_ORDER.indexOf(st.phase) <= PHASE_ORDER.indexOf(phase));
  const steps = shownSteps.map((st) => {
    const opts = stepOptions(d, s, st);
    const chosen = (s.answers[st.id] ?? []).map((id) => opts.find((o) => o.id === id)).filter((o): o is Option => Boolean(o));
    const replies = chosen.flatMap((o) => {
      const heard = o.needs.every((f) => flags.has(f));
      const line = heard ? o.reply : o.guarded || o.reply;
      return line ? [{ option: o.text, line }] : [];
    });
    for (const o of chosen) for (const f of o.sets) flags.add(f);
    const open = stepOpen(d, s, st);
    return {
      id: st.id,
      phase: st.phase,
      kind: st.kind,
      title: st.title,
      prompt: st.prompt,
      min: Math.max(1, st.min),
      max: st.kind === "single" ? 1 : st.max,
      options: opts.map((o) => ({ id: o.id, text: o.text })),
      answer: s.answers[st.id] ?? [],
      replies,
      open: open.ok && !answered(s, st),
      why: answered(s, st) ? "" : open.why,
      afterPlan: st.afterPlan,
    };
  });
  const variation = d.variations.find((x) => x.id === v);
  return {
    phase,
    phases: PHASE_ORDER.map((ph) => ({
      id: ph,
      label: PHASES[ph],
      question: PHASE_QUESTIONS[ph],
      current: ph === phase,
      done: phase === "submit" || PHASE_ORDER.indexOf(ph) < PHASE_ORDER.indexOf(phase as Phase),
    })),
    minOpen: d.minOpen,
    signals: visible.map((x) => ({
      id: x.id,
      phase: x.phase,
      checkpoint: x.checkpoint,
      group: x.group,
      title: x.title,
      noticed: x.noticed,
      matters: x.matters,
      alternatives: x.alternatives,
      verify: x.verify,
      canAct: x.canAct,
      source: x.source,
      updated: x.updated,
      reliability: x.reliability,
      reliabilityLabel: RELIABILITY[x.reliability],
      kind: x.kind,
      visits: x.visits.map((y) => ({ date: y.date, outcome: OUTCOMES[y.outcome], reason: REASONS[y.reason], note: y.note })),
      budget: x.budget ? budgetSignal(x.budget, d.ruleSetId) : null,
      opened: s.opened.includes(x.id),
    })),
    steps,
    plan:
      phase === "submit" || PHASE_ORDER.indexOf(phase as Phase) >= PHASE_ORDER.indexOf("act")
        ? {
            value: s.plan,
            proposed: s.proposed,
            problems: planProblems(d, s.plan),
            actions: optionsFor(d.plan.actions, v).map((o) => ({ id: o.id, text: o.text, owner: o.owner ? OWNER_ROLES[o.owner] : "" })),
            owners: OWNER_IDS.map((id) => ({ id, label: OWNER_ROLES[id] })),
            updates: optionsFor(d.plan.updates, v).map((o) => ({ id: o.id, text: o.text })),
            contingencies: optionsFor(d.plan.contingencies, v).map((o) => ({ id: o.id, text: o.text })),
            checks: optionsFor(d.plan.checks, v).map((o) => ({ id: o.id, text: o.text })),
            // The topics only: whether each is allowed is on the preferences card, for the learner to check.
            sharing: d.sharing.map((r) => ({ id: r.id, label: r.label })),
          }
        : null,
    // The variation's text only: its label ("She chooses to move") would give the ending away.
    variation: variation ? { text: variation.text } : null,
  };
}
export type TrustView = ReturnType<typeof trustView>;

/** The retry variation for an attempt: the first attempt plays the case as written, then each variation in turn. */
export const variationFor = (d: Pick<TrustData, "variations">, attemptNo: number) =>
  attemptNo <= 1 || !d.variations.length ? "" : d.variations[(attemptNo - 2) % d.variations.length].id;

// ---------------------------------------------------------------------------------------------
// Authoring: playing paths, the case check, the sign-off and the readers' copy
// ---------------------------------------------------------------------------------------------

/** Plays an authored path through the engine, as a learner would: every signal opened, each step in order, the plan proposed. */
export function playPath(d: TrustData, p: Path) {
  let s = emptyState(p.variation);
  const problems: string[] = [];
  const openAll = () => {
    for (const x of visibleSignals(d, s)) if (!s.opened.includes(x.id)) s = applyMove(d, s, { do: "open", signal: x.id });
  };
  for (let guard = 0; guard < 40 && phaseOf(d, s) !== "submit"; guard++) {
    openAll();
    const ph = phaseOf(d, s);
    if (ph === "act" && !s.proposed) {
      try {
        s = applyMove(d, s, { do: "plan", plan: p.plan });
        s = applyMove(d, s, { do: "propose" });
      } catch (e) {
        problems.push(`the plan: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
      continue;
    }
    const st = stepsFor(d, s.variation).find((x) => x.phase === ph && !answered(s, x));
    if (!st) break;
    const pick = p.answers[st.id];
    if (!pick?.length) {
      problems.push(`no answer for “${st.title}”.`);
      break;
    }
    try {
      s = applyMove(d, s, { do: "answer", step: st.id, options: pick });
    } catch (e) {
      problems.push(`“${st.title}”: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  openAll();
  return { state: s, debrief: buildDebrief(d, s), problems };
}

const REAL_ID = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?61|0)[2-478](?:[ -]?\d){8}|\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/;
const SCORE_WORDS = /\b(churn (?:score|probability)|likelihood to churn|\d{1,3}\s?% (?:chance|likely|risk))\b/i;

/** The structural check: a case that holds together, whatever its sign-off. Run before the demo sign-off wrapper. */
export function caseProblems(d: TrustData): string[] {
  const where = `“${d.title || "28-Day Trust Check"}”`;
  const out: string[] = [];
  if (!d.title) out.push(`${where} needs a title.`);
  if (!d.scenarioVersion) out.push(`${where} needs its scenario version.`);
  if (!d.participant.name) out.push(`${where} needs the participant.`);
  if (!(d.windowDays >= 1 && d.windowDays <= 90)) out.push(`${where}: the follow-up window is between 1 and 90 days.`);
  if (!quarterRules(d.ruleSetId)) out.push(`${where}: choose a budget rule set from the Quarterly Budget Decision Lab’s register.`);
  if (!d.sharing.some((r) => r.allowed) || !d.sharing.some((r) => !r.allowed))
    out.push(`${where}: the sharing preferences need something the supporter may be told and something they may not.`);
  const ids = [...d.signals.map((x) => x.id), ...d.steps.map((x) => x.id)];
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) out.push(`${where}: the id “${id}” is used twice.`);
  const signalIds = new Set(d.signals.map((x) => x.id));
  const variations = new Set(["", ...d.variations.map((x) => x.id)]);
  const allOptions = [...d.steps.flatMap((st) => st.options), ...d.plan.actions, ...d.plan.updates, ...d.plan.contingencies, ...d.plan.checks];
  for (const o of allOptions) {
    if (!o.text || !o.feedback) out.push(`${where}: the choice “${o.text || o.id}” needs its text and feedback.`);
    if (o.reveals && !signalIds.has(o.reveals)) out.push(`${where}: “${o.text}” reveals “${o.reveals}”, which isn’t a signal.`);
    for (const k of [...o.only, ...o.notIn, ...Object.keys(o.in)]) if (!variations.has(k)) out.push(`${where}: “${o.text}” refers to the variation “${k}”.`);
  }
  for (const x of d.signals) {
    if (!x.title || !x.noticed || !x.source || !x.updated)
      out.push(`${where}: the signal “${x.title || x.id}” needs what was noticed, its source and when it was updated.`);
    if (x.phase === "notice" && (!x.matters || !x.alternatives || !x.verify || !x.canAct))
      out.push(`${where}: the signal “${x.title || x.id}” needs why it may matter, the alternatives, what to verify and who can act.`);
    if (x.checkpoint && x.phase !== "check") out.push(`${where}: “${x.title}” is a checkpoint record, so it belongs to Check.`);
    if (x.hidden && !allOptions.some((o) => o.reveals === x.id)) out.push(`${where}: the hidden signal “${x.title}” is never revealed.`);
  }
  for (const v of variations) {
    const label = v ? `in “${d.variations.find((x) => x.id === v)?.label}”` : "as written";
    const steps = stepsFor(d, v);
    for (const ph of PHASE_ORDER)
      if (ph !== "act" && !steps.some((st) => st.phase === ph)) out.push(`${where} ${label}: it needs a decision in “${PHASES[ph]}”.`);
    if (d.signals.filter((x) => inVariation(x, v) && x.phase === "notice" && !x.hidden).length < d.minOpen)
      out.push(`${where} ${label}: fewer notice signals than learners must open.`);
    if (!steps.some((st) => st.needsAlt)) out.push(`${where} ${label}: the triage must need an alternative explanation first.`);
    if (!steps.some((st) => st.options.some((o) => o.alt && inVariation(o, v)))) out.push(`${where} ${label}: offer at least one alternative explanation.`);
    for (const st of steps) {
      const opts = optionsFor(st.options, v).map((o) => readOption(o, v));
      if (st.kind !== "evidence" && opts.length < 2) out.push(`${where} ${label}: “${st.title}” needs at least two choices.`);
      if (st.kind !== "evidence" && !opts.some((o) => !o.codes.some((c) => CRITICAL.includes(c))))
        out.push(`${where} ${label}: “${st.title}” has no safe choice.`);
      if (st.revises && !steps.some((x) => x.id === st.revises && x.phase !== "learn"))
        out.push(`${where} ${label}: “${st.title}” revises a step that isn’t there.`);
      if (st.kind === "evidence" && !d.signals.some((x) => x.checkpoint === st.checkpoint && inVariation(x, v)))
        out.push(`${where} ${label}: “${st.title}” has no checkpoint records.`);
      for (const o of opts.filter((x) => x.evidence.length))
        if (!st.evidenceStep || !steps.some((x) => x.id === st.evidenceStep && x.kind === "evidence"))
          out.push(`${where} ${label}: “${o.text}” needs evidence, so its step needs an evidence step.`);
    }
  }
  if (!d.plan.actions.length || !d.plan.updates.length || !d.plan.contingencies.length || !d.plan.checks.length)
    out.push(`${where}: the plan builder needs actions, updates, contingencies and checks.`);
  if (!d.plan.actions.some((a) => a.owner && OPERATIONAL.includes(a.owner))) out.push(`${where}: at least one plan action needs an operational owner.`);
  for (const e of DEFENSIBLE) if (!d.endings[e]) out.push(`${where}: the ending “${ENDINGS[e]}” needs its words.`);
  if (!d.endings.unsafe) out.push(`${where}: the critical-error ending needs its words.`);
  for (const id of Object.values(CORRECTIONS).map((c) => c.source))
    if (!d.sources.some((x) => x.id === id)) out.push(`${where}: the corrections cite “${id}”, which isn’t in the source list.`);
  const text = JSON.stringify({ ...d, approval: {}, sources: [] });
  if (REAL_ID.test(text)) out.push(`${where} looks like it holds a real email, phone number or identifier. Use fictional details only.`);
  if (SCORE_WORDS.test(JSON.stringify(d.signals)))
    out.push(`${where}: a signal card shows a churn score or probability. Signals describe what was noticed, never a prediction.`);
  if (d.ai.dialogue !== false) out.push(`${where}: AI dialogue is off in this release.`);
  // Every authored path plays to the ending it names; the defensible ones without a critical error; at least two different defensible endings.
  if (!out.length) {
    for (const p of d.paths) {
      const r = playPath(d, p);
      for (const pr of r.problems) out.push(`${where}, path “${p.label}”: ${pr}`);
      if (r.debrief.ending !== p.expect) out.push(`${where}, path “${p.label}” ends as “${ENDINGS[r.debrief.ending]}”, not “${ENDINGS[p.expect]}”.`);
      if (DEFENSIBLE.includes(p.expect) && r.debrief.critical.length)
        out.push(`${where}, path “${p.label}” has a critical error: ${r.debrief.critical[0].text}.`);
    }
    if (new Set(d.paths.filter((p) => DEFENSIBLE.includes(p.expect)).map((p) => p.expect)).size < 2)
      out.push(`${where} needs authored paths to at least two different defensible endings.`);
  }
  return [...new Set(out)];
}

export const trustApproved = (d: Pick<TrustData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.quality && a.policy && a.finance && a.clinical && a.partnerships && a.privacy && a.learning && a.approvedOn);
};

/** What "Publish anyway" can't waive: the sources, the rule set, the Job Aid, the sign-off, its scenario version and review date. */
export function trustSignOffProblems(d: TrustData, today: string): string[] {
  const where = `“${d.title || "28-Day Trust Check"}”`;
  const out: string[] = [];
  for (const s of d.sources) {
    if (s.placeholder) out.push(`${where} cites “${s.title}”. Replace it with Trilogy Care’s current procedure and its owner before publishing.`);
    else if (s.reviewBy && s.reviewBy < today) out.push(`${where} cites “${s.title}”, which was due for review on ${s.reviewBy}.`);
  }
  const rs = ruleStatus(d.ruleSetId, today);
  if (rs !== "current")
    out.push(`${where}: its budget rule set is ${rs === "withdrawn" ? "withdrawn" : "due for review"}. Review the carryover and AT–HM claims first.`);
  if (!d.jobAid.snippetId) out.push(`${where}: link the 28-Day Trust Check Job Aid.`);
  if (d.mode === "assessed" && !(d.passMark >= 1 && d.passMark <= MAX_SCORE))
    out.push(`${where}: an assessed version needs a pass mark from 1 to ${MAX_SCORE}.`);
  if (!trustApproved(d))
    out.push(
      `${where}: record the owner (Partner Enablement), Care Coordination operations, Quality/complaints, the Support at Home policy and budgets owner, Finance/billing, clinical governance, Partnerships, privacy/security and the learning reviewer, and the date.`,
    );
  else if (d.approval.scenarioReviewed !== d.scenarioVersion)
    out.push(`${where}: Review required. The reviewers signed off ${d.approval.scenarioReviewed || "no scenario version"}, and this is ${d.scenarioVersion}.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`${where} was due for review on ${d.approval.reviewBy}.`);
  return [...new Set(out)];
}

/** Whether a new attempt can start today: a withdrawn rule set stops it; one due for review stops assessed attempts. */
export function trustUsable(d: Pick<TrustData, "ruleSetId" | "mode">, today: string): { ok: boolean; reason: string } {
  const rs = ruleStatus(d.ruleSetId, today);
  if (rs === "withdrawn") return { ok: false, reason: "This case has been withdrawn while the budget rules it rests on are reviewed." };
  if (rs === "review-required" && d.mode === "assessed")
    return { ok: false, reason: "Review required: the budget rules this assessed case rests on are being reviewed, so a new attempt can’t start yet." };
  return { ok: true, reason: "" };
}

/** The learner's copy: the frame only. Signals, steps, the plan builder, branches and endings come from the attempt API. */
export function trustForReaders<T extends TrustData>(b: T): T {
  return {
    ...b,
    sharing: [],
    signals: [],
    steps: [],
    plan: { actions: [], updates: [], contingencies: [], checks: [] },
    variations: [],
    paths: [],
    endings: { stays: "", transfer: "", context: "", escalated: "", open: "", unverified: "", unsafe: "" },
    debrief: "",
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const id = (v: unknown, dflt: string) => (typeof v === "string" && ID.test(v) ? v : dflt);
const idList = (v: unknown, max = 12) => [...new Set(arr(v).filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, max);
const vList = (v: unknown) => [...new Set(arr(v).filter((x): x is string => typeof x === "string" && (x === "" || ID.test(x))))].slice(0, 8);
const int = (v: unknown, lo: number, hi: number, dflt: number) =>
  Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, Math.floor(Number(v)))) : dflt;
const cents = (v: unknown) => int(v, -100_000_000, 100_000_000, 0);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const pick = <T extends string>(v: unknown, list: readonly T[], dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
const level = (v: unknown): Level | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const levels = (v: unknown) => {
  const o = obj(v);
  const out: Partial<Record<Dim, Level>> = {};
  for (const k of DIM_ORDER) if (level(o[k]) !== undefined) out[k] = level(o[k]);
  return out;
};
const codes = (v: unknown) => [...new Set(arr(v).filter((c): c is Code => typeof c === "string" && c in CODES))];
const ENDING_IDS = Object.keys(ENDINGS) as EndingId[];
const ending = (v: unknown) => (typeof v === "string" && (ENDING_IDS as string[]).includes(v) ? (v as EndingId) : undefined);
const KINDS = Object.keys(EVIDENCE_KINDS) as EvidenceKind[];

function blankOption(optionId: string): Option {
  return {
    id: optionId,
    text: "",
    feedback: "",
    levels: {},
    codes: [],
    reply: "",
    guarded: "",
    sets: [],
    needs: [],
    reveals: "",
    alt: false,
    evidence: [],
    owner: "",
    contactOnly: false,
    key: false,
    only: [],
    notIn: [],
    in: {},
  };
}
export function parseOption(v: unknown, k: number): Option {
  const o = obj(v);
  const over = obj(o.in);
  const e = ending(o.ending);
  return {
    ...blankOption(id(o.id, `option-${k + 1}`)),
    text: s(o.text, 400),
    feedback: s(o.feedback, 1200),
    levels: levels(o.levels),
    codes: codes(o.codes),
    ...(e && { ending: e }),
    reply: s(o.reply, 600),
    guarded: s(o.guarded, 600),
    sets: idList(o.sets, 4),
    needs: idList(o.needs, 4),
    reveals: id(o.reveals, ""),
    alt: o.alt === true,
    evidence: [...new Set(arr(o.evidence).filter((x): x is EvidenceKind => typeof x === "string" && (KINDS as string[]).includes(x)))],
    owner: pick(o.owner, ["", ...OWNER_IDS] as const, ""),
    contactOnly: o.contactOnly === true,
    key: o.key === true,
    only: vList(o.only),
    notIn: vList(o.notIn),
    in: Object.fromEntries(
      Object.entries(over)
        .filter(([key]) => ID.test(key))
        .slice(0, 8)
        .map(([key, raw]) => {
          const x = obj(raw);
          const xe = ending(x.ending);
          return [
            key,
            {
              ...(x.levels !== undefined && { levels: levels(x.levels) }),
              ...(x.codes !== undefined && { codes: codes(x.codes) }),
              ...(typeof x.feedback === "string" && { feedback: s(x.feedback, 1200) }),
              ...(typeof x.reply === "string" && { reply: s(x.reply, 600) }),
              ...(xe && { ending: xe }),
            } satisfies Override,
          ];
        }),
    ),
  };
}
const options = (v: unknown, max = 12) => arr(v).slice(0, max).map(parseOption);
const GROUPS = ["delivery", "money", "person", "supporter", "contractor", "gaps", "followup"] as const;
const OUTCOME_IDS = Object.keys(OUTCOMES) as Outcome[];
const REASON_IDS = Object.keys(REASONS) as Reason[];

function parseBudget(v: unknown): BudgetFigures | null {
  if (!v || typeof v !== "object") return null;
  const b = obj(v);
  return {
    quarterlyCents: cents(b.quarterlyCents),
    week: int(b.week, 1, 13, 8),
    weeks: int(b.weeks, 1, 13, 12),
    plannedToDateCents: cents(b.plannedToDateCents),
    deliveredToDateCents: cents(b.deliveredToDateCents),
    claimedToDateCents: cents(b.claimedToDateCents),
    pendingClaimsCents: b.pendingClaimsCents === null || b.pendingClaimsCents === undefined || b.pendingClaimsCents === "" ? null : cents(b.pendingClaimsCents),
    scheduledRemainderCents: cents(b.scheduledRemainderCents),
    pausedCents: cents(b.pausedCents),
    feedUpdated: s(b.feedUpdated, 60),
  };
}
export function parseSignal(v: unknown, k: number): Signal {
  const x = obj(v);
  const phase = pick(x.phase, PHASE_ORDER, "notice");
  return {
    id: id(x.id, `signal-${k + 1}`),
    phase,
    checkpoint: pick(x.checkpoint, ["", "day7", "day28"] as const, ""),
    group: pick(x.group, GROUPS, "gaps"),
    title: s(x.title, 160),
    noticed: s(x.noticed, 800),
    matters: s(x.matters, 600),
    alternatives: s(x.alternatives, 600),
    verify: s(x.verify, 600),
    canAct: s(x.canAct, 300),
    source: s(x.source, 160),
    updated: s(x.updated, 60),
    reliability: pick(x.reliability, Object.keys(RELIABILITY) as SignalReliability[], "unverified"),
    kind: pick(x.kind, ["", ...KINDS] as const, ""),
    visits: arr(x.visits)
      .slice(0, 12)
      .map((y) => {
        const w = obj(y);
        return { date: date(w.date), outcome: pick(w.outcome, OUTCOME_IDS, "unknown"), reason: pick(w.reason, REASON_IDS, "unknown"), note: s(w.note, 300) };
      }),
    budget: parseBudget(x.budget),
    hidden: x.hidden === true,
    only: vList(x.only),
    notIn: vList(x.notIn),
  };
}
export function parseStep(v: unknown, k: number): Step {
  const x = obj(v);
  return {
    id: id(x.id, `step-${k + 1}`),
    phase: pick(x.phase, PHASE_ORDER, "notice"),
    kind: pick(x.kind, ["single", "multi", "evidence"] as const, "single"),
    title: s(x.title, 160),
    prompt: s(x.prompt, 800),
    min: int(x.min, 0, 12, 1),
    max: int(x.max, 1, 12, 1),
    signal: pick(x.signal, STEP_SIGNALS, ""),
    afterPlan: x.afterPlan === true,
    needsAlt: x.needsAlt === true,
    revises: id(x.revises, ""),
    checkpoint: pick(x.checkpoint, ["", "day7", "day28"] as const, ""),
    evidenceStep: id(x.evidenceStep, ""),
    options: options(x.options),
    only: vList(x.only),
    notIn: vList(x.notIn),
  };
}
function parsePlanValue(v: unknown): Plan {
  const o = obj(v);
  return {
    concern: s(o.concern, 400),
    actions: idList(o.actions),
    owner: pick(o.owner, ["", ...OWNER_IDS] as const, ""),
    update: id(o.update, ""),
    contingency: id(o.contingency, ""),
    check: id(o.check, ""),
    share: idList(o.share),
    say: s(o.say, 600),
  };
}

export function parseTrust(o: Raw, where: string, h: ParseHelpers): TrustData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const pt = obj(o.participant);
  const sup = obj(o.supporter);
  const pl = obj(o.plan);
  const en = obj(o.endings);
  const ja = obj(o.jobAid);
  const ra = obj(o.rationale);
  const ap = obj(o.approval);
  const data: TrustData = {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 800 }) ?? "",
    scenarioVersion: s(o.scenarioVersion, 60),
    mode: o.mode === "assessed" ? "assessed" : "formative",
    passMark: int(o.passMark, 0, MAX_SCORE, 15),
    ruleSetId: s(o.ruleSetId, 80) || QUARTER_RULES[0].id,
    windowDays: int(o.windowDays, 1, 90, 28),
    story: { setting: s(st.setting, 400), role: s(st.role, 300), situation: s(st.situation, 1200), temptation: s(st.temptation, 600) },
    participant: { name: s(pt.name, 60), about: s(pt.about, 600), goal: s(pt.goal, 300) },
    supporter: { name: s(sup.name, 60), relation: s(sup.relation, 60), status: s(sup.status, 300) },
    sharing: arr(o.sharing)
      .slice(0, 8)
      .map((x, i) => {
        const r = obj(x);
        return { id: id(r.id, `share-${i + 1}`), label: s(r.label, 160), allowed: r.allowed === true, detail: s(r.detail, 400) };
      }),
    signals: arr(o.signals).slice(0, 40).map(parseSignal),
    minOpen: int(o.minOpen, 1, 12, 3),
    steps: arr(o.steps).slice(0, 30).map(parseStep),
    plan: { actions: options(pl.actions, 20), updates: options(pl.updates), contingencies: options(pl.contingencies), checks: options(pl.checks) },
    variations: arr(o.variations)
      .slice(0, 8)
      .map((x, i) => ({ id: id(obj(x).id, `variation-${i + 1}`), label: s(obj(x).label, 120), text: s(obj(x).text, 600) })),
    paths: arr(o.paths)
      .slice(0, 12)
      .map((x, i) => {
        const p = obj(x);
        const an = obj(p.answers);
        return {
          id: id(p.id, `path-${i + 1}`),
          label: s(p.label, 160),
          variation: id(p.variation, ""),
          answers: Object.fromEntries(Object.entries(an).flatMap(([key, val]) => (ID.test(key) ? [[key, idList(val)]] : []))),
          plan: parsePlanValue(p.plan),
          expect: ending(p.expect) ?? "open",
        };
      }),
    endings: Object.fromEntries(ENDING_IDS.map((e) => [e, s(en[e], 1200)])) as Record<EndingId, string>,
    debrief: s(o.debrief, 1500),
    sources: arr(o.sources)
      .slice(0, 20)
      .map((x, i) => {
        const r = obj(x);
        return {
          id: id(r.id, `source-${i + 1}`),
          title: s(r.title, 200),
          url: s(r.url, 400),
          owner: s(r.owner, 160),
          checked: date(r.checked),
          reviewBy: date(r.reviewBy),
          placeholder: r.placeholder === true,
        };
      }),
    jobAid: { snippetId: s(ja.snippetId, 80), why: s(ja.why, 300) },
    related: arr(o.related)
      .slice(0, 6)
      .map((x) => ({ label: s(obj(x).label, 120), href: s(obj(x).href, 200), why: s(obj(x).why, 300) })),
    rationale: {
      signal: s(ra.signal, 400),
      themeId: s(ra.themeId, 60),
      behaviour: s(ra.behaviour, 400),
      nonLearning: s(ra.nonLearning, 400),
      whyFit: s(ra.whyFit, 600),
      existing: s(ra.existing, 400),
      reviewer: s(ra.reviewer, 160),
      measure: s(ra.measure, 400),
      decision: pick(ra.decision, ["", "accepted", "edited", "rejected"] as const, ""),
    },
    ai: { dialogue: false },
    approval: {
      owner: s(ap.owner, 120),
      operations: s(ap.operations, 120),
      quality: s(ap.quality, 120),
      policy: s(ap.policy, 120),
      finance: s(ap.finance, 120),
      clinical: s(ap.clinical, 120),
      partnerships: s(ap.partnerships, 120),
      privacy: s(ap.privacy, 120),
      learning: s(ap.learning, 120),
      approvedOn: date(ap.approvedOn),
      reviewBy: date(ap.reviewBy),
      scenarioReviewed: s(ap.scenarioReviewed, 60),
    },
  };
  if (!data.signals.length || !data.steps.length) unfinished(`${where} needs its case: the signals, the decisions and the plan builder.`);
  return data;
}
