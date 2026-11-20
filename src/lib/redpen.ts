/*
  Red Pen critique (docs/red-pen.md). A fictional case brief beside a flawed care plan goal or progress note on a
  clipboard. The learner marks lines with a reason, rewrites the document, makes any escalation decision the case
  needs, then submits privately. Feedback comes from authored rules; the reviewed rewrite is revealed only after
  the first submission.

  - Judgement, not a word list: a documented diagnosis is kept; the same word as an unsupported inference is not.
  - Fact fidelity and missed escalation are critical: inventing an action or ignoring an urgent concern never passes.
  - Marking is deterministic and explained. Where a phrase check may have misread the wording, the learner is told
    to review it with a lead.
  - It's synthetic training content. Nothing here creates or changes a care record, and nothing is posted anywhere.
  Everything here is pure, so the server, the learner's page and the editor's preview run the same rules.
*/

export const MODES = { plan: "Care plan goal", note: "Progress note" } as const;
export type Mode = keyof typeof MODES;

export const REASONS = {
  judgement: "Judgement or label",
  inference: "Unsupported inference",
  goal: "Person’s goal missing",
  action: "Action not evidenced",
  vague: "Too vague to guide care",
  risk: "Risk or follow-up unclear",
  privacy: "Privacy issue",
  source: "Check the source",
} as const;
export type Reason = keyof typeof REASONS;

export const DIMS = {
  fidelity: "Fact fidelity",
  voice: "Person’s voice and dignity",
  purpose: "Document purpose",
  specificity: "Specificity and usefulness",
  escalation: "Escalation judgement",
  rationale: "Editing rationale",
} as const;
export type Dim = keyof typeof DIMS;

export const RESULTS = { strong: "Strong", revision: "Needs revision", critical: "Critical gap" } as const;
export type Result = keyof typeof RESULTS;
export type Severity = "critical" | "revision";

/** A line of the flawed document. `issue`: it should be marked; `retain`: it's accurate and should stay; `neutral`: either way. */
export type Segment = {
  id: string;
  text: string;
  expect: "issue" | "retain" | "neutral";
  reasons: Reason[];
  dim: Dim;
  feedback: string;
  /** A suggested replacement, shown after submission. */
  suggestion: string;
};
/** A deterministic check on the rewrite: words it must avoid, or must include at least one of. */
export type RewriteCheck = { id: string; kind: "avoid" | "include"; phrases: string[]; dim: Dim; severity: Severity; feedback: string };
export type EscalationOption = { id: string; text: string; verdict: "good" | "revision" | "critical"; feedback: string };

export type RedPenBlockData = {
  title: string;
  intro: string;
  mode: Mode;
  /** Who the learner is in the case. */
  role: string;
  brief: string;
  facts: { id: string; text: string }[];
  unknowns: string[];
  policyExcerpt: string;
  document: Segment[];
  checks: RewriteCheck[];
  escalation: { question: string; options: EscalationOption[] } | null;
  reviewed: {
    text: string;
    reviewer: string;
    reviewerRole: string;
    reviewedOn: string;
    /** Policy endorsed, as distinct from a peer perspective. */
    endorsed: boolean;
    notes: { quote: string; note: string }[];
    alternatives: string[];
  };
  /** At most this many "Needs revision" dimensions still pass (with no critical gap). */
  maxRevisions: number;
  communityPostId: string;
  policyIds: string[];
  standards: string;
  reviewDue: string;
  approval: { owner: string; clinical: string; quality: string; privacy: string; approvedOn: string };
};

export const REDPEN_NOTICE = "A fictional case for practice. Nothing here creates or changes a care record, and nothing you write is posted anywhere.";
export const CHECK_NOTE = "These checks look for authored words and phrases. If one seems to have misread what you wrote, review it with a lead.";

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
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const manyOf = <T extends string>(v: unknown, all: readonly T[]): T[] => [...new Set((Array.isArray(v) ? v : []).filter((x): x is T => all.includes(x as T)))];
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const REASON_IDS = Object.keys(REASONS) as Reason[];
const DIM_IDS = Object.keys(DIMS) as Dim[];

/** Things that look like real identifiers: an email, a phone number, a long ID number, a street address. */
export function identifierWarnings(text: string): string[] {
  const out: string[] = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) out.push("an email address");
  if (/(\+?61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b/.test(text) || /\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b/.test(text)) out.push("a phone number");
  if (/\b\d{9,11}\b/.test(text)) out.push("a long ID number");
  if (/\b\d{1,4}\s+[A-Z][a-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Court|Ct|Place|Pl)\b/.test(text)) out.push("a street address");
  return [...new Set(out)];
}

/**
  The block's fields, checked. It needs the brief and facts, a document of two or more lines with at least one
  line to mark, a reviewed rewrite with its reviewer, any escalation question's safe and critical options, no
  text that looks like a real identifier, and Clinical, Quality and Privacy sign-off with a review date.
*/
export function parseRedPen(o: Raw, where: string, h: ParseHelpers): RedPenBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const facts = list(o.facts, where, "facts", 10).map((f, i) => ({
    id: idOf(f.id, `${where} fact ${i + 1}`),
    text: str(f.text, `${where} fact ${i + 1}`, { required: true, max: 300 }) ?? "",
  }));
  if (!facts.length) unfinished(`${where} needs the case facts.`);
  const document = list(o.document, where, "document lines", 12).map((s, i): Segment => ({
    id: idOf(s.id, `${where} line ${i + 1}`),
    text: str(s.text, `${where} line ${i + 1}`, { required: true, max: 400 }) ?? "",
    expect: s.expect === "issue" || s.expect === "retain" ? s.expect : "neutral",
    reasons: manyOf(s.reasons, REASON_IDS),
    dim: oneOf(s.dim, DIM_IDS, "voice"),
    feedback: str(s.feedback, `${where} line ${i + 1} feedback`, { required: s.expect === "issue" || s.expect === "retain", max: 500 }) ?? "",
    suggestion: str(s.suggestion, `${where} line ${i + 1} suggestion`, { max: 400 }) ?? "",
  }));
  if (document.length < 2) unfinished(`${where} needs a document of at least two lines.`);
  if (!document.some((s) => s.expect === "issue")) unfinished(`${where} needs at least one line that should be marked.`);
  for (const s of document) if (s.expect === "issue" && !s.reasons.length) unfinished(`${where}: “${s.text.slice(0, 40)}” needs the reasons that fit it.`);
  const checks = list(o.checks, where, "rewrite checks", 12).map((c, i): RewriteCheck => ({
    id: idOf(c.id, `${where} check ${i + 1}`),
    kind: c.kind === "include" ? "include" : "avoid",
    phrases: texts(c.phrases, `check ${i + 1} phrase`, 80, 8),
    dim: oneOf(c.dim, DIM_IDS, "fidelity"),
    severity: c.severity === "critical" ? "critical" : "revision",
    feedback: str(c.feedback, `${where} check ${i + 1} feedback`, { required: true, max: 400 }) ?? "",
  }));
  for (const c of checks) if (!c.phrases.length) unfinished(`${where}: a rewrite check needs at least one phrase.`);
  const e = obj(o.escalation);
  const escalation = e.question
    ? {
        question: str(e.question, `${where} escalation question`, { max: 300 }) ?? "",
        options: list(e.options, where, "escalation options", 5).map((x, i): EscalationOption => ({
          id: idOf(x.id, `${where} escalation option ${i + 1}`),
          text: str(x.text, `${where} escalation option ${i + 1}`, { required: true, max: 300 }) ?? "",
          verdict: x.verdict === "good" || x.verdict === "critical" ? x.verdict : ("revision" as const),
          feedback: str(x.feedback, `${where} escalation option ${i + 1} feedback`, { required: true, max: 400 }) ?? "",
        })),
      }
    : null;
  if (escalation && !escalation.options.some((x) => x.verdict === "good")) unfinished(`${where}: the escalation question needs a safe option.`);
  const r = obj(o.reviewed);
  const reviewed = {
    text: str(r.text, `${where} reviewed rewrite`, { required: true, max: 2000 }) ?? "",
    reviewer: str(r.reviewer, `${where} reviewer`, { max: 80 }) ?? "",
    reviewerRole: str(r.reviewerRole, `${where} reviewer’s role`, { required: true, max: 80 }) ?? "",
    reviewedOn: date(r.reviewedOn),
    endorsed: r.endorsed === true,
    notes: list(r.notes, where, "rewrite notes", 8).map((n, i) => ({
      quote: str(n.quote, `${where} note ${i + 1} quote`, { max: 200 }) ?? "",
      note: str(n.note, `${where} note ${i + 1}`, { required: true, max: 400 }) ?? "",
    })),
    alternatives: texts(r.alternatives, "alternative phrasing", 400, 4),
  };
  const ids = redPenIdentifiers({ brief: typeof o.brief === "string" ? o.brief : "", facts, document, reviewed });
  if (ids.length) unfinished(`${where} looks like it contains ${ids.join(" and ")}. Use fictional, de-identified details only.`);
  const a = obj(o.approval);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    clinical: str(a.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(a.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const policyIds = texts(o.policyIds, "policy ID", 80, 6);
  const reviewDue = date(o.reviewDue);
  if (!redPenApproved({ approval, policyIds, reviewDue }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Clinical, Quality and Privacy reviewers, the date, the policy IDs and the review date.`,
    );
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    mode: o.mode === "note" ? "note" : "plan",
    role: str(o.role, `${where} learner’s role`, { max: 160 }) ?? "",
    brief: str(o.brief, `${where} brief`, { required: true, max: 1200 }) ?? "",
    facts,
    unknowns: texts(o.unknowns, "unknown", 300, 6),
    policyExcerpt: str(o.policyExcerpt, `${where} policy excerpt`, { max: 800 }) ?? "",
    document,
    checks,
    escalation,
    reviewed,
    maxRevisions: Number.isInteger(o.maxRevisions) ? Math.min(6, Math.max(0, o.maxRevisions as number)) : 2,
    communityPostId: typeof o.communityPostId === "string" ? o.communityPostId.slice(0, 80) : "",
    policyIds,
    standards: str(o.standards, `${where} standards`, { max: 200 }) ?? "",
    reviewDue,
    approval,
  };
}

/** Identifier-like text anywhere in the case, the document or the reviewed rewrite. Checked again at publish, where "Publish anyway" can't waive it. */
export const redPenIdentifiers = (b: Pick<RedPenBlockData, "brief" | "facts" | "document"> & { reviewed: { text: string } }) =>
  identifierWarnings([b.brief, ...b.facts.map((f) => f.text), ...b.document.map((s) => s.text), b.reviewed.text].join("\n"));

export const redPenApproved = (b: { approval: RedPenBlockData["approval"]; policyIds: string[]; reviewDue: string }) =>
  Boolean(b.approval.owner && b.approval.clinical && b.approval.quality && b.approval.privacy && b.approval.approvedOn && b.policyIds.length && b.reviewDue);
/** Past its review date: the endorsement badge is retired and the activity is marked for review. */
export const redPenStale = (b: Pick<RedPenBlockData, "reviewDue">, today: string) => Boolean(b.reviewDue && today && b.reviewDue < today);

/** The reader's copy: the brief, facts and document, without what each line should be, the checks, or the reviewed rewrite. */
export function redPenForReaders<T extends RedPenBlockData>(b: T): T {
  return {
    ...b,
    document: b.document.map((s) => ({ ...s, expect: "neutral" as const, reasons: [], dim: "voice" as const, feedback: "", suggestion: "" })),
    checks: [],
    escalation: b.escalation
      ? { question: b.escalation.question, options: b.escalation.options.map((x) => ({ ...x, verdict: "revision" as const, feedback: "" })) }
      : null,
    reviewed: { text: "", reviewer: "", reviewerRole: b.reviewed.reviewerRole, reviewedOn: "", endorsed: false, notes: [], alternatives: [] },
  };
}

export function freshRedPen(data: RedPenBlockData, tag = Math.random().toString(36).slice(2, 7)): RedPenBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    facts: c.facts.map((f) => ({ ...f, id: re(f.id) })),
    document: c.document.map((s) => ({ ...s, id: re(s.id) })),
    checks: c.checks.map((x) => ({ ...x, id: re(x.id) })),
    escalation: c.escalation ? { ...c.escalation, options: c.escalation.options.map((x) => ({ ...x, id: re(x.id) })) } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Mark = { reason: Reason; note: string; replacement: string };
export type Attempt = {
  marks: Record<string, Mark>;
  /** Lines deliberately left unmarked, with why. */
  kept: Record<string, string>;
  rewrite: string;
  escalation: string;
};
export const blankAttempt = (b: Pick<RedPenBlockData, "document">): Attempt => ({
  marks: {},
  kept: {},
  rewrite: b.document.map((s) => s.text).join(" "),
  escalation: "",
});

export function cleanAttempt(b: Pick<RedPenBlockData, "document" | "escalation">, raw: unknown): Attempt {
  const r = obj(raw);
  const ids = new Set(b.document.map((s) => s.id));
  const marks: Record<string, Mark> = {};
  for (const [k, v] of Object.entries(obj(r.marks))) {
    const m = obj(v);
    if (ids.has(k) && REASON_IDS.includes(m.reason as Reason))
      marks[k] = {
        reason: m.reason as Reason,
        note: typeof m.note === "string" ? m.note.slice(0, 300) : "",
        replacement: typeof m.replacement === "string" ? m.replacement.slice(0, 400) : "",
      };
  }
  const kept: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.kept))) if (ids.has(k) && !marks[k] && typeof v === "string" && v.trim()) kept[k] = v.slice(0, 300);
  return {
    marks,
    kept,
    rewrite: typeof r.rewrite === "string" ? r.rewrite.slice(0, 3000) : "",
    escalation: b.escalation && typeof r.escalation === "string" && b.escalation.options.some((x) => x.id === r.escalation) ? r.escalation : "",
  };
}

/** Builds a rewrite from the document with the learner's replacements put in (a starting point to edit). */
export const applyReplacements = (b: Pick<RedPenBlockData, "document">, a: Attempt) =>
  b.document
    .map((s) => (a.marks[s.id] ? a.marks[s.id].replacement.trim() : s.text))
    .filter(Boolean)
    .join(" ");

export function submitProblems(b: Pick<RedPenBlockData, "escalation">, a: Attempt): string[] {
  const out: string[] = [];
  if (a.rewrite.trim().length < 10) out.push("Write your rewrite.");
  if (b.escalation && !a.escalation) out.push("Make the escalation decision: rewriting the note doesn’t do it.");
  return out;
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ")} `;
export const hasPhrase = (text: string, phrase: string) => norm(text).includes(norm(phrase).trim());

export type Finding = { dim: Dim; result: Result; text: string; feedback: string };
export type Feedback = {
  pass: boolean;
  result: Result;
  dims: { dim: Dim; label: string; result: Result; notes: string[] }[];
  lines: { id: string; text: string; marked: Reason | ""; verdict: Result; feedback: string; suggestion: string }[];
  rewrite: Finding[];
  escalation: { text: string; verdict: Result; feedback: string } | null;
};

const RANK: Record<Result, number> = { strong: 0, revision: 1, critical: 2 };
const worst = (xs: Result[]): Result =>
  xs.reduce((n, x) => Math.max(n, RANK[x]), 0) === 2 ? "critical" : xs.some((x) => x === "revision") ? "revision" : "strong";

/** Reads a submission against the authored lines, checks and escalation key. Never against similarity to the reviewed rewrite. */
export function readAttempt(b: RedPenBlockData, a: Attempt): Feedback {
  const findings: Finding[] = [];
  const lines = b.document.map((s) => {
    const m = a.marks[s.id];
    let verdict: Result = "strong";
    let feedback = "";
    if (s.expect === "issue") {
      if (!m) {
        verdict = "revision";
        feedback = a.kept[s.id] ? `You left this deliberately (“${a.kept[s.id]}”). ${s.feedback}` : `Not marked. ${s.feedback}`;
      } else if (!s.reasons.includes(m.reason)) {
        verdict = "revision";
        feedback = `You spotted it. The main problem: ${s.reasons.map((r) => REASONS[r].toLowerCase()).join(" or ")}. ${s.feedback}`;
      } else feedback = s.feedback;
      if (verdict !== "strong") findings.push({ dim: "rationale", result: "revision", text: s.text, feedback });
    } else if (s.expect === "retain") {
      if (m) {
        verdict = "revision";
        feedback = `This one is accurate and should stay. ${s.feedback}`;
        findings.push({ dim: "rationale", result: "revision", text: s.text, feedback });
      } else feedback = s.feedback;
    }
    return { id: s.id, text: s.text, marked: (m?.reason ?? "") as Reason | "", verdict, feedback, suggestion: s.suggestion };
  });
  const rewrite: Finding[] = [];
  for (const c of b.checks) {
    const hit = c.phrases.find((p) => hasPhrase(a.rewrite, p));
    const failed = c.kind === "avoid" ? Boolean(hit) : !hit;
    if (!failed) continue;
    const f: Finding = {
      dim: c.dim,
      result: c.severity === "critical" ? "critical" : "revision",
      text: c.kind === "avoid" ? `Your rewrite says “${hit}”.` : "Your rewrite leaves this out.",
      feedback: c.feedback,
    };
    rewrite.push(f);
    findings.push(f);
  }
  let escalation: Feedback["escalation"] = null;
  if (b.escalation) {
    const o = b.escalation.options.find((x) => x.id === a.escalation);
    const verdict: Result = !o ? "critical" : o.verdict === "good" ? "strong" : o.verdict;
    escalation = { text: o?.text ?? "No escalation decision", verdict, feedback: o?.feedback ?? "An urgent concern needs its own response." };
    if (verdict !== "strong") findings.push({ dim: "escalation", result: verdict, text: escalation.text, feedback: escalation.feedback });
  }
  const dims = DIM_IDS.map((dim) => {
    const mine = findings.filter((f) => f.dim === dim);
    return { dim, label: DIMS[dim] as string, result: worst(mine.map((f) => f.result)), notes: mine.map((f) => f.feedback) };
  }).filter((d) => d.dim !== "escalation" || b.escalation);
  const result = worst(dims.map((d) => d.result));
  const revisions = dims.filter((d) => d.result === "revision").length;
  return { pass: result !== "critical" && revisions <= b.maxRevisions, result, dims, lines, rewrite, escalation };
}

/** Where the learner is: an unsent draft, every submission (the first is frozen), whether they've compared, and a reflection. */
export type RedPenState = { draft: Attempt | null; submissions: Attempt[]; compared: boolean; reflection: string; passed: boolean };
export const emptyRedPen = (): RedPenState => ({ draft: null, submissions: [], compared: false, reflection: "", passed: false });

export function cleanRedPenState(b: RedPenBlockData, raw: unknown): RedPenState {
  const r = obj(raw);
  return {
    draft: r.draft ? cleanAttempt(b, r.draft) : null,
    submissions: (Array.isArray(r.submissions) ? r.submissions : []).slice(0, 20).map((x) => cleanAttempt(b, x)),
    compared: r.compared === true,
    reflection: typeof r.reflection === "string" ? r.reflection.slice(0, 600) : "",
    passed: r.passed === true,
  };
}

export function submit(b: RedPenBlockData, s: RedPenState, a: Attempt): { state: RedPenState; feedback: Feedback } | { problem: string } {
  const problems = submitProblems(b, a);
  if (problems.length) return { problem: problems.join(" ") };
  const feedback = readAttempt(b, a);
  return { state: { ...s, draft: null, submissions: [...s.submissions, a].slice(-20), passed: s.passed || feedback.pass }, feedback };
}

// ---------------------------------------------------------------------------------------------
// Comparing with the reviewed rewrite
// ---------------------------------------------------------------------------------------------

export type DiffPart = { kind: "same" | "add" | "del"; text: string };
/** A word-level difference from `a` to `b` (longest common subsequence), for the comparison view. */
export function diffWords(a: string, b: string): DiffPart[] {
  const x = a.split(/(\s+)/).filter(Boolean).slice(0, 600);
  const y = b.split(/(\s+)/).filter(Boolean).slice(0, 600);
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push("same", x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < n) push("del", x[i++]);
  while (j < m) push("add", y[j++]);
  // Group each run of changes (spaces between changed words included) into one removal then one addition, so it reads as phrases.
  const grouped: DiffPart[] = [];
  let del = "";
  let add = "";
  const flush = () => {
    if (del) grouped.push({ kind: "del", text: del });
    if (add) grouped.push({ kind: "add", text: add });
    del = add = "";
  };
  out.forEach((p, k) => {
    const between = p.kind === "same" && !p.text.trim() && (del || add) && out[k + 1] && out[k + 1].kind !== "same";
    if (p.kind === "del") del += p.text;
    else if (p.kind === "add") add += p.text;
    else if (between) {
      del += p.text;
      add += p.text;
    } else {
      flush();
      grouped.push(p);
    }
  });
  flush();
  return grouped;
}
