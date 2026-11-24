import { CATEGORY_ORDER, isDate, UNITS, type Category, type Unit } from "./sandbox";
import {
  BASES,
  blocked,
  caseFigureProblems,
  inWindow,
  MODEL_VERSION,
  money,
  project,
  sessionProblems,
  type Agreed,
  type Basis,
  type Booked,
  type Case,
  type Figures,
  type Projection,
  type Proposed,
  type Service,
} from "./quarterBudget";
import { quarterRules, ruleStatus, QUARTER_RULES } from "./quarterEndRules";

/*
  The Quarterly Budget Decision Lab block (docs/budget-decision-lab.md): a fictional participant late in a Support at
  Home quarter, worked through as five steps. Read the picture (current versus projected); check with the participant;
  build a possible plan from discrete sessions on real dates; explain and record; see the consequences. The figures go
  through lib/quarterBudget; this file holds the case, the learner's state, the rubric, the readers' copy and the
  publish checks.

  The rubric (budget-rubric-1) has the PRD's five dimensions, 0 to 3 each. It never looks at the closing balance:
  spending to reduce a balance is never success, and a plan that leaves money above the carryover threshold can be the
  strongest answer. Critical errors (an unapproved service treated as approved, AT–HM from ongoing funds, claiming an
  undelivered service, concealing a known contribution, overriding the participant's decision) stand above any score,
  and in assessed mode they prevent a pass.

  The learner's copy hides each option's feedback, levels and flags, the endings' feedback and the debrief summary:
  those come from the server once the response is submitted.
*/

export const LAB_VERSION = "budget-lab-1";
export const RUBRIC_VERSION = "budget-rubric-1";

export const DIMENSIONS = {
  budget: "Understands the budget",
  choice: "Centres the person’s goals and choice",
  route: "Uses the correct route",
  deliverable: "Makes a deliverable plan",
  explain: "Explains and follows up",
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const DIM_ORDER = Object.keys(DIMENSIONS) as Dim[];
export type Level = 0 | 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 0: "Missing or unsafe", 1: "Partial", 2: "Appropriate", 3: "Strong and evidenced" };

/** Misconception and error codes. The first five are the PRD's critical unsafe errors. */
export const FLAGS = {
  unapprovedAsApproved: "Treated an unapproved service as if it were approved",
  atHmFromOngoing: "Drew an AT–HM item from ongoing funds",
  claimUndelivered: "Claimed, or treated as claimed, a service that hasn’t been delivered",
  concealContribution: "Concealed a known contribution",
  overrodeChoice: "Overrode the participant’s decision",
  currentAsAvailable: "Read the current balance as money available to spend",
  thresholdAsTarget: "Treated the amount above the carryover threshold as a spending target",
  bookedAsSpent: "Treated booked services as already spent",
  carryAll: "Assumed every unspent dollar carries over",
  familyDecides: "Let a family member’s request stand in for the participant’s choice",
  ignoredPriority: "Left out something the participant asked for that could be delivered",
  unapprovedPromise: "Promised a reimbursement or purchase no one has approved",
  unsupportedFigure: "Quoted a dollar figure that isn’t in the projection",
} as const;
export type FlagId = keyof typeof FLAGS;
/** The rule source each code rests on (lib/quarterEndRules source ids), for the reviewer view. */
export const FLAG_SOURCES: Record<FlagId, string> = {
  unapprovedAsApproved: "care-plans",
  atHmFromOngoing: "at-hm",
  claimUndelivered: "payments",
  concealContribution: "charging",
  overrodeChoice: "care-plans",
  currentAsAvailable: "budgets",
  thresholdAsTarget: "budgets",
  bookedAsSpent: "payments",
  carryAll: "budgets",
  familyDecides: "care-plans",
  ignoredPriority: "care-plans",
  unapprovedPromise: "at-hm",
  unsupportedFigure: "budgets",
};
export const CRITICAL: readonly FlagId[] = ["unapprovedAsApproved", "atHmFromOngoing", "claimUndelivered", "concealContribution", "overrodeChoice"];

export type Option = { id: string; text: string; feedback: string; levels: Partial<Record<Dim, Level>>; flags: FlagId[] };
export type Question = { id: string; prompt: string; options: Option[] };
export type Doc = { id: string; title: string; kind: "careplan" | "notice" | "notes"; body: string };
export type Twist = { id: string; label: string; text: string; cancel: string[]; availability: Record<string, string[]> };
export type Ending = "added" | "review" | "unchanged";

export type BudgetLabData = {
  title: string;
  intro: string;
  scenarioVersion: string;
  ruleSetId: string;
  story: {
    /** The participant: a recurring character from the library. */
    participant: string;
    about: string;
    /** Who decides: the participant, and anyone in a registered supporter role. */
    decisionMaker: string;
    supporter: { name: string; relation: string; request: string };
    goals: { id: string; text: string; priority: boolean }[];
    /** What the participant says once asked. */
    reply: string;
    equipment: string;
  };
  figures: Figures;
  /** The participant's fictional assessed rates, in basis points; null is "needs checking". Clinical Supports are always 0. */
  rates: Record<Category, number | null>;
  ratesBasis: string;
  services: Service[];
  booked: Booked[];
  documents: Doc[];
  read: Question[];
  conversation: Question;
  equipment: Question;
  explanation: Question;
  nextStep: Question;
  /** Phrases a written reason shouldn't use, each with why. */
  avoid: { phrase: string; why: string; flag: FlagId | "" }[];
  /** Feedback for each defensible ending. Hidden until the response is submitted. */
  endings: Record<Ending, string>;
  /** Meaningful variations for a retry: attempt 2 gets the first, and so on. */
  twists: Twist[];
  debrief: string;
  assessment: { mode: "formative" | "assessed"; passMark: number };
  /** The canonical Quarterly Budget Check Job Aid, by reference. */
  jobAid: { snippetId: string; why: string };
  sources: { title: string; url: string }[];
  /** Why this block (PRD section 2): the author accepts, edits or rejects it, versioned with the scenario. */
  rationale: {
    theme: string;
    themeId: string;
    themeOwner: string;
    behaviour: string;
    barrier: string;
    whyFit: string;
    evidence: string;
    measure: string;
    systemFix: string;
    decision: "" | "accepted" | "edited" | "rejected";
  };
  approval: {
    owner: string;
    operations: string;
    policy: string;
    quality: string;
    learning: string;
    approvedOn: string;
    effectiveFrom: string;
    reviewBy: string;
    /** The rule set the reviewers checked. A different one on the block means Review required. */
    ruleSetReviewed: string;
  };
};

export const caseOf = (d: BudgetLabData): Case => ({
  ruleSetId: d.ruleSetId,
  scenarioVersion: d.scenarioVersion,
  figures: d.figures,
  rates: d.rates,
  services: d.services,
  booked: d.booked,
});

/** The schedule a twist leaves: booked sessions it cancels, and supplier availability it changes. */
export const twistOf = (d: BudgetLabData, id: string) => d.twists.find((t) => t.id === id) ?? null;
export const availabilityOf = (d: BudgetLabData, twist: string) => (s: Service) => twistOf(d, twist)?.availability[s.id] ?? s.availability;

// ---------------------------------------------------------------------------------------------
// The learner's state
// ---------------------------------------------------------------------------------------------

export const STEPS = ["Read the picture", "Check with her", "Build a possible plan", "Explain and record", "See the consequences"] as const;
export const LAST = STEPS.length - 1;
/** The documents a learner must open before deciding: the statement (computed) and the care plan. */
export const REQUIRED_DOCS = ["statement", "careplan"];

export type LabState = {
  stage: number;
  opened: string[];
  answers: Record<string, string>;
  conversation: string;
  proposed: Proposed[];
  /** Deliberately leaving the plan as it is. */
  unchanged: boolean;
  equipment: string;
  explanation: string;
  nextStep: string;
  /** The learner's own reason, in their words. Private to them: never in events or exports. */
  reason: string;
  twist: string;
  retries: number;
};

export const emptyState = (): LabState => ({
  stage: 0,
  opened: [],
  answers: {},
  conversation: "",
  proposed: [],
  unchanged: false,
  equipment: "",
  explanation: "",
  nextStep: "",
  reason: "",
  twist: "",
  retries: 0,
});

const pick = (v: unknown, list: { id: string }[]) => (typeof v === "string" && list.some((x) => x.id === v) ? v : "");

export function cleanState(d: BudgetLabData, v: unknown): LabState {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const [k, a] of Object.entries((o.answers && typeof o.answers === "object" ? o.answers : {}) as Record<string, unknown>)) {
    const q = d.read.find((x) => x.id === k);
    if (q && pick(a, q.options)) answers[k] = a as string;
  }
  const twist = typeof o.twist === "string" && twistOf(d, o.twist) ? o.twist : "";
  const avail = availabilityOf(d, twist);
  const seen = new Set<string>();
  const proposed = (Array.isArray(o.proposed) ? o.proposed : []).slice(0, 24).flatMap((x): Proposed[] => {
    const p = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const serviceId = typeof p.serviceId === "string" ? p.serviceId : "";
    const date = typeof p.date === "string" ? p.date : "";
    const s = d.services.find((y) => y.id === serviceId);
    if (!s || !isDate(date) || seen.has(`${serviceId}@${date}`)) return [];
    const item: Proposed = { serviceId, date, ...(p.review === true && !s.approved && { review: true }) };
    // Anything the engine would block is dropped, whatever the browser sends.
    if (blocked(sessionProblems(caseOf(d), item, avail))) return [];
    seen.add(`${serviceId}@${date}`);
    return [item];
  });
  const opened = (Array.isArray(o.opened) ? o.opened : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40));
  return {
    stage: typeof o.stage === "number" && Number.isInteger(o.stage) ? Math.max(0, Math.min(LAST, o.stage)) : 0,
    opened: [...new Set(opened)].slice(0, 30),
    answers,
    conversation: pick(o.conversation, d.conversation.options),
    proposed,
    unchanged: o.unchanged === true,
    equipment: pick(o.equipment, d.equipment.options),
    explanation: pick(o.explanation, d.explanation.options),
    nextStep: pick(o.nextStep, d.nextStep.options),
    reason: typeof o.reason === "string" ? o.reason.slice(0, 2000) : "",
    twist,
    retries: typeof o.retries === "number" && o.retries >= 0 ? Math.min(50, Math.floor(o.retries)) : 0,
  };
}

/** The projection for a state: the booked schedule (after any twist) and the learner's proposals. */
export function projectionFor(d: BudgetLabData, s: Pick<LabState, "proposed" | "twist">): Projection {
  const t = twistOf(d, s.twist);
  return project(caseOf(d), { proposed: s.proposed, cancelled: t?.cancel ?? [], availability: t?.availability ?? {}, ratesBasis: d.ratesBasis });
}
export const startProjection = (d: BudgetLabData, twist = "") => projectionFor(d, { proposed: [], twist });

/** The first unfinished thing at each step: the gate to move on. */
export function stepProblems(d: BudgetLabData, s: LabState, step: number): string[] {
  const out: string[] = [];
  if (step >= 1) {
    const docs = REQUIRED_DOCS.filter((x) => !s.opened.includes(`doc:${x}`));
    if (docs.length) out.push("Open the statement and the care plan first.");
    if (d.read.some((q) => !s.answers[q.id])) out.push("Answer each question about the figures.");
  }
  if (step >= 2 && !s.conversation) out.push(`Choose how you’ll check with ${d.story.participant}.`);
  if (step >= 3) {
    if (!s.proposed.length && !s.unchanged) out.push("Add or reschedule a session, request a review, or choose to leave the plan unchanged.");
    if (!s.equipment) out.push("Choose the route for the equipment request.");
  }
  if (step >= 4) {
    if (!s.explanation) out.push(`Choose how you’d explain it to ${d.story.participant}.`);
    if (!s.nextStep) out.push("Choose what you’ll record and check next.");
    if (s.reason.trim().length < 30) out.push("Write your reason in a sentence or two: why this plan, in your own words.");
  }
  return out;
}
export const finishProblems = (d: BudgetLabData, s: LabState) => stepProblems(d, s, LAST);

// ---------------------------------------------------------------------------------------------
// Placeholders in option text: the figures of the case the learner is on
// ---------------------------------------------------------------------------------------------

export function fill(text: string, p: Projection, name = "") {
  const v: Record<string, string> = {
    current: money(p.actualAvailableCents),
    booked: money(p.bookedEstimateCents),
    projected: money(p.projectedBalanceCents),
    threshold: money(p.threshold.cents),
    above: money(p.projectedAboveThresholdCents),
    carry: money(p.projectedCarryoverCents),
    budget: money(p.threshold.budgetCents),
    percent: `${p.threshold.percent}%`,
    percentOf: money(p.threshold.percentOfBudgetCents),
    minimum: money(p.threshold.minimumCents),
    contribution: money(p.contribution.knownCents),
    name,
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
}

// ---------------------------------------------------------------------------------------------
// The written reason: figures and phrases
// ---------------------------------------------------------------------------------------------

/** Dollar amounts in the reason that aren't in either projection (within a dollar, as people round when they talk). */
export function unsupportedFigures(text: string, ps: Projection[]): string[] {
  const known = new Set<number>();
  for (const p of ps) {
    for (const c of [
      p.actualAvailableCents,
      p.bookedEstimateCents,
      p.proposedEstimateCents,
      p.scheduledEstimatedCents,
      p.projectedBalanceCents,
      p.threshold.cents,
      p.threshold.minimumCents,
      p.threshold.percentOfBudgetCents,
      p.threshold.budgetCents,
      p.projectedCarryoverCents,
      p.projectedAboveThresholdCents,
      p.contribution.knownCents,
      p.fullPriceCents,
      p.overspendCents,
    ])
      known.add(c);
    for (const l of p.lines) {
      known.add(l.cost.fullCents);
      known.add(l.cost.governmentCents);
      if (l.cost.contributionCents !== null) known.add(l.cost.contributionCents);
    }
  }
  const out: string[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g)) {
    const c = Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
    if (![...known].some((k) => Math.abs(k - c) <= 100)) out.push(m[0].replace(/\s/g, ""));
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------
// The debrief: rubric, flags, endings
// ---------------------------------------------------------------------------------------------

export type Debrief = {
  dims: { dim: Dim; label: string; rating: Level; why: string }[];
  score: number;
  max: number;
  flags: { id: FlagId; text: string; critical: boolean }[];
  unsafe: boolean;
  mode: "formative" | "assessed";
  /** Assessed mode only: no critical error and at least the pass mark. Null in formative mode. */
  passed: boolean | null;
  passMark: number;
  ending: Ending;
  endingText: string;
  start: Projection;
  plan: Projection;
  answers: { prompt: string; text: string; feedback: string }[];
  conversation: { text: string; feedback: string };
  equipment: { text: string; feedback: string };
  explanation: { text: string; feedback: string };
  nextStep: { text: string; feedback: string };
  priorities: { text: string; kept: boolean; note: string }[];
  reason: { unsupported: string[]; avoided: { phrase: string; why: string }[] };
  summary: string;
  twist: { label: string; text: string } | null;
  versions: { lab: string; scenario: string; rubric: string; model: string; ruleSet: string };
};

const lower = (...xs: (Level | undefined)[]): Level | undefined => {
  const ys = xs.filter((x): x is Level => x !== undefined);
  return ys.length ? (Math.min(...ys) as Level) : undefined;
};
const cap = (l: Level, max: Level): Level => (l > max ? max : l);

/** Services the participant asked for that can be delivered in the days left (after any twist). */
export function wantedAvailable(d: BudgetLabData, twist: string) {
  const avail = availabilityOf(d, twist);
  return d.services.filter((s) => s.priority && s.agreed === "yes" && s.approved && s.route === "ongoing" && avail(s).some((x) => inWindow(d.figures, x)));
}

export function endingOf(p: Projection): Ending {
  if (p.lines.some((l) => l.status === "proposed")) return "added";
  if (p.lines.some((l) => l.status === "review")) return "review";
  return "unchanged";
}

export function buildDebrief(d: BudgetLabData, s: LabState): Debrief {
  const find = (q: Question, id: string) => q.options.find((o) => o.id === id) ?? { id: "", text: "", feedback: "", levels: {}, flags: [] };
  const start = startProjection(d, s.twist);
  const plan = projectionFor(d, s);
  const answers = d.read.map((q) => ({ q, o: find(q, s.answers[q.id] ?? "") }));
  const conversation = find(d.conversation, s.conversation);
  const equipment = find(d.equipment, s.equipment);
  const explanation = find(d.explanation, s.explanation);
  const nextStep = find(d.nextStep, s.nextStep);
  const t = ` ${s.reason.toLowerCase().replace(/\s+/g, " ")} `;
  const avoided = d.avoid.filter((a) => a.phrase && t.includes(a.phrase.toLowerCase()));
  const unsupported = unsupportedFigures(s.reason, [start, plan]);

  const service = (id: string) => d.services.find((x) => x.id === id);
  const counted = s.proposed.filter((p) => !p.review);
  const derived: FlagId[] = [];
  if (counted.some((p) => !service(p.serviceId)?.approved)) derived.push("unapprovedAsApproved");
  if (counted.some((p) => service(p.serviceId)?.agreed === "no")) derived.push("overrodeChoice");
  const wanted = wantedAvailable(d, s.twist);
  const missing = wanted.filter((w) => !counted.some((p) => p.serviceId === w.id));
  if (missing.length) derived.push("ignoredPriority");
  if (unsupported.length) derived.push("unsupportedFigure");
  for (const a of avoided) if (a.flag) derived.push(a.flag);
  const flagIds = [
    ...new Set([...answers.flatMap((a) => a.o.flags), ...conversation.flags, ...equipment.flags, ...explanation.flags, ...nextStep.flags, ...derived]),
  ];
  const unsafe = flagIds.some((f) => CRITICAL.includes(f));
  const unresolved = plan.lines.filter((l) => l.status === "unresolved");
  const levels: Record<Dim, Level> = {
    budget: lower(...answers.map((a) => a.o.levels.budget), explanation.levels.budget) ?? 1,
    choice: flagIds.includes("overrodeChoice") ? 0 : cap(lower(conversation.levels.choice, explanation.levels.choice) ?? 1, missing.length ? 1 : 3),
    route: flagIds.includes("unapprovedAsApproved") || flagIds.includes("atHmFromOngoing") ? 0 : (lower(equipment.levels.route, nextStep.levels.route) ?? 1),
    deliverable: cap(lower(explanation.levels.deliverable, nextStep.levels.deliverable) ?? 2, unresolved.length ? 1 : 3),
    explain: cap(cap(lower(explanation.levels.explain, nextStep.levels.explain) ?? 1, unsupported.length ? 2 : 3), avoided.length ? 1 : 3),
  };
  const why: Record<Dim, string> = {
    budget: answers
      .map((a) => fill(a.o.feedback, start, d.story.participant))
      .filter(Boolean)
      .join(" "),
    choice: [
      fill(conversation.feedback, start, d.story.participant),
      flagIds.includes("overrodeChoice") ? `Your plan includes something ${d.story.participant} said no to. Her choice stands unless she changes it.` : "",
      missing.length
        ? `${d.story.participant} asked for ${missing.map((m) => m.name.toLowerCase()).join(" and ")}, and it could be delivered before quarter end. If there was a reason to leave it out, it belongs in what you record.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    route: [
      fill(equipment.feedback, plan, d.story.participant),
      flagIds.includes("unapprovedAsApproved") ? "A service outside the approved care plan is in your plan as a session, not a review request." : "",
    ]
      .filter(Boolean)
      .join(" "),
    deliverable: unresolved.length
      ? `Unresolved in your plan: ${unresolved.map((l) => l.name).join(", ")}. Each needs approval or agreement before it can happen.`
      : "Every session in your plan is approved, agreed and on a date the supplier can deliver, and nothing is treated as delivered.",
    explain: [
      fill(explanation.feedback, plan, d.story.participant),
      fill(nextStep.feedback, plan, d.story.participant),
      unsupported.length ? `Your reason mentions ${unsupported.join(", ")}, which isn’t a figure in the projection.` : "",
      ...avoided.map((a) => `“${a.phrase}”: ${a.why}`),
    ]
      .filter(Boolean)
      .join(" "),
  };
  const score = DIM_ORDER.reduce((a, k) => a + levels[k], 0);
  const ending = endingOf(plan);
  const tw = twistOf(d, s.twist);
  return {
    dims: DIM_ORDER.map((dim) => ({ dim, label: DIMENSIONS[dim], rating: levels[dim], why: why[dim] })),
    score,
    max: DIM_ORDER.length * 3,
    flags: flagIds.map((id) => ({ id, text: FLAGS[id], critical: CRITICAL.includes(id) })).sort((a, b) => Number(b.critical) - Number(a.critical)),
    unsafe,
    mode: d.assessment.mode,
    passed: d.assessment.mode === "assessed" ? !unsafe && score >= d.assessment.passMark : null,
    passMark: d.assessment.passMark,
    ending,
    endingText: fill(d.endings[ending], plan, d.story.participant),
    start,
    plan,
    answers: answers.map((a) => ({
      prompt: fill(a.q.prompt, start, d.story.participant),
      text: fill(a.o.text, start, d.story.participant),
      feedback: fill(a.o.feedback, start, d.story.participant),
    })),
    conversation: { text: fill(conversation.text, start, d.story.participant), feedback: fill(conversation.feedback, start, d.story.participant) },
    equipment: { text: equipment.text, feedback: fill(equipment.feedback, plan, d.story.participant) },
    explanation: { text: fill(explanation.text, plan, d.story.participant), feedback: fill(explanation.feedback, plan) },
    nextStep: { text: nextStep.text, feedback: fill(nextStep.feedback, plan, d.story.participant) },
    priorities: d.story.goals
      .filter((g) => g.priority)
      .map((g) => {
        const svc = d.services.filter((x) => x.priority && x.agreed === "yes");
        const kept = svc.some((x) => counted.some((p) => p.serviceId === x.id)) || !wanted.length;
        return {
          text: g.text,
          kept,
          note: kept ? (wanted.length ? "In the plan." : "Nothing more could be delivered this quarter: recorded for the next one.") : "Not in the plan.",
        };
      }),
    reason: { unsupported, avoided: avoided.map((a) => ({ phrase: a.phrase, why: a.why })) },
    summary: fill(d.debrief, plan, d.story.participant),
    twist: tw ? { label: tw.label, text: tw.text } : null,
    versions: { lab: LAB_VERSION, scenario: d.scenarioVersion, rubric: RUBRIC_VERSION, model: MODEL_VERSION, ruleSet: d.ruleSetId },
  };
}

// ---------------------------------------------------------------------------------------------
// Authoring checks, the readers' copy and publishing
// ---------------------------------------------------------------------------------------------

const strong = (o: Option) => !o.flags.length && Object.keys(o.levels).length > 0 && Object.values(o.levels).every((l) => l !== undefined && l >= 2);
const best = (q: Question) => q.options.find(strong);

/** The strongest path through a case, with a given plan: used to prove each defensible ending gets a pass. */
export function strongState(d: BudgetLabData, proposed: Proposed[], twist = ""): LabState {
  return {
    ...emptyState(),
    stage: LAST,
    opened: REQUIRED_DOCS.map((x) => `doc:${x}`),
    answers: Object.fromEntries(d.read.map((q) => [q.id, best(q)?.id ?? ""])),
    conversation: best(d.conversation)?.id ?? "",
    proposed,
    unchanged: !proposed.length,
    equipment: best(d.equipment)?.id ?? "",
    explanation: best(d.explanation)?.id ?? "",
    nextStep: best(d.nextStep)?.id ?? "",
    reason: "This is what she asked for and can be delivered, with the estimate explained and a date to check the statement.",
    twist,
  };
}

/** The defensible endings the case supports: each wanted session (on its first date), and each twist's own. */
export function defensibleEndings(d: BudgetLabData) {
  const plans: { label: string; twist: string; proposed: Proposed[] }[] = [];
  const first = (twist: string) =>
    wantedAvailable(d, twist).map((s) => ({ serviceId: s.id, date: availabilityOf(d, twist)(s).find((x) => inWindow(d.figures, x))! }));
  const base = first("");
  if (base.length) plans.push({ label: "what she asked for", twist: "", proposed: base });
  // Anything else she agreed to and could have, added on top: a second defensible ending with a different projection.
  const extra = d.services
    .filter((s) => s.agreed === "yes" && !s.priority && s.approved && s.route === "ongoing" && s.availability.some((x) => inWindow(d.figures, x)))
    .map((s) => ({ serviceId: s.id, date: s.availability.find((x) => inWindow(d.figures, x))! }));
  if (extra.length) plans.push({ label: "what she asked for, and what she agreed to", twist: "", proposed: [...base, ...extra] });
  for (const t of d.twists) plans.push({ label: t.label, twist: t.id, proposed: first(t.id) });
  return plans.map((p) => {
    const db = buildDebrief(d, strongState(d, p.proposed, p.twist));
    return { ...p, ending: db.ending, score: db.score, flags: db.flags.map((f) => f.id), projected: db.plan.projectedBalanceCents };
  });
}

/** What makes the case unusable or misleading. Publishing waits until it's empty. */
export function caseProblems(d: BudgetLabData): string[] {
  const where = `“${d.title || "The Quarterly Budget Decision Lab block"}”`;
  const out = caseFigureProblems(caseOf(d)).map((p) => `${where}: ${p}`);
  if (!d.story.participant || !d.story.about || !d.story.reply)
    out.push(`${where} needs its story: the participant, about them, and what they say when asked.`);
  if (!d.story.decisionMaker) out.push(`${where}: say who makes the decisions (the participant, and any registered supporter).`);
  if (!d.story.goals.some((g) => g.priority)) out.push(`${where}: mark at least one goal the participant says matters most.`);
  if (!d.documents.some((x) => x.kind === "careplan" && x.body)) out.push(`${where} needs the care plan excerpt.`);
  if (!d.ratesBasis) out.push(`${where}: say where the contribution rates come from, and their effective date.`);
  const qs: [string, Question][] = [
    ...d.read.map((q, i) => [`question ${i + 1} about the figures`, q] as [string, Question]),
    ["conversation", d.conversation],
    ["equipment route", d.equipment],
    ["explanation", d.explanation],
    ["next step", d.nextStep],
  ];
  if (!d.read.length) out.push(`${where} needs at least one question about the figures.`);
  for (const [name, q] of qs) {
    if (!q.prompt) out.push(`${where}: the ${name} needs its prompt.`);
    if (q.options.length < 2) out.push(`${where}: the ${name} needs at least two options.`);
    if (!q.options.some(strong)) out.push(`${where}: the ${name} needs at least one strong, unflagged option.`);
    for (const o of q.options) if (!o.feedback) out.push(`${where}: “${o.text.slice(0, 40)}” needs its feedback.`);
  }
  if (!d.services.some((s) => s.route === "at-hm") || !d.story.equipment) out.push(`${where}: include the equipment request, as an AT–HM item.`);
  for (const e of ["added", "unchanged"] as const) if (!d.endings[e]) out.push(`${where}: write the feedback for the “${e}” ending.`);
  for (const t of d.twists) {
    if (!t.label || !t.text) out.push(`${where}: the variation “${t.id}” needs its label and what changed.`);
    for (const b of t.cancel) if (!d.booked.some((x) => x.id === b)) out.push(`${where}: the variation “${t.label}” cancels a booking that isn’t there.`);
    for (const [sid, dates] of Object.entries(t.availability)) {
      if (!d.services.some((x) => x.id === sid)) out.push(`${where}: the variation “${t.label}” changes a service that isn’t there.`);
      for (const x of dates) if (!inWindow(d.figures, x)) out.push(`${where}: the variation “${t.label}” offers ${x}, outside the days left.`);
    }
  }
  if (!d.sources.length) out.push(`${where} needs its policy sources.`);
  if (d.assessment.mode === "assessed" && (d.assessment.passMark < 1 || d.assessment.passMark > 15))
    out.push(`${where}: an assessed lab needs a pass mark out of 15.`);
  if (!out.length) {
    // The feedback must support every valid ending: each one, played strongly, passes with no flag.
    const endings = defensibleEndings(d);
    if (!endings.length)
      out.push(`${where}: no defensible ending: give the participant something she wants that can be delivered, or a variation where nothing can.`);
    for (const e of endings)
      if (e.flags.length || e.score < 12)
        out.push(
          `${where}: the ending “${e.label}” played strongly scores ${e.score}/15 with ${e.flags.join(", ") || "no flags"}. Check its options and feedback.`,
        );
  }
  return out;
}

export const labApproved = (d: Pick<BudgetLabData, "approval">) => {
  const a = d.approval;
  return Boolean(a.owner && a.operations && a.policy && a.quality && a.learning && a.approvedOn);
};

/** What "Publish anyway" can't waive: the case's checks, the rule set's status, the sign-off and its review date. */
export function budgetLabHardProblems(d: BudgetLabData, today: string): string[] {
  const out = caseProblems(d);
  const where = `“${d.title}”`;
  const status = ruleStatus(d.ruleSetId, today);
  if (status === "withdrawn") out.push(`${where} uses a rule set that has been withdrawn.`);
  if (status === "review-required") out.push(`${where}: Review required. Its rule set has changed or is past its review date.`);
  if (!labApproved(d))
    out.push(
      `${where}: record the owner, Operations/Finance, the Support at Home policy owner, Quality (client-facing language) and the learning reviewer (rubric and accessibility), and the date.`,
    );
  else if (d.approval.ruleSetReviewed !== d.ruleSetId)
    out.push(`${where}: Review required. The reviewers signed off ${d.approval.ruleSetReviewed || "no rule set"}, and the block now uses ${d.ruleSetId}.`);
  if (d.approval.reviewBy && d.approval.reviewBy < today) out.push(`${where} was due for review on ${d.approval.reviewBy}.`);
  return out;
}

/** The learner's copy: no feedback, levels, flags, endings or debrief summary. */
export function budgetLabForReaders<T extends BudgetLabData>(b: T): T {
  const plain = (q: Question): Question => ({ ...q, options: q.options.map((o) => ({ ...o, feedback: "", levels: {}, flags: [] })) });
  return {
    ...b,
    read: b.read.map(plain),
    conversation: plain(b.conversation),
    equipment: plain(b.equipment),
    explanation: plain(b.explanation),
    nextStep: plain(b.nextStep),
    avoid: [],
    endings: { added: "", review: "", unchanged: "" },
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
const ID = /^[a-zA-Z0-9-]{1,40}$/;
const id = (v: unknown, d: string) => (typeof v === "string" && ID.test(v) ? v : d);
const cents = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100_000_000 ? Number(v) : 0);
const pool = (v: unknown) => (v === null || v === undefined || v === "" ? null : cents(v));
const bp = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10000 ? Number(v) : null;
const date = (v: unknown) => (typeof v === "string" && isDate(v) ? v : "");
const dates = (v: unknown) => [...new Set(arr(v).map(date).filter(Boolean))].slice(0, 20);
const level = (v: unknown): Level | undefined => (v === 0 || v === 1 || v === 2 || v === 3 ? v : undefined);
const levels = (v: unknown) =>
  Object.fromEntries(
    Object.entries(obj(v))
      .filter(([k]) => k in DIMENSIONS)
      .map(([k, x]) => [k, level(x)])
      .filter(([, x]) => x !== undefined),
  ) as Partial<Record<Dim, Level>>;
const flags = (v: unknown) => [...new Set(arr(v).filter((f): f is FlagId => typeof f === "string" && f in FLAGS))];
const option = (x: unknown, k: number): Option => {
  const p = obj(x);
  return { id: id(p.id, `o${k + 1}`), text: s(p.text, 500), feedback: s(p.feedback, 900), levels: levels(p.levels), flags: flags(p.flags) };
};
const question = (x: unknown, k: number): Question => {
  const q = obj(x);
  return { id: id(q.id, `q${k + 1}`), prompt: s(q.prompt, 400), options: arr(q.options).slice(0, 6).map(option) };
};
const RATIONALE_DECISIONS = ["", "accepted", "edited", "rejected"] as const;
const AGREED: Agreed[] = ["yes", "no", "ask"];

export function parseBudgetLab(o: Raw, where: string, h: ParseHelpers): BudgetLabData {
  const { str, unfinished } = h;
  const st = obj(o.story);
  const sup = obj(st.supporter);
  const f = obj(o.figures);
  const q = obj(f.quarter);
  const pools = obj(f.pools);
  const r = obj(o.rates);
  const ap = obj(o.approval);
  const ra = obj(o.rationale);
  const en = obj(o.endings);
  const as = obj(o.assessment);
  const ja = obj(o.jobAid);
  const ruleSetId = typeof o.ruleSetId === "string" && quarterRules(o.ruleSetId) ? o.ruleSetId : QUARTER_RULES[0].id;
  const services = arr(o.services)
    .slice(0, 12)
    .map((x, k): Service => {
      const v = obj(x);
      return {
        id: id(v.id, `svc${k + 1}`),
        name: s(v.name, 80),
        purpose: s(v.purpose, 300),
        kind: s(v.kind, 40),
        category: CATEGORY_ORDER.includes(v.category as Category) ? (v.category as Category) : "everyday",
        unit: typeof v.unit === "string" && v.unit in UNITS ? (v.unit as Unit) : "hour",
        unitPriceCents: cents(v.unitPriceCents),
        unitsEach: Number(v.unitsEach) > 0 && Number(v.unitsEach) <= 12 ? Math.round(Number(v.unitsEach) * 4) / 4 : 1,
        approved: v.approved === true,
        route: v.route === "at-hm" ? "at-hm" : "ongoing",
        supplier: s(v.supplier, 120),
        availability: dates(v.availability),
        agreed: AGREED.includes(v.agreed as Agreed) ? (v.agreed as Agreed) : "ask",
        says: s(v.says, 400),
        priority: v.priority === true,
        priceSource: s(v.priceSource, 200),
      };
    });
  const data: BudgetLabData = {
    title: str(o.title, `${where} title`, { required: true, max: 120 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    scenarioVersion: s(o.scenarioVersion, 40) || "1",
    ruleSetId,
    story: {
      participant: s(st.participant, 60),
      about: s(st.about, 1200),
      decisionMaker: s(st.decisionMaker, 400),
      supporter: { name: s(sup.name, 60), relation: s(sup.relation, 60), request: s(sup.request, 800) },
      goals: arr(st.goals)
        .slice(0, 6)
        .map((x, k) => ({ id: id(obj(x).id, `g${k + 1}`), text: s(obj(x).text, 200), priority: obj(x).priority === true }))
        .filter((g) => g.text),
      reply: s(st.reply, 1400),
      equipment: s(st.equipment, 600),
    },
    figures: {
      classificationLabel: s(f.classificationLabel, 120),
      quarterlyBudgetCents: cents(f.quarterlyBudgetCents),
      supplementsCents: cents(f.supplementsCents),
      basis: typeof f.basis === "string" && f.basis in BASES ? (f.basis as Basis) : "",
      careManagementDeductedCents: cents(f.careManagementDeductedCents),
      currentBalanceCents: cents(f.currentBalanceCents),
      quarter: { start: date(q.start), end: date(q.end) },
      snapshot: date(f.snapshot),
      pools: { atHmCents: pool(pools.atHmCents), hcpUnspentCents: pool(pools.hcpUnspentCents), shortTermCents: pool(pools.shortTermCents) },
    },
    rates: { clinical: 0, independence: bp(r.independence), everyday: bp(r.everyday) },
    ratesBasis: s(o.ratesBasis, 400),
    services,
    booked: arr(o.booked)
      .slice(0, 40)
      .map((x, k) => {
        const v = obj(x);
        return {
          id: id(v.id, `b${k + 1}`),
          serviceId: id(v.serviceId, ""),
          date: date(v.date),
          ...(typeof v.note === "string" && v.note && { note: s(v.note, 200) }),
        };
      }),
    documents: arr(o.documents)
      .slice(0, 6)
      .map((x, k) => {
        const v = obj(x);
        return {
          id: id(v.id, `d${k + 1}`),
          title: s(v.title, 160),
          kind: v.kind === "careplan" || v.kind === "notice" ? v.kind : ("notes" as const),
          body: s(v.body, 2000),
        };
      }),
    read: arr(o.read).slice(0, 4).map(question),
    conversation: question(o.conversation, 0),
    equipment: question(o.equipment, 0),
    explanation: question(o.explanation, 0),
    nextStep: question(o.nextStep, 0),
    avoid: arr(o.avoid)
      .slice(0, 8)
      .map((x) => {
        const v = obj(x);
        return { phrase: s(v.phrase, 120), why: s(v.why, 300), flag: typeof v.flag === "string" && v.flag in FLAGS ? (v.flag as FlagId) : ("" as const) };
      })
      .filter((a) => a.phrase),
    endings: { added: s(en.added, 900), review: s(en.review, 900), unchanged: s(en.unchanged, 900) },
    twists: arr(o.twists)
      .slice(0, 4)
      .map((x, k) => {
        const v = obj(x);
        const av = obj(v.availability);
        return {
          id: id(v.id, `t${k + 1}`),
          label: s(v.label, 120),
          text: s(v.text, 600),
          cancel: arr(v.cancel)
            .filter((c): c is string => typeof c === "string")
            .slice(0, 10),
          availability: Object.fromEntries(
            Object.entries(av)
              .filter(([k2]) => ID.test(k2))
              .map(([k2, v2]) => [k2, dates(v2)]),
          ),
        };
      }),
    debrief: s(o.debrief, 1800),
    assessment: {
      mode: as.mode === "assessed" ? "assessed" : "formative",
      passMark: Number.isInteger(as.passMark) && (as.passMark as number) >= 1 && (as.passMark as number) <= 15 ? (as.passMark as number) : 11,
    },
    jobAid: { snippetId: typeof ja.snippetId === "string" ? ja.snippetId.slice(0, 80) : "", why: s(ja.why, 300) },
    sources: arr(o.sources)
      .slice(0, 8)
      .map((x) => ({ title: s(obj(x).title, 200), url: s(obj(x).url, 400) }))
      .filter((x) => x.title && x.url.startsWith("https://")),
    rationale: {
      theme: s(ra.theme, 400),
      themeId: s(ra.themeId, 60),
      themeOwner: s(ra.themeOwner, 120),
      behaviour: s(ra.behaviour, 400),
      barrier: s(ra.barrier, 400),
      whyFit: s(ra.whyFit, 600),
      evidence: s(ra.evidence, 400),
      measure: s(ra.measure, 400),
      systemFix: s(ra.systemFix, 400),
      decision: RATIONALE_DECISIONS.includes(ra.decision as (typeof RATIONALE_DECISIONS)[number]) ? (ra.decision as (typeof RATIONALE_DECISIONS)[number]) : "",
    },
    approval: {
      owner: s(ap.owner, 120),
      operations: s(ap.operations, 120),
      policy: s(ap.policy, 120),
      quality: s(ap.quality, 120),
      learning: s(ap.learning, 120),
      approvedOn: date(ap.approvedOn),
      effectiveFrom: date(ap.effectiveFrom),
      reviewBy: date(ap.reviewBy),
      ruleSetReviewed: s(ap.ruleSetReviewed, 60),
    },
  };
  if (!data.services.length || !data.figures.quarterlyBudgetCents) unfinished(`${where} needs its case: the figures and the services.`);
  return data;
}
