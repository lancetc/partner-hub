/*
  Invoice X-Ray (docs/invoice-xray.md): a Magazine block where a learner reads a fictional quote or receipt
  line by line, decides what each line is for this participant, sees the money split, and explains one
  disappointing line to the family. Everything here is pure, so the server, the learner's page and the
  editor's preview run the same rules.

  - Four outcomes, not two. A participant contribution is part of an eligible service; a private expense is
    not a contribution; a line missing a fact stays pending rather than defaulting to yes or no.
  - Money is whole cents, from the line prices and the case's stated synthetic rate. Never generated, never
    a real participant's contribution. No rate means "rate to be confirmed", not a made-up figure.
  - A quote is an estimate. Nothing here is a claim, a payment, a reimbursement or a message to anyone.
  - The answer key stays on the server until the learner has submitted.

  With a `funding` section the block runs in quote and invoice review mode (lib/xrayFunding): six decisions over ten
  separate checks, the document's role, separate price contexts and an explanation rehearsal. A case without one runs
  exactly as before, so older cases and their attempts are unchanged.
*/

import {
  cleanFundingPick,
  cleanFundingState,
  DECISION_ORDER,
  freshFunding,
  fundingCritical,
  fundingFinishProblems,
  fundingForReaders,
  fundingIncomplete,
  parseFunding,
  type CoachPoint,
  type FDecision,
  type FundingData,
  type Overall,
  type Route,
  type AskWho,
} from "./xrayFunding";

// ---------------------------------------------------------------------------------------------
// The case's parts
// ---------------------------------------------------------------------------------------------

export const OUTCOMES = {
  eligible_no_contribution: {
    label: "Eligible: no contribution",
    text: "An approved service with no participant contribution, from the right funding account.",
  },
  eligible_with_contribution: {
    label: "Eligible: contribution applies",
    text: "An approved service or AT-HM item where a participant contribution may be payable.",
  },
  needs_review: { label: "Needs review", text: "A fact that decides it is missing. It stays pending: not approved, not excluded." },
  excluded_private: { label: "Excluded or private", text: "Outside the approved arrangement. A private cost if the participant still wants it." },
} as const;
export type LineOutcome = keyof typeof OUTCOMES;
export const OUTCOME_ORDER = Object.keys(OUTCOMES) as LineOutcome[];
export const isEligible = (o: LineOutcome | "") => o === "eligible_no_contribution" || o === "eligible_with_contribution";

export const ACCOUNTS = {
  ongoing_quarterly: "Ongoing services (quarterly budget)",
  assistive_technology: "AT-HM: assistive technology",
  home_modifications: "AT-HM: home modifications",
  other_approved_pathway: "Another approved pathway",
  none: "None",
} as const;
export type FundingAccount = keyof typeof ACCOUNTS;
const ATHM: FundingAccount[] = ["assistive_technology", "home_modifications"];

export const PHASES = { quote: "Quote", receipt: "Paid receipt or final invoice", invoice: "Invoice after delivery" } as const;
export type Phase = keyof typeof PHASES;

export const SCRIPT_PARTS = {
  ack: "Acknowledge what they want",
  rule: "Explain the rule in plain words",
  split: "Show the split",
  next: "Offer a next step",
} as const;
export type ScriptPart = keyof typeof SCRIPT_PARTS;

export type XLine = {
  id: string;
  description: string;
  /** A second line of detail on the document. */
  detail: string;
  amountCents: number;
  outcome: LineOutcome;
  /** For an eligible line, the account it's funded from. */
  account: FundingAccount;
  /** Reasons that explain this line correctly. */
  reasons: string[];
  /** For a line that needs review: the missing evidence the learner must name. */
  evidence: string[];
  /** Why the tempting shortcut fails. */
  feedback: string;
  /** What would change the answer. */
  changes: string;
  /** What the answer rests on. */
  source: { rule: string; fact: string; procedure: string };
};

export type XRayBlockData = {
  title: string;
  intro: string;
  phase: Phase;
  supplier: string;
  docNumber: string;
  docDate: string;
  /** The day the decision is being made: dated rules apply as at this day. */
  decisionDate: string;
  participant: { name: string; about: string };
  /** The plan extract, approvals and agreed work: what the learner checks lines against. */
  facts: string[];
  /** A synthetic rate for the case, in basis points (2000 = 20%). Null shows "rate to be confirmed". */
  rate: { category: string; basisPoints: number | null };
  lines: XLine[];
  reasons: { id: string; text: string }[];
  /** The facts a learner can name as missing, for a line that needs review. */
  checks: { id: string; text: string }[];
  /** What can happen with this document now. */
  next: { prompt: string; options: { id: string; text: string; right: boolean; critical: boolean; why: string }[] };
  explain: {
    lineId: string;
    /** What the family asks. */
    ask: string;
    /** A grounded starting draft, in four parts. */
    draft: Record<ScriptPart, string>;
    /** The reviewed model script, shown after. */
    model: string;
    /** What a good explanation covers: each met if any of its words or phrases appear. */
    checklist: { id: string; label: string; anyOf: string[] }[];
    /** Phrases that make it wrong, with why. */
    avoid: { phrase: string; why: string }[];
  };
  /** One changed fact for a second try at a single line. */
  twist: { fact: string; lineId: string; outcome: LineOutcome; account: FundingAccount; why: string } | null;
  source: { title: string; version: string; reviewedOn: string };
  approval: { owner: string; finance: string; operations: string; quality: string; approvedOn: string };
  /** Quote and invoice review mode (lib/xrayFunding). Absent on a classic case. */
  funding?: FundingData;
};

export const XRAY_NOTICE =
  "A training case. The people, supplier and prices are made up. Nothing you do here creates a claim, a payment, a reimbursement, a supplier approval or a message to anyone.";
export const QUOTE_NOTE =
  "This is a quote. Every amount is an estimate, not a claim or a promise of payment. A contribution is never collected before the service is delivered.";
export const RECEIPT_NOTE =
  "This is a paid receipt or final invoice. An eligible line still needs evidence it was delivered or bought under the approved arrangement before anything is claimed.";
export const RATE_TBC = "rate to be confirmed";

// ---------------------------------------------------------------------------------------------
// Money, in whole cents
// ---------------------------------------------------------------------------------------------

export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: Math.abs(cents) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export type Split = {
  total: number;
  eligible: number;
  /** Null when the rate isn't known: shown as "rate to be confirmed". */
  contribution: number | null;
  subsidy: number | null;
  private: number;
  pending: number;
  unsorted: number;
};

/** The split for a set of outcomes. The contribution is the case's rate on the lines where one applies, rounded once, to the cent. */
export function splitOf(b: Pick<XRayBlockData, "lines" | "rate">, outcomes: Record<string, LineOutcome | "">): Split {
  let eligible = 0;
  let withContribution = 0;
  let priv = 0;
  let pending = 0;
  let unsorted = 0;
  let total = 0;
  for (const l of b.lines) {
    total += l.amountCents;
    const o = outcomes[l.id] ?? "";
    if (o === "eligible_no_contribution") eligible += l.amountCents;
    else if (o === "eligible_with_contribution") {
      eligible += l.amountCents;
      withContribution += l.amountCents;
    } else if (o === "excluded_private") priv += l.amountCents;
    else if (o === "needs_review") pending += l.amountCents;
    else unsorted += l.amountCents;
  }
  const rate = b.rate.basisPoints;
  const contribution = withContribution === 0 ? 0 : rate === null ? null : Math.round((withContribution * rate) / 10000);
  return { total, eligible, contribution, subsidy: contribution === null ? null : eligible - contribution, private: priv, pending, unsorted };
}
export const expectedSplit = (b: Pick<XRayBlockData, "lines" | "rate">) => splitOf(b, Object.fromEntries(b.lines.map((l) => [l.id, l.outcome])));

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
  The block's fields, checked. Publishing needs three to ten lines with whole-cent prices, a correct reason for
  each, the missing evidence for each line that needs review, the right account for each eligible line, a
  stated rate if any line carries a contribution, the "what happens now" question, the explanation, and sign-off.
*/
export function parseXRay(o: Raw, where: string, h: ParseHelpers): XRayBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const reasons = list(o.reasons, where, "reasons", 16).map((r, i) => ({
    id: idOf(r.id, `${where} reason ${i + 1}`),
    text: str(r.text, `${where} reason ${i + 1}`, { required: true, max: 240 }) ?? "",
  }));
  const checks = list(o.checks, where, "missing-evidence options", 12).map((r, i) => ({
    id: idOf(r.id, `${where} evidence ${i + 1}`),
    text: str(r.text, `${where} evidence ${i + 1}`, { required: true, max: 200 }) ?? "",
  }));
  const reasonIds = new Set(reasons.map((r) => r.id));
  const evidenceIds = new Set(checks.map((r) => r.id));
  // Review mode decides lines with its own six decisions; the four outcomes, their accounts and sign-off check are the classic case's.
  const review = Boolean(o.funding && typeof o.funding === "object");

  const lines = list(o.lines, where, "lines", 10).map((l, i): XLine => {
    const at = `${where} line ${i + 1}`;
    const outcome = review ? "needs_review" : oneOf(l.outcome, OUTCOME_ORDER, "needs_review");
    const cents = Number(l.amountCents);
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000_00) unfinished(`${at} needs a price in whole cents, more than nothing.`);
    const account = isEligible(outcome) ? oneOf(l.account, Object.keys(ACCOUNTS) as FundingAccount[], "none") : "none";
    if (isEligible(outcome) && account === "none") unfinished(`${at} is eligible, so it needs the account it’s funded from.`);
    const lineReasons = ids(l.reasons).filter((x) => reasonIds.has(x));
    if (!lineReasons.length) unfinished(`${at} needs at least one reason that explains it correctly.`);
    // In review mode the missing facts belong to any open decision (lib/xrayFunding checks they're there).
    const lineEvidence = outcome === "needs_review" ? ids(l.evidence).filter((x) => evidenceIds.has(x)) : [];
    if (outcome === "needs_review" && !lineEvidence.length && !review)
      unfinished(`${at} needs review, so it needs the missing evidence the learner must name.`);
    const s = obj(l.source);
    return {
      id: idOf(l.id, at),
      description: str(l.description, `${at} description`, { required: true, max: 160 }) ?? "",
      detail: str(l.detail, `${at} detail`, { max: 200 }) ?? "",
      amountCents: Number.isInteger(cents) && cents > 0 ? cents : 0,
      outcome,
      account,
      reasons: lineReasons,
      evidence: lineEvidence,
      feedback: str(l.feedback, `${at}: why the shortcut fails`, { required: true, max: 600 }) ?? "",
      changes: str(l.changes, `${at}: what changes the answer`, { required: true, max: 400 }) ?? "",
      source: {
        rule: str(s.rule, `${at}: the rule it rests on`, { required: true, max: 300 }) ?? "",
        fact: str(s.fact, `${at}: the participant fact it rests on`, { max: 300 }) ?? "",
        procedure: str(s.procedure, `${at}: the procedure`, { max: 300 }) ?? "",
      },
    };
  });
  if (lines.length < 3) unfinished(`${where} needs at least 3 lines.`);

  const r = obj(o.rate);
  const bp = r.basisPoints === null || r.basisPoints === undefined || r.basisPoints === "" ? null : Number(r.basisPoints);
  const basisPoints = bp !== null && Number.isInteger(bp) && bp >= 0 && bp <= 10000 ? bp : null;
  // A contribution with no stated rate is shown as "to be confirmed"; that's allowed, but the author is told.
  const rate = { category: str(r.category, `${where} contribution category`, { max: 120 }) ?? "", basisPoints };

  const n = obj(o.next);
  const options = list(n.options, where, "options for what happens next", 6).map((x, i) => ({
    id: idOf(x.id, `${where} next-step option ${i + 1}`),
    text: str(x.text, `${where} next-step option ${i + 1}`, { required: true, max: 240 }) ?? "",
    right: x.right === true,
    critical: x.right !== true && x.critical === true,
    why: str(x.why, `${where} next-step option ${i + 1}: why`, { required: true, max: 400 }) ?? "",
  }));
  if (options.filter((x) => x.right).length !== 1) unfinished(`${where}: “what happens now” needs exactly one right option.`);

  const e = obj(o.explain);
  const d = obj(e.draft);
  const lineIds = new Set(lines.map((l) => l.id));
  const explain = {
    lineId: typeof e.lineId === "string" && lineIds.has(e.lineId) ? e.lineId : "",
    ask: str(e.ask, `${where}: what the family asks`, { required: true, max: 400 }) ?? "",
    draft: Object.fromEntries(
      (Object.keys(SCRIPT_PARTS) as ScriptPart[]).map((k) => [k, str(d[k], `${where} draft: ${SCRIPT_PARTS[k].toLowerCase()}`, { max: 600 }) ?? ""]),
    ) as Record<ScriptPart, string>,
    model: str(e.model, `${where}: the reviewed model script`, { required: true, max: 2000 }) ?? "",
    checklist: list(e.checklist, where, "explanation points", 8).map((c, i) => ({
      id: idOf(c.id, `${where} explanation point ${i + 1}`),
      label: str(c.label, `${where} explanation point ${i + 1}`, { required: true, max: 200 }) ?? "",
      anyOf: texts(c.anyOf, `explanation point ${i + 1} word`, 80, 12).map((x) => x.toLowerCase()),
    })),
    avoid: list(e.avoid, where, "phrases to avoid", 8).map((x, i) => ({
      phrase: (str(x.phrase, `${where} phrase to avoid ${i + 1}`, { required: true, max: 120 }) ?? "").toLowerCase(),
      why: str(x.why, `${where} phrase to avoid ${i + 1}: why`, { required: true, max: 300 }) ?? "",
    })),
  };
  if (!explain.lineId) unfinished(`${where}: choose the line the learner explains to the family.`);
  if (!explain.checklist.length || explain.checklist.some((c) => !c.anyOf.length))
    unfinished(`${where}: each explanation point needs words or phrases to look for.`);

  const t = o.twist && typeof o.twist === "object" ? obj(o.twist) : null;
  const twist =
    t && typeof t.lineId === "string" && lineIds.has(t.lineId)
      ? {
          fact: str(t.fact, `${where}: the changed fact`, { required: true, max: 400 }) ?? "",
          lineId: t.lineId,
          outcome: oneOf(t.outcome, OUTCOME_ORDER, "needs_review"),
          account: oneOf(t.account, Object.keys(ACCOUNTS) as FundingAccount[], "none"),
          why: str(t.why, `${where}: why the changed fact changes it`, { required: true, max: 400 }) ?? "",
        }
      : null;

  const s = obj(o.source);
  const ap = obj(o.approval);
  const approval = {
    owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
    finance: str(ap.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
    operations: str(ap.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    approvedOn: date(ap.approvedOn),
  };
  const source = {
    title: str(s.title, `${where} ruleset`, { max: 200 }) ?? "",
    version: str(s.version, `${where} ruleset version`, { max: 80 }) ?? "",
    reviewedOn: date(s.reviewedOn),
  };
  // A review-mode case's sign-off is a publishing gate (lib/xrayFunding fundingHardProblems), as for the other specialist blocks.
  if (!review && !xrayApproved({ approval, source }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Finance, Care Operations and Quality reviewers, the date, and the ruleset and its version.`,
    );
  const docDate = date(o.docDate);
  const decisionDate = date(o.decisionDate);
  if (!docDate || !decisionDate) unfinished(`${where} needs the document’s date and the date the decision is made.`);
  const funding = review ? parseFunding(o.funding, where, h, lineIds) : undefined;
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    phase: oneOf(o.phase, Object.keys(PHASES) as Phase[], "quote"),
    supplier: str(o.supplier, `${where}: the fictional supplier`, { required: true, max: 120 }) ?? "",
    docNumber: str(o.docNumber, `${where} document number`, { max: 40 }) ?? "",
    docDate,
    decisionDate,
    participant: {
      name: str(obj(o.participant).name, `${where}: the participant’s name`, { required: true, max: 80 }) ?? "",
      about: str(obj(o.participant).about, `${where}: about the participant`, { max: 400 }) ?? "",
    },
    facts: texts(o.facts, "fact", 400, 10),
    rate,
    lines,
    reasons,
    checks,
    next: { prompt: str(n.prompt, `${where}: the “what happens now” question`, { required: true, max: 240 }) ?? "", options },
    explain,
    twist,
    source,
    approval,
    ...(funding ? { funding } : {}),
  };
}

/**
  Whether a case has its sign-off: owner, Finance, Care Operations, Quality, a date, and a ruleset version. A review-mode
  case also needs the Support at Home policy owner and the AT–HM or clinical reviewer.
*/
export const xrayApproved = (b: { approval: XRayBlockData["approval"]; source: { title: string; version: string }; funding?: FundingData }) =>
  Boolean(
    b.approval.owner &&
    b.approval.finance &&
    b.approval.operations &&
    b.approval.quality &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version &&
    (!b.funding || (b.funding.reviewers.policy && b.funding.reviewers.clinical)),
  );

/** The block as a learner's browser gets it: the document and the choices, without the answer key. */
export function xrayForReaders<T extends XRayBlockData>(b: T): T {
  return {
    ...b,
    lines: b.lines.map((l) => ({
      ...l,
      outcome: "needs_review" as const,
      account: "none" as const,
      reasons: [],
      evidence: [],
      feedback: "",
      changes: "",
      source: { rule: "", fact: "", procedure: "" },
    })),
    next: { ...b.next, options: b.next.options.map((x) => ({ ...x, right: false, critical: false, why: "" })) },
    explain: { ...b.explain, model: "", checklist: [], avoid: [] },
    twist: b.twist ? { ...b.twist, outcome: "needs_review" as const, account: "none" as const, why: "" } : null,
    ...(b.funding ? { funding: fundingForReaders(b.funding), approval: { owner: "", finance: "", operations: "", quality: "", approvedOn: "" } } : {}),
  };
}

/** A copy with ids of its own, so two X-Rays in one course never share an id. References follow. */
export function freshXRay(data: XRayBlockData, tag = Math.random().toString(36).slice(2, 7)): XRayBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    lines: c.lines.map((l) => ({ ...l, id: re(l.id), reasons: l.reasons.map(re), evidence: l.evidence.map(re) })),
    reasons: c.reasons.map((r) => ({ ...r, id: re(r.id) })),
    checks: c.checks.map((r) => ({ ...r, id: re(r.id) })),
    next: { ...c.next, options: c.next.options.map((x) => ({ ...x, id: re(x.id) })) },
    explain: { ...c.explain, lineId: re(c.explain.lineId), checklist: c.explain.checklist.map((x) => ({ ...x, id: re(x.id) })) },
    twist: c.twist ? { ...c.twist, lineId: re(c.twist.lineId) } : null,
    ...(c.funding ? { funding: freshFunding(c.funding, re) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type LinePick = {
  outcome: LineOutcome | "";
  account: FundingAccount | "";
  reason: string;
  evidence: string[];
  /** Review mode: the decision, the funding route, who the learner would ask. */
  decision?: FDecision | "";
  route?: Route | "";
  ask?: AskWho[];
  cite?: string;
};
export type XRayState = {
  /** Review mode: the evidence and sources opened, the overall result, the cited source and any coaching. */
  opened?: string[];
  overall?: Overall | "";
  firstDecisions?: Record<string, FDecision | "">;
  firstOverall?: Overall | "";
  cite?: string;
  coach?: { source: "ai" | "reviewed"; points: CoachPoint[] } | null;
  /** 0 sort the lines, 1 explain one line. */
  stage: number;
  picks: Record<string, LinePick>;
  next: string;
  /** Outcomes at the first submission, for the debrief. */
  first: Record<string, LineOutcome | "">;
  firstNext: string;
  tries: number;
  script: Record<ScriptPart, string>;
  usedDraft: boolean;
  scriptTries: number;
  /** After the debrief: the changed-fact retry. */
  twist: { outcome: LineOutcome | ""; account: FundingAccount | ""; decision?: FDecision } | null;
};
const blankScript = (): Record<ScriptPart, string> => ({ ack: "", rule: "", split: "", next: "" });
export const blankPick = (): LinePick => ({ outcome: "", account: "", reason: "", evidence: [] });
export const emptyState = (): XRayState => ({
  stage: 0,
  picks: {},
  next: "",
  first: {},
  firstNext: "",
  tries: 0,
  script: blankScript(),
  usedDraft: false,
  scriptTries: 0,
  twist: null,
});

export function cleanState(b: XRayBlockData, raw: unknown): XRayState {
  const r = obj(raw);
  const reasonIds = new Set(b.reasons.map((x) => x.id));
  const evidenceIds = new Set(b.checks.map((x) => x.id));
  const picks: Record<string, LinePick> = {};
  for (const l of b.lines) {
    const p = obj(obj(r.picks)[l.id]);
    if (!Object.keys(p).length) continue;
    if (b.funding) {
      picks[l.id] = cleanFundingPick(b, p);
      continue;
    }
    const outcome = oneOf(p.outcome, ["", ...OUTCOME_ORDER], "");
    picks[l.id] = {
      outcome,
      account: isEligible(outcome) ? oneOf(p.account, ["", ...(Object.keys(ACCOUNTS) as FundingAccount[])], "") : "",
      reason: typeof p.reason === "string" && reasonIds.has(p.reason) ? p.reason : "",
      evidence: outcome === "needs_review" ? [...new Set(ids(p.evidence).filter((x) => evidenceIds.has(x)))] : [],
    };
  }
  const first: Record<string, LineOutcome | ""> = {};
  for (const l of b.lines) {
    const v = obj(r.first)[l.id];
    if (typeof v === "string" && (OUTCOME_ORDER as string[]).includes(v)) first[l.id] = v as LineOutcome;
  }
  const sc = obj(r.script);
  const optionIds = new Set(b.next.options.map((x) => x.id));
  const tw = obj(r.twist);
  return {
    stage: Number.isInteger(r.stage) ? Math.min(1, Math.max(0, r.stage as number)) : 0,
    picks,
    next: typeof r.next === "string" && optionIds.has(r.next) ? r.next : "",
    first,
    firstNext: typeof r.firstNext === "string" && optionIds.has(r.firstNext) ? r.firstNext : "",
    tries: Number.isInteger(r.tries) ? Math.min(99, Math.max(0, r.tries as number)) : 0,
    script: Object.fromEntries(
      (Object.keys(SCRIPT_PARTS) as ScriptPart[]).map((k) => [k, typeof sc[k] === "string" ? (sc[k] as string).slice(0, 1200) : ""]),
    ) as Record<ScriptPart, string>,
    usedDraft: r.usedDraft === true,
    scriptTries: Number.isInteger(r.scriptTries) ? Math.min(99, Math.max(0, r.scriptTries as number)) : 0,
    twist:
      r.twist && typeof r.twist === "object"
        ? {
            outcome: oneOf(tw.outcome, ["", ...OUTCOME_ORDER], ""),
            account: oneOf(tw.account, ["", ...(Object.keys(ACCOUNTS) as FundingAccount[])], ""),
            // Review mode: the changed fact is answered with a decision.
            ...(b.funding && DECISION_ORDER.includes(tw.decision as FDecision) ? { decision: tw.decision as FDecision } : {}),
          }
        : null,
    ...(b.funding ? cleanFundingState(b, r) : {}),
  };
}

/** The parts the learner owns, from saved work. The stage and the first submission only change through submit. */
export function applyChanges(b: XRayBlockData, prev: XRayState, raw: unknown): XRayState {
  const next = cleanState(b, { ...prev, ...obj(raw), coach: prev.coach ?? null });
  return {
    ...prev,
    // The lines are settled once they've been submitted.
    picks: prev.stage === 0 ? next.picks : prev.picks,
    next: prev.stage === 0 ? next.next : prev.next,
    script: next.script,
    usedDraft: prev.usedDraft || next.usedDraft,
    twist: next.twist,
    ...(b.funding
      ? {
          // What's been opened stays opened; the overall result is settled with the lines; coaching only comes from the server.
          opened: [...new Set([...(prev.opened ?? []), ...(next.opened ?? [])])],
          overall: prev.stage === 0 ? next.overall : prev.overall,
          cite: next.cite,
          coach: prev.coach ?? null,
        }
      : {}),
  };
}

/** What's still to do on each line before submitting. */
export function incomplete(b: XRayBlockData, s: XRayState): string[] {
  if (b.funding) return fundingIncomplete(b, s);
  const out: string[] = [];
  b.lines.forEach((l, i) => {
    const p = s.picks[l.id] ?? blankPick();
    const n = `Line ${i + 1}`;
    if (!p.outcome) out.push(`${n}: choose what it is.`);
    else {
      if (isEligible(p.outcome) && !p.account) out.push(`${n}: choose the account it’s funded from.`);
      if (!p.reason) out.push(`${n}: choose the reason.`);
      if (p.outcome === "needs_review" && !p.evidence.length) out.push(`${n}: name what’s missing.`);
    }
  });
  if (!s.next) out.push("Say what can happen with this document now.");
  return out;
}

/**
  The mistakes that can't stand: approving a private expense (as an eligible line or a contribution), putting
  AT-HM work through the quarterly budget, and treating the document as something it isn't (claiming a quote,
  reimbursing because there's money left). Each says why the shortcut fails.
*/
export function criticalErrors(b: XRayBlockData, s: XRayState): { lineId: string | null; text: string }[] {
  if (b.funding) return fundingCritical(b, s).map((c) => ({ lineId: c.lineId, text: c.text }));
  const out: { lineId: string | null; text: string }[] = [];
  b.lines.forEach((l, i) => {
    const p = s.picks[l.id];
    if (!p?.outcome) return;
    if (l.outcome === "excluded_private" && isEligible(p.outcome))
      out.push({
        lineId: l.id,
        text: `Line ${i + 1}, ${l.description}: ${p.outcome === "eligible_with_contribution" ? "a private expense isn’t a participant contribution." : "this can’t go through their funding."} ${l.feedback}`,
      });
    if (ATHM.includes(l.account) && isEligible(l.outcome) && isEligible(p.outcome) && p.account === "ongoing_quarterly")
      out.push({
        lineId: l.id,
        text: `Line ${i + 1}, ${l.description}: AT-HM work isn’t paid from the quarterly budget for ongoing services. It has its own funding.`,
      });
  });
  const opt = b.next.options.find((x) => x.id === s.next);
  if (opt?.critical) out.push({ lineId: null, text: `“${opt.text}”: ${opt.why}` });
  return out;
}

/** Submits the sorted lines. Anything critical sends them back with why; otherwise on to the explanation. */
export function submitLines(b: XRayBlockData, s: XRayState): { state: XRayState; critical: { lineId: string | null; text: string }[] } | { problem: string } {
  if (s.stage !== 0) return { problem: "The lines are already in." };
  const missing = incomplete(b, s);
  if (missing.length) return { problem: `Every line needs an answer first. ${missing.join(" ")}` };
  const tried: XRayState = {
    ...s,
    tries: s.tries + 1,
    first: s.tries === 0 ? Object.fromEntries(b.lines.map((l) => [l.id, s.picks[l.id]?.outcome ?? ""])) : s.first,
    firstNext: s.tries === 0 ? s.next : s.firstNext,
    ...(b.funding
      ? {
          firstDecisions: s.tries === 0 ? Object.fromEntries(b.lines.map((l) => [l.id, s.picks[l.id]?.decision ?? ""])) : (s.firstDecisions ?? {}),
          firstOverall: s.tries === 0 ? (s.overall ?? "") : (s.firstOverall ?? ""),
        }
      : {}),
  };
  const critical = criticalErrors(b, s);
  if (critical.length) return { state: tried, critical };
  return { state: { ...tried, stage: 1, script: s.script }, critical: [] };
}

export type ScriptCheck = { covered: { id: string; label: string; met: boolean }[]; avoided: { phrase: string; why: string }[] };
/** Compares the explanation with the reviewed points, by the words and phrases each point looks for. */
export function checkScript(b: XRayBlockData, script: Record<ScriptPart, string>): ScriptCheck {
  const text = (Object.keys(SCRIPT_PARTS) as ScriptPart[])
    .map((k) => script[k])
    .join(" ")
    .toLowerCase()
    .replace(/[’‘]/g, "'");
  const norm = (x: string) => x.toLowerCase().replace(/[’‘]/g, "'");
  return {
    covered: b.explain.checklist.map((c) => ({ id: c.id, label: c.label, met: c.anyOf.some((w) => text.includes(norm(w))) })),
    avoided: b.explain.avoid.filter((a) => text.includes(norm(a.phrase))),
  };
}

/** Finishing: the explanation can't contain a phrase that makes it wrong, and needs something in each part. */
export function finishProblems(b: XRayBlockData, s: XRayState): string[] {
  if (b.funding) return fundingFinishProblems(b, s);
  if (s.stage !== 1) return ["Sort every line first."];
  const empty = (Object.keys(SCRIPT_PARTS) as ScriptPart[]).filter((k) => s.script[k].trim().length < 8);
  if (empty.length) return [`Write something for each part: ${empty.map((k) => SCRIPT_PARTS[k].toLowerCase()).join(", ")}.`];
  return checkScript(b, s.script).avoided.map((a) => `“${a.phrase}”: ${a.why}`);
}

// ---------------------------------------------------------------------------------------------
// The debrief: five dimensions, each on its own. No time, no number shown.
// ---------------------------------------------------------------------------------------------

export const DIMENSIONS = {
  identify: "Line identification",
  path: "Funding path",
  reason: "Reason accuracy",
  split: "The numbers",
  explain: "Explaining it to the family",
} as const;
export type XDim = keyof typeof DIMENSIONS;
export const RATING = ["Worth another look", "Partly there", "Strong"] as const;
const rate = (score: number) => RATING[score >= 0.8 ? 2 : score >= 0.45 ? 1 : 0];

export type LineResult = { id: string; outcomeRight: boolean; accountRight: boolean | null; reasonRight: boolean; evidenceRight: boolean | null };
export type XRayResult = {
  lines: LineResult[];
  dims: Record<XDim, { rating: (typeof RATING)[number]; notes: string[] }>;
  flags: { criticalFirstTry: number; tries: number; splitRight: boolean; avoidedPhrases: number; usedDraftUnchanged: boolean };
};

export function scoreXRay(b: XRayBlockData, s: XRayState): XRayResult {
  const lines: LineResult[] = b.lines.map((l) => {
    const p = s.picks[l.id] ?? blankPick();
    const outcomeRight = p.outcome === l.outcome;
    return {
      id: l.id,
      outcomeRight,
      accountRight: isEligible(l.outcome) && isEligible(p.outcome) ? p.account === l.account : null,
      // A correct label with the wrong explanation is incomplete.
      reasonRight: outcomeRight && l.reasons.includes(p.reason),
      evidenceRight: l.outcome === "needs_review" && p.outcome === "needs_review" ? l.evidence.every((e) => p.evidence.includes(e)) : null,
    };
  });
  const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : 1);
  const num = (i: number) => `Line ${i + 1}`;
  const notes = (pred: (r: LineResult) => boolean, what: string) => lines.map((r, i) => (pred(r) ? `${num(i)}: ${what}` : "")).filter(Boolean);

  const firstCritical = (() => {
    const firstState: XRayState = {
      ...s,
      picks: Object.fromEntries(b.lines.map((l) => [l.id, { ...(s.picks[l.id] ?? blankPick()), outcome: s.first[l.id] ?? "" }])),
      next: s.firstNext,
    };
    return criticalErrors(b, firstState).length;
  })();
  const theirs = splitOf(b, Object.fromEntries(b.lines.map((l) => [l.id, s.picks[l.id]?.outcome ?? ""])));
  const want = expectedSplit(b);
  const splitRight = (["eligible", "contribution", "private", "pending"] as const).every((k) => theirs[k] === want[k]);
  const check = checkScript(b, s.script);
  const draftUnchanged = s.usedDraft && (Object.keys(SCRIPT_PARTS) as ScriptPart[]).every((k) => s.script[k].trim() === b.explain.draft[k].trim());
  const nextOpt = b.next.options.find((x) => x.id === s.next);

  const identify = share(lines.map((r) => r.outcomeRight));
  const pathItems = lines.filter((r) => r.accountRight !== null).map((r) => Boolean(r.accountRight));
  const reasonItems = lines.map((r) => r.reasonRight && r.evidenceRight !== false);
  const covered = check.covered.filter((c) => c.met).length / Math.max(1, check.covered.length);
  const dims: XRayResult["dims"] = {
    identify: {
      rating: rate(identify - (firstCritical ? 0.15 : 0)),
      notes: [
        ...notes((r) => !r.outcomeRight, "not this outcome."),
        ...(firstCritical
          ? [`Your first submission had ${firstCritical} critical ${firstCritical === 1 ? "mistake" : "mistakes"}, put right before going on.`]
          : []),
      ],
    },
    path: {
      rating: rate(share(pathItems) - (nextOpt && !nextOpt.right ? 0.3 : 0)),
      notes: [
        ...notes((r) => r.accountRight === false, "funded from a different account."),
        ...(nextOpt && !nextOpt.right ? [`What happens now: ${nextOpt.why}`] : []),
      ],
    },
    reason: {
      rating: rate(share(reasonItems)),
      notes: [
        ...notes((r) => r.outcomeRight && !r.reasonRight, "the right outcome, for a different reason."),
        ...notes((r) => r.evidenceRight === false, "something missing wasn’t named."),
      ],
    },
    split: {
      rating: splitRight ? "Strong" : rate(identify),
      notes: splitRight ? [] : ["Your split doesn’t match the reviewed one, because some lines landed in a different column."],
    },
    explain: {
      rating: rate(covered - 0.3 * Math.min(1, s.scriptTries > 0 ? 1 : 0)),
      notes: [
        ...check.covered.filter((c) => !c.met).map((c) => `Not covered: ${c.label.toLowerCase()}.`),
        ...(s.scriptTries > 0 ? ["Your first version had a phrase that makes it wrong; you changed it."] : []),
        ...(draftUnchanged ? ["You used the starting draft as written. For a real participant, say it in your own words."] : []),
      ],
    },
  };
  return {
    lines,
    dims,
    flags: { criticalFirstTry: firstCritical, tries: s.tries, splitRight, avoidedPhrases: s.scriptTries, usedDraftUnchanged: draftUnchanged },
  };
}

export function buildDebrief(b: XRayBlockData, s: XRayState, r: XRayResult) {
  const reason = (id: string) => b.reasons.find((x) => x.id === id)?.text ?? "";
  const evidence = (id: string) => b.checks.find((x) => x.id === id)?.text ?? "";
  return {
    dims: (Object.keys(DIMENSIONS) as XDim[]).map((d) => ({ id: d, label: DIMENSIONS[d], ...r.dims[d] })),
    lines: b.lines.map((l, i) => {
      const p = s.picks[l.id] ?? blankPick();
      return {
        id: l.id,
        n: i + 1,
        description: l.description,
        amountCents: l.amountCents,
        theirs: { outcome: p.outcome, account: p.account, reason: reason(p.reason), evidence: p.evidence.map(evidence), first: s.first[l.id] ?? "" },
        reviewed: { outcome: l.outcome, account: l.account, reasons: l.reasons.map(reason), evidence: l.evidence.map(evidence) },
        result: r.lines[i],
        feedback: l.feedback,
        changes: l.changes,
        source: l.source,
      };
    }),
    split: { theirs: splitOf(b, Object.fromEntries(b.lines.map((l) => [l.id, s.picks[l.id]?.outcome ?? ""]))), reviewed: expectedSplit(b) },
    next: { chosen: b.next.options.find((x) => x.id === s.next) ?? null, right: b.next.options.find((x) => x.right) ?? null },
    explain: { lineId: b.explain.lineId, script: s.script, check: checkScript(b, s.script), model: b.explain.model },
    twist: b.twist,
    flags: r.flags,
    source: b.source,
  };
}
export type XRayDebrief = ReturnType<typeof buildDebrief>;
