/*
  Document Auditor (docs/document-auditor.md): a Magazine block where a learner inspects a fictional contractor pack
  or supplier invoice, marks specific evidence, compares it with trusted records, and decides Approve, Query or
  Reject current submission. Everything here is pure, so the server, the learner's page and the editor's preview
  run the same rules.

  - The answer key is authored, not generated: each piece of evidence has a rule, a status and a severity.
  - Dates and money are checked by plain functions (expiry, screening age, units × rate, rate variance, matching
    service dates). They explain a finding; they never invent a threshold.
  - Scoring rewards careful verification and a proportionate decision, not the number of red marks. Flagging a
    harmless difference counts against you; asking a sound question in a truly unclear case gets full credit.
  - Every person, business, ABN and document is fictional. Nothing here approves a supplier or pays an invoice.
*/

// ---------------------------------------------------------------------------------------------
// The case's parts
// ---------------------------------------------------------------------------------------------

export const MODES = { contractor_vetting: "Contractor Vetting", invoice_review: "Invoice Red Flags" } as const;
export type AuditMode = keyof typeof MODES;

export const DECISIONS = {
  approve: {
    label: "Approve",
    text: "The evidence in this practice case is enough for the task it sets. It doesn’t mean anyone has checked anything outside it.",
  },
  query: { label: "Query", text: "A material fact or document is missing, unclear or could be corrected. Hold until it’s resolved." },
  reject_current_submission: {
    label: "Reject current submission",
    text: "A confirmed failure or definite error in what was submitted. It doesn’t blacklist the supplier or refuse future work.",
  },
} as const;
export type Decision = keyof typeof DECISIONS;
export const DECISION_ORDER = Object.keys(DECISIONS) as Decision[];

export const CATEGORIES = {
  expired: "Expired",
  mismatch: "Mismatch",
  missing: "Missing",
  out_of_scope: "Out of scope",
  unverified: "Unverified",
  looks_correct: "Looks correct",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];

export const STATUSES = { verified: "Verified and sufficient", missing: "Missing", ambiguous: "Unclear: needs a query", failed: "Confirmed failure" } as const;
export type EvidenceStatus = keyof typeof STATUSES;
export const SEVERITIES = { information: "Information", query: "Query", block: "Blocks approval", escalate: "Possible integrity concern: escalate" } as const;
export type Severity = keyof typeof SEVERITIES;

export const ACTIONS = {
  hold: "Hold the engagement",
  corrected: "Ask for a corrected or current document or invoice",
  compliance: "Check with Compliance",
  clarify: "Clarify delivery or price with the participant",
  escalate: "Refer to Compliance or Finance as a possible integrity concern",
  proceed: "Proceed to the next simulated stage",
} as const;
export type NextAction = keyof typeof ACTIONS;

export const RULE_FAMILIES = {
  screening: "Worker screening",
  insurance: "Supplier insurance and documents",
  verification: "Ongoing verification",
  service_list: "Service list",
  contribution: "Contribution category",
  claims: "Claims and invoicing",
  pricing: "Pricing",
} as const;
export type RuleFamily = keyof typeof RULE_FAMILIES;

/** What a dated field holds, so the right check runs on it. */
export const DATE_KINDS = { "": "No date", expiry: "Expiry date", issued: "Issue date", service: "Service date" } as const;
export type DateKind = keyof typeof DATE_KINDS;

export type InvoiceLine = { qty: number; unit: string; rateCents: number; amountCents: number };
export type AuditField = { id: string; label: string; value: string; date: string; dateKind: DateKind; line: InvoiceLine | null };
/** A document under review (markable), or a trusted record it's compared with. */
export type AuditDoc = { id: string; kind: "document" | "record"; title: string; subtitle: string; fields: AuditField[] };
export type MissingItem = { id: string; label: string; note: string };
export type AuditRule = {
  id: string;
  family: RuleFamily;
  title: string;
  text: string;
  source: string;
  url: string;
  owner: string;
  effectiveFrom: string;
  reviewBy: string;
};
export type EvidenceItem = {
  id: string;
  /** A field on a document, or a row in the missing-document checklist. One of the two. */
  fieldId: string;
  missingId: string;
  /** Record fields it should be compared with. */
  compareWith: string[];
  ruleId: string;
  status: EvidenceStatus;
  severity: Severity;
  /** The categories that read it correctly. */
  categories: Category[];
  explain: string;
};
export type DecisionKey = { credit: "full" | "partial" | "none"; critical: boolean; why: string };

export type AuditorBlockData = {
  title: string;
  intro: string;
  mode: AuditMode;
  context: { role: string; participant: string; supplier: string; task: string };
  /** The simulated day the decision is made. */
  decisionDate: string;
  /** The proposed engagement date (vetting) or service period end (invoices): dated documents are checked against it. */
  engagementDate: string;
  docs: AuditDoc[];
  missing: MissingItem[];
  rules: AuditRule[];
  findings: EvidenceItem[];
  decisions: Record<Decision, DecisionKey>;
  actions: { id: NextAction; right: boolean; why: string }[];
  /** Shown on a second try, after a decision that didn't get full credit. */
  hint: string;
  /** One changed fact, after the debrief. */
  variant: { fact: string; decision: Decision; why: string } | null;
  source: { title: string; version: string; reviewedOn: string };
  approval: { owner: string; compliance: string; finance: string; operations: string; quality: string; approvedOn: string };
};

export const AUDITOR_NOTICE =
  "Practice documents: no real supplier or participant data. Nothing you decide here approves a supplier, pays an invoice or makes a claim.";

// ---------------------------------------------------------------------------------------------
// Deterministic checks: dates, money and identifiers
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(at(d));
/** Whole days from a to b (negative if b is earlier). */
export const daysBetween = (a: string, b: string) => Math.round((at(b) - at(a)) / DAY);
export const showDate = (d: string) =>
  isDate(d) ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(at(d))) : "";
export const money = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** An expiry date against the day it has to be valid on: expired when the expiry is before that day. */
export function expiryCheck(expiry: string, on: string) {
  const days = daysBetween(on, expiry);
  return { expired: days < 0, days };
}

/** How old a document is on a day, in whole years and months. */
export function ageOn(issued: string, on: string) {
  const a = new Date(at(issued));
  const b = new Date(at(on));
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12, totalMonths: months };
}

/** Units × rate, in whole cents. */
export const lineTotal = (l: Pick<InvoiceLine, "qty" | "rateCents">) => Math.round(l.qty * l.rateCents);

/** An invoice line against an agreed line: the difference in units and in rate, and whether its own sum adds up. */
export function compareLines(invoiced: InvoiceLine, agreed: Pick<InvoiceLine, "qty" | "rateCents">) {
  const rateDiff = invoiced.rateCents - agreed.rateCents;
  return {
    qtyDiff: Math.round((invoiced.qty - agreed.qty) * 100) / 100,
    rateDiffCents: rateDiff,
    ratePercent: agreed.rateCents ? Math.round((rateDiff / agreed.rateCents) * 1000) / 10 : null,
    sumAddsUp: lineTotal(invoiced) === invoiced.amountCents,
  };
}

/**
  Whether 11 digits pass the ABN checksum. A real-format ABN can belong to a real business, so a practice case
  must use one that fails it.
*/
export function abnChecksum(text: string) {
  const d = text.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = [...d].reduce((s, c, i) => s + (Number(c) - (i === 0 ? 1 : 0)) * w[i], 0);
  return sum % 89 === 0;
}

/** Text in the case that looks real: a valid-checksum ABN, an email, a phone number or a street address. */
export function auditorIdentifiers(b: Pick<AuditorBlockData, "docs" | "context">): string[] {
  const texts = [...b.docs.flatMap((d) => [d.title, d.subtitle, ...d.fields.flatMap((f) => [f.label, f.value])]), ...Object.values(b.context)];
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.match(/\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g) ?? []) if (abnChecksum(m)) out.add("an ABN that passes the real ABN checksum");
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) out.add("an email address");
    if (/(\+?61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b/.test(t) || /\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b/.test(t)) out.add("a phone number");
    if (/\b\d{1,4}\s+[A-Z][a-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Court|Ct|Place|Pl)\b/.test(t)) out.add("a street address");
  }
  return [...out];
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
const date = (v: unknown) => (typeof v === "string" && isDate(v) ? v : "");
const ids = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Who has to sign off: the owner, Compliance (vetting) or Finance (invoices), Care Operations and Quality, a date, and the ruleset version. */
export const auditorApproved = (b: Pick<AuditorBlockData, "mode" | "approval" | "source">) =>
  Boolean(
    b.approval.owner &&
    (b.mode === "contractor_vetting" ? b.approval.compliance : b.approval.finance) &&
    b.approval.operations &&
    b.approval.quality &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version,
  );

/** Rules whose review date has passed: a case can't be published on them. */
export const staleRules = (b: Pick<AuditorBlockData, "rules">, today: string) => b.rules.filter((r) => r.reviewBy && today && r.reviewBy < today);

/** What "Publish anyway" can't waive: sign-off, rules still in date, and nothing that looks like a real identifier. */
export function auditorHardProblems(b: AuditorBlockData, today: string): string[] {
  const out: string[] = [];
  if (!auditorApproved(b))
    out.push(
      `“${b.title}”: record the content owner, the ${b.mode === "contractor_vetting" ? "Supply Chain or Compliance" : "Finance"} reviewer, the Care Operations and Quality reviewers, the date, and the ruleset and its version.`,
    );
  for (const r of staleRules(b, today)) out.push(`“${b.title}”: the rule “${r.title}” was due for review on ${showDate(r.reviewBy)}. Confirm it’s current.`);
  const ids = auditorIdentifiers(b);
  if (ids.length) out.push(`“${b.title}” looks like it contains ${ids.join(" and ")}. Use fictional details only.`);
  return out;
}

/**
  The block's fields, checked. Publishing needs at least one document and one trusted record, evidence that points
  at real fields or checklist rows with a rule each, a full-credit decision, a right next action, dates that agree
  with the expiry findings, and sign-off.
*/
export function parseAuditor(o: Raw, where: string, h: ParseHelpers): AuditorBlockData {
  const { str, idOf, list, unfinished } = h;
  const c = obj(o.context);
  const docs = list(o.docs, where, "documents and records", 12).map((d, i): AuditDoc => {
    const w = `${where} document ${i + 1}`;
    const fields = list(d.fields, w, "fields", 16).map((f, j): AuditField => {
      const fw = `${w} field ${j + 1}`;
      const l = f.line && typeof f.line === "object" ? obj(f.line) : null;
      const line = l
        ? {
            qty: num(l.qty),
            unit: str(l.unit, `${fw} unit`, { max: 20 }) ?? "",
            rateCents: Math.round(num(l.rateCents)),
            amountCents: Math.round(num(l.amountCents)),
          }
        : null;
      return {
        id: idOf(f.id, fw),
        label: str(f.label, `${fw} label`, { required: true, max: 120 }) ?? "",
        value: str(f.value, `${fw} value`, { required: true, max: 400 }) ?? "",
        date: date(f.date),
        dateKind: oneOf(f.dateKind, Object.keys(DATE_KINDS) as DateKind[], ""),
        line,
      };
    });
    if (!fields.length) unfinished(`${w} needs at least one field.`);
    return {
      id: idOf(d.id, w),
      kind: d.kind === "record" ? "record" : "document",
      title: str(d.title, `${w} title`, { required: true, max: 160 }) ?? "",
      subtitle: str(d.subtitle, `${w} subtitle`, { max: 240 }) ?? "",
      fields,
    };
  });
  if (!docs.some((d) => d.kind === "document")) unfinished(`${where} needs at least one document to inspect.`);
  if (!docs.some((d) => d.kind === "record")) unfinished(`${where} needs at least one trusted record to compare with.`);
  const docFields = new Map(docs.filter((d) => d.kind === "document").flatMap((d) => d.fields.map((f) => [f.id, f] as const)));
  const recordFields = new Set(docs.filter((d) => d.kind === "record").flatMap((d) => d.fields.map((f) => f.id)));

  const missing = list(o.missing, where, "missing-document rows", 10).map((m, i) => ({
    id: idOf(m.id, `${where} missing row ${i + 1}`),
    label: str(m.label, `${where} missing row ${i + 1}`, { required: true, max: 160 }) ?? "",
    note: str(m.note, `${where} missing row ${i + 1} note`, { max: 240 }) ?? "",
  }));
  const missingIds = new Set(missing.map((m) => m.id));

  const rules = list(o.rules, where, "rules", 10).map((r, i): AuditRule => {
    const w = `${where} rule ${i + 1}`;
    const rule = {
      id: idOf(r.id, w),
      family: oneOf(r.family, Object.keys(RULE_FAMILIES) as RuleFamily[], "verification"),
      title: str(r.title, `${w} title`, { required: true, max: 160 }) ?? "",
      text: str(r.text, `${w} text`, { required: true, max: 800 }) ?? "",
      source: str(r.source, `${w} source`, { required: true, max: 240 }) ?? "",
      url: typeof r.url === "string" && /^https:\/\//.test(r.url) ? r.url.slice(0, 400) : "",
      owner: str(r.owner, `${w} owner`, { max: 120 }) ?? "",
      effectiveFrom: date(r.effectiveFrom),
      reviewBy: date(r.reviewBy),
    };
    if (!rule.effectiveFrom || !rule.reviewBy) unfinished(`${w} needs its effective date and review date.`);
    return rule;
  });
  const ruleIds = new Set(rules.map((r) => r.id));
  const engagementDate = date(o.engagementDate);

  const findings = list(o.findings, where, "answer-key findings", 20).map((e, i): EvidenceItem => {
    const w = `${where} finding ${i + 1}`;
    const fieldId = typeof e.fieldId === "string" && docFields.has(e.fieldId) ? e.fieldId : "";
    const missingId = !fieldId && typeof e.missingId === "string" && missingIds.has(e.missingId) ? e.missingId : "";
    if (!fieldId && !missingId) unfinished(`${w} must point at a document field or a missing-document row.`);
    const ruleId = typeof e.ruleId === "string" && ruleIds.has(e.ruleId) ? e.ruleId : "";
    if (!ruleId) unfinished(`${w} needs the rule it rests on.`);
    const status = oneOf(e.status, Object.keys(STATUSES) as EvidenceStatus[], "ambiguous");
    const severity = oneOf(e.severity, Object.keys(SEVERITIES) as Severity[], "query");
    const categories = ids(e.categories).filter((x): x is Category => CATEGORY_ORDER.includes(x as Category));
    if (!categories.length) unfinished(`${w} needs at least one category that reads it correctly.`);
    // An "expired" failure has to agree with the dates: a plain check, so the answer key can't contradict them.
    const f = docFields.get(fieldId);
    if (
      f &&
      status === "failed" &&
      categories.includes("expired") &&
      f.dateKind === "expiry" &&
      f.date &&
      engagementDate &&
      !expiryCheck(f.date, engagementDate).expired
    )
      unfinished(`${w} says the document has expired, but its expiry date is on or after the engagement date.`);
    return {
      id: idOf(e.id, w),
      fieldId,
      missingId,
      compareWith: ids(e.compareWith).filter((x) => recordFields.has(x)),
      ruleId,
      status,
      severity,
      categories,
      explain: str(e.explain, `${w} explanation`, { required: true, max: 800 }) ?? "",
    };
  });
  if (!findings.length) unfinished(`${where} needs its answer key: at least one finding.`);

  const dk = obj(o.decisions);
  const decisions = Object.fromEntries(
    DECISION_ORDER.map((k) => {
      const d = obj(dk[k]);
      const credit = oneOf(d.credit, ["full", "partial", "none"] as const, "none");
      return [
        k,
        {
          credit,
          critical: credit === "none" && d.critical === true,
          why: str(d.why, `${where}: why “${DECISIONS[k].label}” is or isn’t right`, { required: true, max: 600 }) ?? "",
        },
      ];
    }),
  ) as Record<Decision, DecisionKey>;
  if (!DECISION_ORDER.some((k) => decisions[k].credit === "full")) unfinished(`${where} needs at least one decision with full credit.`);

  const actions = list(o.actions, where, "next actions", 6)
    .map((a, i) => ({
      id: oneOf(a.id, Object.keys(ACTIONS) as NextAction[], "hold"),
      right: a.right === true,
      why: str(a.why, `${where} next action ${i + 1}: why`, { required: true, max: 400 }) ?? "",
    }))
    .filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i);
  if (!actions.some((a) => a.right)) unfinished(`${where} needs at least one right next action.`);

  const v = o.variant && typeof o.variant === "object" ? obj(o.variant) : null;
  const variant =
    v && typeof v.fact === "string" && v.fact.trim()
      ? {
          fact: str(v.fact, `${where}: the changed fact`, { required: true, max: 500 }) ?? "",
          decision: oneOf(v.decision, DECISION_ORDER, "query"),
          why: str(v.why, `${where}: why the changed fact changes it`, { required: true, max: 600 }) ?? "",
        }
      : null;

  const s = obj(o.source);
  const ap = obj(o.approval);
  const mode = oneOf(o.mode, Object.keys(MODES) as AuditMode[], "contractor_vetting");
  const decisionDate = date(o.decisionDate);
  if (!decisionDate) unfinished(`${where} needs the simulated decision date.`);
  if (!engagementDate) unfinished(`${where} needs the engagement or service date documents are checked against.`);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    mode,
    context: {
      role: str(c.role, `${where}: the learner’s role`, { required: true, max: 160 }) ?? "",
      participant: str(c.participant, `${where}: the participant`, { max: 300 }) ?? "",
      supplier: str(c.supplier, `${where}: the supplier`, { required: true, max: 300 }) ?? "",
      task: str(c.task, `${where}: the decision to make`, { required: true, max: 400 }) ?? "",
    },
    decisionDate,
    engagementDate,
    docs,
    missing,
    rules,
    findings,
    decisions,
    actions,
    hint: str(o.hint, `${where} hint`, { max: 400 }) ?? "",
    variant,
    source: {
      title: str(s.title, `${where} ruleset`, { max: 200 }) ?? "",
      version: str(s.version, `${where} ruleset version`, { max: 80 }) ?? "",
      reviewedOn: date(s.reviewedOn),
    },
    approval: {
      owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
      compliance: str(ap.compliance, `${where} Supply Chain or Compliance reviewer`, { max: 120 }) ?? "",
      finance: str(ap.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
      operations: str(ap.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
      quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
      approvedOn: date(ap.approvedOn),
    },
  };
}

/** The block as a learner's browser gets it: the documents, records, rules and choices, without the answer key. */
export function auditorForReaders<T extends AuditorBlockData>(b: T): T {
  const blank: DecisionKey = { credit: "none", critical: false, why: "" };
  return {
    ...b,
    findings: [],
    decisions: { approve: blank, query: blank, reject_current_submission: blank },
    actions: b.actions.map((a) => ({ ...a, right: false, why: "" })),
    hint: "",
    variant: b.variant ? { ...b.variant, decision: "query" as const, why: "" } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Mark = { id: string; fieldId: string; missingId: string; category: Category | ""; note: string; compared: string[] };
export type AuditState = {
  marks: Mark[];
  decision: Decision | "";
  rationale: string;
  action: NextAction | "";
  /** 0 while working; 1 once submitted (the debrief is showing). */
  stage: 0 | 1;
  /** The answer to the changed fact, after the debrief. */
  variant: Decision | "";
};
export const emptyState = (): AuditState => ({ marks: [], decision: "", rationale: "", action: "", stage: 0, variant: "" });

const documentFieldIds = (b: AuditorBlockData) => new Set(b.docs.filter((d) => d.kind === "document").flatMap((d) => d.fields.map((f) => f.id)));
const recordFieldIds = (b: AuditorBlockData) => new Set(b.docs.filter((d) => d.kind === "record").flatMap((d) => d.fields.map((f) => f.id)));

/** A learner's state from anywhere, kept to what this case has: one mark per field or row, comparisons only with records. */
export function cleanState(b: AuditorBlockData, raw: unknown): AuditState {
  const o = obj(raw);
  const fields = documentFieldIds(b);
  const records = recordFieldIds(b);
  const rows = new Set(b.missing.map((m) => m.id));
  const seen = new Set<string>();
  const marks = (Array.isArray(o.marks) ? o.marks : []).slice(0, 40).flatMap((x, i): Mark[] => {
    const m = obj(x);
    const fieldId = typeof m.fieldId === "string" && fields.has(m.fieldId) ? m.fieldId : "";
    const missingId = !fieldId && typeof m.missingId === "string" && rows.has(m.missingId) ? m.missingId : "";
    const key = fieldId || missingId;
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: typeof m.id === "string" && /^[\w-]{1,40}$/.test(m.id) ? m.id : `m${i + 1}`,
        fieldId,
        missingId,
        category: oneOf(m.category, CATEGORY_ORDER, "" as Category),
        note: typeof m.note === "string" ? m.note.slice(0, 300) : "",
        compared: ids(m.compared, 8).filter((r) => records.has(r)),
      },
    ];
  });
  return {
    marks,
    decision: oneOf(o.decision, DECISION_ORDER, "" as Decision),
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 1200) : "",
    action: b.actions.some((a) => a.id === o.action) ? (o.action as NextAction) : "",
    stage: o.stage === 1 ? 1 : 0,
    variant: oneOf(o.variant, DECISION_ORDER, "" as Decision),
  };
}

/** Changes from the learner's page. Once submitted, the marks and decision are settled; only the changed-fact answer can be added. */
export function applyChanges(b: AuditorBlockData, prev: AuditState, raw: unknown): AuditState {
  const next = cleanState(b, raw);
  if (prev.stage === 1) return { ...prev, variant: prev.variant || next.variant };
  return { ...next, stage: 0, variant: "" };
}

/** What's still needed before submitting. */
export function submitProblems(s: AuditState): string[] {
  const out: string[] = [];
  if (!s.marks.length) out.push("Mark at least one thing you checked, even if it looks correct.");
  if (s.marks.some((m) => !m.category)) out.push("Say what you noticed for each marker.");
  if (!s.decision) out.push("Choose Approve, Query or Reject current submission.");
  if (s.rationale.trim().length < 15) out.push("Give a short reason for your decision.");
  if (!s.action) out.push("Choose the next action.");
  return out;
}

/** "You identified 3 possible issues, compared 2 with another source, and chose Query." */
export function summary(s: AuditState) {
  const issues = s.marks.filter((m) => m.category && m.category !== "looks_correct");
  const compared = issues.filter((m) => m.compared.length).length;
  const n = issues.length;
  return `You identified ${n} possible ${n === 1 ? "issue" : "issues"}, compared ${compared} with another source${s.decision ? `, and chose ${DECISIONS[s.decision].label}` : ""}.`;
}

// ---------------------------------------------------------------------------------------------
// Reading an attempt against the answer key
// ---------------------------------------------------------------------------------------------

/** A finding the learner should notice (not just information), or a harmless difference to leave alone. */
export const isFinding = (e: Pick<EvidenceItem, "status" | "severity">) => e.status !== "verified" && e.severity !== "information";
export const isHarmless = (e: Pick<EvidenceItem, "status">) => e.status === "verified";

export const DIMENSIONS = {
  identification: "Finding the evidence",
  comparison: "Comparing sources",
  interpretation: "Reading it correctly",
  decision: "A proportionate decision",
  action: "A clear next action",
} as const;
export type AuditDim = keyof typeof DIMENSIONS;
export const RATING = ["Worth another look", "Partly there", "Strong"] as const;
const rate = (score: number) => RATING[score >= 0.8 ? 2 : score >= 0.45 ? 1 : 0];

export type ItemResult = {
  id: string;
  /** Something the learner should notice, rather than information or a harmless difference. */
  finding: boolean;
  marked: boolean;
  found: boolean;
  compared: boolean | null;
  readRight: boolean;
  falsePositive: boolean;
  category: Category | "";
};
export type AuditResult = {
  items: ItemResult[];
  /** Marks on things that aren't findings in this case. */
  extra: { markId: string; fieldId: string; missingId: string; category: Category | "" }[];
  scores: Record<AuditDim, number | null>;
  decision: Decision | "";
  decisionCredit: DecisionKey["credit"];
  critical: string | null;
  actionRight: boolean;
  falsePositives: number;
};

const targetOf = (e: Pick<EvidenceItem, "fieldId" | "missingId">) => e.fieldId || e.missingId;

export function scoreAuditor(b: AuditorBlockData, s: AuditState): AuditResult {
  const byTarget = new Map(s.marks.map((m) => [m.fieldId || m.missingId, m]));
  const items = b.findings.map((e): ItemResult => {
    const m = byTarget.get(targetOf(e));
    const flagged = Boolean(m && m.category && m.category !== "looks_correct");
    return {
      id: e.id,
      finding: isFinding(e),
      marked: Boolean(m),
      found: isFinding(e) ? flagged : Boolean(m),
      compared: e.compareWith.length ? Boolean(m && m.compared.some((r) => e.compareWith.includes(r))) : null,
      readRight: Boolean(m && m.category && e.categories.includes(m.category)),
      falsePositive: isHarmless(e) && flagged,
      category: m?.category ?? "",
    };
  });
  const keyed = new Set(b.findings.map(targetOf));
  const extra = s.marks
    .filter((m) => !keyed.has(m.fieldId || m.missingId) && m.category && m.category !== "looks_correct")
    .map((m) => ({ markId: m.id, fieldId: m.fieldId, missingId: m.missingId, category: m.category }));
  const falsePositives = items.filter((i) => i.falsePositive).length + extra.length;

  const findings = b.findings.filter(isFinding);
  const res = (e: EvidenceItem) => items.find((i) => i.id === e.id)!;
  const found = findings.filter((e) => res(e).found);
  // Flagging a harmless difference counts against finding the evidence: a false accusation isn't careful checking.
  const identification = Math.max(0, (findings.length ? found.length / findings.length : 1) - 0.2 * falsePositives);
  const needsCompare = found.filter((e) => e.compareWith.length);
  const comparison = needsCompare.length
    ? needsCompare.filter((e) => res(e).compared).length / needsCompare.length
    : findings.some((e) => e.compareWith.length)
      ? 0
      : null;
  const interpretation = findings.length ? findings.filter((e) => res(e).readRight).length / findings.length : falsePositives ? 0.5 : 1;
  const key = s.decision ? b.decisions[s.decision] : { credit: "none" as const, critical: false, why: "" };
  const action = b.actions.find((a) => a.id === s.action);
  return {
    items,
    extra,
    scores: {
      identification,
      comparison,
      interpretation,
      decision: key.credit === "full" ? 1 : key.credit === "partial" ? 0.5 : 0,
      action: action?.right ? 1 : 0,
    },
    decision: s.decision,
    decisionCredit: key.credit,
    critical: key.critical ? key.why : null,
    actionRight: Boolean(action?.right),
    falsePositives,
  };
}

/** The plain checks behind a field, in words: an expiry against the engagement date, a document's age, a line's arithmetic and comparison. */
export function fieldChecks(b: AuditorBlockData, fieldId: string, compareWith: string[]): string[] {
  const all = b.docs.flatMap((d) => d.fields.map((f) => ({ f, d })));
  const hit = all.find((x) => x.f.id === fieldId);
  if (!hit) return [];
  const f = hit.f;
  const out: string[] = [];
  const on = b.engagementDate;
  if (f.date && on && f.dateKind === "expiry") {
    const x = expiryCheck(f.date, on);
    out.push(
      x.expired
        ? `Expired ${showDate(f.date)}: ${-x.days} ${-x.days === 1 ? "day" : "days"} before ${showDate(on)}.`
        : `Valid until ${showDate(f.date)}: ${x.days} ${x.days === 1 ? "day" : "days"} after ${showDate(on)}.`,
    );
  }
  if (f.date && on && f.dateKind === "issued") {
    const a = ageOn(f.date, on);
    out.push(
      `Issued ${showDate(f.date)}: ${a.years} ${a.years === 1 ? "year" : "years"} and ${a.months} ${a.months === 1 ? "month" : "months"} old on ${showDate(on)}.`,
    );
  }
  if (f.line) {
    const total = lineTotal(f.line);
    out.push(
      total === f.line.amountCents
        ? `${f.line.qty} ${f.line.unit} × ${money(f.line.rateCents)} = ${money(total)}, as invoiced.`
        : `${f.line.qty} ${f.line.unit} × ${money(f.line.rateCents)} is ${money(total)}, but the line says ${money(f.line.amountCents)}.`,
    );
  }
  for (const r of compareWith) {
    const other = all.find((x) => x.f.id === r)?.f;
    if (!other) continue;
    if (f.line && other.line) {
      const c = compareLines(f.line, other.line);
      const parts = [];
      if (c.qtyDiff)
        parts.push(`${Math.abs(c.qtyDiff)} ${f.line.unit} ${c.qtyDiff > 0 ? "more" : "less"} than ${other.label.toLowerCase()} (${other.line.qty})`);
      if (c.rateDiffCents)
        parts.push(
          `${money(Math.abs(c.rateDiffCents))} ${c.rateDiffCents > 0 ? "more" : "less"} per ${f.line.unit.replace(/s$/, "")} than agreed (${money(other.line.rateCents)}${c.ratePercent !== null ? `, ${Math.abs(c.ratePercent)}%` : ""})`,
        );
      out.push(parts.length ? `Compared with ${other.label}: ${parts.join("; ")}.` : `Matches ${other.label}.`);
    }
    if (f.dateKind === "service" && other.dateKind === "service" && f.date && other.date)
      out.push(f.date === other.date ? `Same service date as ${other.label} (${showDate(f.date)}).` : `A different date from ${other.label}.`);
  }
  return out;
}

export function buildDebrief(b: AuditorBlockData, s: AuditState, r: AuditResult) {
  const fieldLabel = (id: string) => {
    for (const d of b.docs) {
      const f = d.fields.find((x) => x.id === id);
      if (f) return { doc: d.title, label: f.label, value: f.value };
    }
    return { doc: "", label: id, value: "" };
  };
  const what = (fieldId: string, missingId: string) => {
    if (fieldId) {
      const f = fieldLabel(fieldId);
      return `${f.doc}: ${f.label} (“${f.value}”)`;
    }
    return `Missing: ${b.missing.find((m) => m.id === missingId)?.label ?? missingId}`;
  };
  const marksBy = new Map(s.marks.map((m) => [m.fieldId || m.missingId, m]));
  const items = b.findings.map((e) => {
    const res = r.items.find((i) => i.id === e.id)!;
    const rule = b.rules.find((x) => x.id === e.ruleId) ?? null;
    const mark = marksBy.get(targetOf(e));
    return {
      what: what(e.fieldId, e.missingId),
      fieldId: e.fieldId,
      missingId: e.missingId,
      group: isHarmless(e)
        ? ("harmless" as const)
        : e.severity === "escalate"
          ? ("integrity" as const)
          : e.status === "failed"
            ? ("confirmed" as const)
            : ("clarify" as const),
      status: STATUSES[e.status],
      severity: SEVERITIES[e.severity],
      ...res,
      yourNote: mark?.note ?? "",
      yourCompared: (mark?.compared ?? []).map((x) => fieldLabel(x).label),
      expectedCompared: e.compareWith.map((x) => `${fieldLabel(x).doc}: ${fieldLabel(x).label}`),
      categories: e.categories.map((x) => CATEGORIES[x]),
      rule,
      explain: e.explain,
      checks: e.fieldId ? fieldChecks(b, e.fieldId, e.compareWith) : [],
    };
  });
  const yours = r.decision ? b.decisions[r.decision] : null;
  const action = b.actions.find((a) => a.id === s.action);
  return {
    summary: summary(s),
    dims: (Object.keys(DIMENSIONS) as AuditDim[]).map((k) => ({
      id: k,
      label: DIMENSIONS[k],
      rating: r.scores[k] === null ? null : rate(r.scores[k]!),
    })),
    items,
    extra: r.extra.map((x) => ({ ...x, what: what(x.fieldId, x.missingId), category: x.category ? CATEGORIES[x.category] : "" })),
    decision: {
      yours: r.decision ? DECISIONS[r.decision].label : "",
      credit: r.decisionCredit,
      why: yours?.why ?? "",
      critical: r.critical,
      best: DECISION_ORDER.filter((k) => b.decisions[k].credit === "full").map((k) => ({ label: DECISIONS[k].label, why: b.decisions[k].why })),
      rationale: s.rationale,
    },
    action: {
      yours: s.action ? ACTIONS[s.action] : "",
      right: r.actionRight,
      why: action?.why ?? "",
      best: b.actions.filter((a) => a.right).map((a) => ({ label: ACTIONS[a.id], why: a.why })),
    },
    variant: b.variant
      ? {
          fact: b.variant.fact,
          answered: s.variant || null,
          right: s.variant ? s.variant === b.variant.decision : null,
          decision: s.variant ? DECISIONS[b.variant.decision].label : null,
          why: s.variant ? b.variant.why : null,
        }
      : null,
  };
}
export type AuditDebrief = ReturnType<typeof buildDebrief>;

/** A copy with ids of its own, so two auditors in one course never share an id. References follow. */
export function freshAuditor(data: AuditorBlockData, tag = `${Math.floor(Math.random() * 10)}${Math.random().toString(36).slice(2, 6)}`): AuditorBlockData {
  // The suffix starts with a digit, so it can never be mistaken for the end of a word like "-agreed".
  const re = (id: string) => (id ? `${id.replace(/-k[0-9][a-z0-9]{4}$/, "")}-k${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    docs: c.docs.map((d) => ({ ...d, id: re(d.id), fields: d.fields.map((f) => ({ ...f, id: re(f.id) })) })),
    missing: c.missing.map((m) => ({ ...m, id: re(m.id) })),
    rules: c.rules.map((r) => ({ ...r, id: re(r.id) })),
    findings: c.findings.map((e) => ({
      ...e,
      id: re(e.id),
      fieldId: re(e.fieldId),
      missingId: re(e.missingId),
      compareWith: e.compareWith.map(re),
      ruleId: re(e.ruleId),
    })),
  };
}
