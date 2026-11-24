import { gateQuestion } from "./playbook";
import { identifierWarnings } from "./redpen";

/*
  "What Would You Do?" Community Case Threads (docs/case-threads.md): a fictional care coordination dilemma, a
  private first take, then one canonical moderated discussion that shows the same posts, votes, comments and
  moderation state in the Magazine block and on the Community page.

  This module is the shared, pure part: the block's fields, reading it from stored JSON, the readers' copy (without
  the case note, self-review or seed responses, which the server sends only after a first take), the publish checks
  and source guardrails, the screening of what a learner writes, how the feed is ordered, and what completes it.

  - Popularity never confers endorsement. Helpful votes only order peer responses among themselves; a Quality-endorsed
    example is a moderator's act with a reviewer, date and case version, and the pinned case note sits apart from both.
  - Completion is the learner's own reflective practice (a first take, the case note, at least one peer approach and
    a reflection). Never votes, posting, receiving votes or commenting. It's never evidence of clinical competence.
*/

export const CASE_AUDIENCES = { coordinator: "Care coordinators", partner: "Care partners", staff: "Trilogy Care staff" } as const;
/** Who a thread is for, as it reads in a sentence. */
export const CASE_AUDIENCE_PHRASES = { coordinator: "care coordinators", partner: "care partners", staff: "Trilogy Care staff" } as const;
export type CaseAudience = keyof typeof CASE_AUDIENCES;

export type CaseSeed = {
  id: string;
  /** A fictional first name, always shown with "fictional seed". */
  name: string;
  /** The voice it's written in, like "Care partner, 7 years". */
  role: string;
  body: string;
  /** What coordinators found useful about it. */
  why: string;
};
export type CaseSource = { title: string; href: string };

export type CaseThreadData = {
  /** The canonical Community thread: the same id wherever the case is placed. */
  threadId: string;
  title: string;
  /** Who can see and join the thread (the visibility cohort). Empty: the course's own audience. */
  audience: CaseAudience[];
  /** The learner's role in the case. */
  role: string;
  /** The learning aim, in a sentence. */
  aim: string;
  /** The fictional scene. */
  scene: string;
  /** The fictional people the case names, so writing about them isn't mistaken for a real person. */
  people: string[];
  known: string[];
  unknowns: string[];
  /** The immediate-safety trigger: what turns this into a live matter for the approved pathway. */
  safetyCue: string;
  /** A related Hub page or topic. */
  related: { title: string; href: string };
  prompts: { say: string; do: string; who: string };
  /** Guidance for the first take's length, in words. Not a limit. */
  words: { min: number; max: number };
  /** The approved self-review questions shown before the replies. */
  checklist: string[];
  /** "What would you keep or change in your original response?" */
  reflection: string;
  /** The pinned, Quality-reviewed case note. */
  caseNote: { title: string; summary: string; boundaries: string[]; teach: string; sources: CaseSource[] };
  /** The governing policy or contract and its version: changing the version withdraws endorsements and marks saved scripts stale. */
  policy: { title: string; version: string; owner: string };
  reviewDue: string;
  /** Three to five varied seed responses, written for the case and labelled as fictional seeds. */
  seeds: CaseSeed[];
  /** Case approval: content owner, Clinical, Quality and the Community owner, and the date. Never pre-filled. */
  approval: { owner: string; clinical: string; quality: string; community: string; approvedOn: string };
};

export const FICTIONAL_NOTICE = "Fictional learning scenario. The people and details are made up.";
export const LIVE_NOTICE = "For a live concern, use Trilogy Care’s approved escalation pathway.";
export const LIVE_ROUTE = {
  title: "This sounds like something happening to a real person",
  text: "Don’t post it here: this discussion isn’t monitored in real time and isn’t a reporting system. If someone is in danger, call 000. Then follow the incident first steps and contact your clinical or care partner team now.",
  href: "/tools/sirs-first-steps",
  linkText: "Incident first steps",
  after: "Nothing has been saved or posted, and no incident report has been lodged. Use the approved pathway for that.",
};
export const PEER_LABEL = "Peer idea";
export const ENDORSED_LABEL = "Quality-endorsed example";
export const SEED_LABEL = "Fictional seed response";
export const VERIFIED_LABEL = "Verified experienced coordinator";
export const NOTE_LABEL = "Quality-reviewed case note";
export const COMPLETION_NOTE = "Votes, comments and sharing are optional. They never count towards finishing.";
export const EVIDENCE_NOTE = "Recorded as reflective practice. It isn’t an assessment or proof of clinical competence.";

/** Shown before anything is shared. The server needs all three confirmed. */
export const SHARE_CHECKS = [
  "It uses only the case’s fictional details: no real client, worker, family member or place.",
  "It isn’t about something happening now to a real person.",
  "A moderator reads it before anyone else sees it, and it shows with my first name and role.",
] as const;

/** The reflection rubric (PRD section 8): prompts for the learner's own review, never a score. */
export const RUBRIC = [
  { id: "voice", label: "Client voice", text: "Asks what matters to the person and avoids shaming or coercion." },
  { id: "safety", label: "Safety first", text: "Identifies immediate danger and the live escalation route." },
  { id: "boundary", label: "Provider boundary", text: "Explains what must be checked or approved before funded services change." },
  { id: "action", label: "Action", text: "Suggests practical alternatives, contact, follow-up and documentation." },
  { id: "uncertainty", label: "Uncertainty", text: "Doesn’t invent facts or assert a legal or clinical outcome without basis." },
] as const;

export const THREAD_STATUS = {
  open: "Open",
  paused: "Paused for review",
  archived: "Archived",
} as const;
export type ThreadStatus = keyof typeof THREAD_STATUS;

export const POST_STATUS = {
  pending: "Waiting for a moderator",
  revision: "A moderator asked for changes",
  approved: "Published",
  reported: "Hidden while a report is reviewed",
  rejected: "Not published",
  hidden: "Hidden by a moderator",
  archived: "Archived as outdated",
  escalated: "Hidden and escalated to a designated moderator",
  withdrawn: "Withdrawn by you",
} as const;
export type PostStatus = keyof typeof POST_STATUS;

export const FEED_VIEWS = {
  helpful: {
    label: "Helpful coordinator responses",
    text: "Verified coordinators and seed responses, ordered by helpful votes. Votes show useful phrasing, not policy.",
  },
  others: { label: "Other perspectives", text: "Approved responses from other roles, newest first." },
  recent: { label: "Recent", text: "Every approved response, newest first." },
  all: { label: "All approved", text: "Every approved response in the order it was posted, including ones from an earlier policy version." },
} as const;
export type FeedView = keyof typeof FEED_VIEWS;

export const MOD_ACTIONS = {
  approve: "Publish",
  reject: "Don’t publish",
  revise: "Ask for changes",
  hide: "Hide",
  restore: "Restore",
  archive: "Archive as outdated",
  escalate: "Escalate",
  annotate: "Add a moderator note",
  endorse: "Mark as a Quality-endorsed example",
  unendorse: "Withdraw the endorsement",
} as const;
export type ModAction = keyof typeof MOD_ACTIONS;
/** Moderator decisions that need a reason, for the author and the audit trail. */
export const NEEDS_REASON: ModAction[] = ["reject", "revise", "hide", "archive", "escalate", "annotate", "unendorse"];

/** Reporting events (aggregate only: ids and counts, never anyone's words). */
export const CASE_EVENTS = [
  "draft_saved",
  "first_take_submitted",
  "checklist_saved",
  "note_viewed",
  "peer_viewed",
  "vote_added",
  "vote_removed",
  "comment_submitted",
  "script_saved",
  "script_removed",
  "reflection_saved",
  "revised_saved",
  "share_submitted",
  "post_edited",
  "report_made",
  "live_interrupt",
  "completed",
] as const;
export type CaseEvent = (typeof CASE_EVENTS)[number];

// ---------------------------------------------------------------------------------------------
// Reading the block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type CaseParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
export const THREAD_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SEED_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const num = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);

export function parseCaseThread(o: Raw, where: string, h: CaseParseHelpers): CaseThreadData {
  const { str, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const threadId = typeof o.threadId === "string" ? o.threadId.trim() : "";
  if (!THREAD_ID.test(threadId)) unfinished(`${where} needs a thread id of lower-case letters, numbers and hyphens (it names the one Community thread).`);
  const audience = [...new Set((Array.isArray(o.audience) ? o.audience : []).filter((a): a is CaseAudience => typeof a === "string" && a in CASE_AUDIENCES))];
  const p = obj(o.prompts);
  const w = obj(o.words);
  const n = obj(o.caseNote);
  const pol = obj(o.policy);
  const ap = obj(o.approval);
  const rel = obj(o.related);
  const seedIds = new Set<string>();
  const seeds = list(o.seeds, where, "seed responses", 6).map((s, i) => {
    let id = typeof s.id === "string" && SEED_ID.test(s.id) ? s.id : `seed-${i + 1}`;
    if (seedIds.has(id)) id = `${id}-${i + 1}`;
    seedIds.add(id);
    return {
      id,
      name: str(s.name, `${where} seed ${i + 1} name`, { required: true, max: 60 }) ?? "",
      role: str(s.role, `${where} seed ${i + 1} role`, { required: true, max: 80 }) ?? "",
      body: str(s.body, `${where} seed ${i + 1}`, { required: true, max: 2000 }) ?? "",
      why: str(s.why, `${where} seed ${i + 1} why it helps`, { max: 300 }) ?? "",
    };
  });
  const sources = list(n.sources, where, "sources", 8)
    .map((s, i) => ({
      title: str(s.title, `${where} source ${i + 1}`, { max: 200 }) ?? "",
      href: str(s.href, `${where} source ${i + 1} link`, { max: 400 }) ?? "",
    }))
    .filter((s) => s.title);
  const d: CaseThreadData = {
    threadId,
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    audience,
    role: str(o.role, `${where} role`, { required: true, max: 300 }) ?? "",
    aim: str(o.aim, `${where} learning aim`, { required: true, max: 400 }) ?? "",
    scene: str(o.scene, `${where} scene`, { required: true, max: 2500 }) ?? "",
    people: texts(o.people, "person", 60, 6),
    known: texts(o.known, "fact", 300, 8),
    unknowns: texts(o.unknowns, "unknown", 300, 8),
    safetyCue: str(o.safetyCue, `${where} immediate-safety cue`, { required: true, max: 500 }) ?? "",
    related: { title: str(rel.title, `${where} related page`, { max: 160 }) ?? "", href: str(rel.href, `${where} related link`, { max: 300 }) ?? "" },
    prompts: {
      say: str(p.say, `${where} “what would you say” prompt`, { required: true, max: 300 }) ?? "",
      do: str(p.do, `${where} “what would you do” prompt`, { required: true, max: 300 }) ?? "",
      who: str(p.who, `${where} “who needs to know” prompt`, { required: true, max: 300 }) ?? "",
    },
    words: { min: num(w.min, 100, 20, 500), max: num(w.max, 250, 40, 1000) },
    checklist: texts(o.checklist, "self-review question", 300, 8),
    reflection: str(o.reflection, `${where} reflection prompt`, { required: true, max: 300 }) ?? "",
    caseNote: {
      title: str(n.title, `${where} case note title`, { required: true, max: 160 }) ?? "",
      summary: str(n.summary, `${where} case note`, { required: true, max: 3000 }) ?? "",
      boundaries: texts(n.boundaries, "decision boundary", 400, 8),
      teach: str(n.teach, `${where} case note script`, { max: 1500 }) ?? "",
      sources,
    },
    policy: {
      title: str(pol.title, `${where} policy`, { max: 200 }) ?? "",
      version: str(pol.version, `${where} policy version`, { max: 40 }) ?? "",
      owner: str(pol.owner, `${where} policy owner`, { max: 120 }) ?? "",
    },
    reviewDue: date(o.reviewDue),
    seeds,
    approval: {
      owner: str(ap.owner, `${where} owner`, { max: 120 }) ?? "",
      clinical: str(ap.clinical, `${where} clinical reviewer`, { max: 120 }) ?? "",
      quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
      community: str(ap.community, `${where} Community owner`, { max: 120 }) ?? "",
      approvedOn: date(ap.approvedOn),
    },
  };
  if (d.words.max < d.words.min) d.words.max = d.words.min;
  if (!d.known.length) unfinished(`${where} needs the facts the learner knows.`);
  if (d.seeds.length < 3) unfinished(`${where} needs at least three varied seed responses.`);
  return d;
}

/** A copy for editing: the case as it is, with the sign-off cleared so it has to be recorded again. */
export const freshCaseThread = (d: CaseThreadData): CaseThreadData => ({
  ...structuredClone(d),
  approval: { owner: "", clinical: "", quality: "", community: "", approvedOn: "" },
});

/**
  The block as a reader's browser receives it: the case and the prompts. The case note, self-review and seed
  responses come from the server only after the first take is submitted, so nothing in the page gives them away.
*/
export function caseThreadForReaders<T extends CaseThreadData>(b: T): T {
  return {
    ...b,
    checklist: [],
    caseNote: { title: "", summary: "", boundaries: [], teach: "", sources: [] },
    seeds: [],
    approval: { owner: "", clinical: "", quality: "", community: "", approvedOn: "" },
  };
}

/** The case's own fields from a block (without the block's id, type, flags or evidence). */
export const caseDataOf = (b: CaseThreadData): CaseThreadData => ({
  threadId: b.threadId,
  title: b.title,
  audience: b.audience,
  role: b.role,
  aim: b.aim,
  scene: b.scene,
  people: b.people,
  known: b.known,
  unknowns: b.unknowns,
  safetyCue: b.safetyCue,
  related: b.related,
  prompts: b.prompts,
  words: b.words,
  checklist: b.checklist,
  reflection: b.reflection,
  caseNote: b.caseNote,
  policy: b.policy,
  reviewDue: b.reviewDue,
  seeds: b.seeds,
  approval: b.approval,
});

export const caseApproved = (d: CaseThreadData) =>
  Boolean(d.approval.owner && d.approval.clinical && d.approval.quality && d.approval.community && d.approval.approvedOn);

// ---------------------------------------------------------------------------------------------
// Source guardrails (PRD section 3)
// ---------------------------------------------------------------------------------------------

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
const NEGATED = /\b(not|never|no|isn[’']t|aren[’']t|doesn[’']t|don[’']t|won[’']t|nor)\b/i;
/** Every informal helper banned: the family-friend case must never say so. */
const BLANKET_BAN =
  /\b(all|every|any)\s+(informal|family|unpaid|friends?)\b[^.?!]*\b(prohibited|banned|forbidden|not allowed|can[’']?t|cannot|isn[’']t allowed)\b|\b(family|friends?|informal help(ers)?|informal carers?|unpaid help(ers)?)\b[^.?!]*\b(are|is)\s+(always|never)\s+(prohibited|banned|forbidden|allowed)\b|\b(family|friends?|informal help(ers)?)\b[^.?!]*\b(always|automatically)\s+(prohibited|banned|forbidden|refused)\b/i;
/** A sentence warning against the claim, rather than making it ("Don’t tell her friends are never allowed"). */
const CORRECTIVE =
  /\b(don[’']t|do not|never|avoid|without)\s+(tell\w*|say\w*|claim\w*|impl\w*|rel\w*|suggest\w*|imply\w*)\b|\bnot (a|the) (blanket|general)\b|\brather than\b|\boutside the funded\b/i;
/** A refusal declared an incident: the fall case must never say so. */
const REFUSAL_SIRS = /\brefus\w*\b[^.?!]*\b(SIRS|serious incident|reportable incident)\b|\b(SIRS|serious incident|reportable incident)\b[^.?!]*\brefus\w*\b/i;

/** Text an author wrote that breaks the source guardrails: a blanket ban on informal help, or a refusal labelled SIRS. */
export function caseGuardrailProblems(d: CaseThreadData): string[] {
  const all = [
    d.scene,
    d.safetyCue,
    d.caseNote.summary,
    d.caseNote.teach,
    ...d.caseNote.boundaries,
    ...d.known,
    ...d.unknowns,
    ...d.seeds.map((s) => s.body),
  ].join("\n");
  const out: string[] = [];
  for (const s of sentences(all)) {
    if (BLANKET_BAN.test(s) && !CORRECTIVE.test(s))
      out.push(`“${s.slice(0, 120)}” reads as a blanket ban on informal help. The decision is about funded services, not every helper.`);
    if (REFUSAL_SIRS.test(s) && !NEGATED.test(s))
      out.push(
        `“${s.slice(0, 120)}” labels a refusal as an incident. An informed refusal isn’t automatically SIRS; incident assessment is the provider’s decision.`,
      );
  }
  return [...new Set(out)];
}

/**
  What stops a case thread being published, even with "Publish anyway": the case note approval and sign-off, the
  policy version and a current review date, three seed responses, a case note with its sources, no real
  identifiers, and the source guardrails.
*/
export function caseThreadHardProblems(d: CaseThreadData, today: string): string[] {
  const at = `“${d.title || "What would you do?"}”`;
  const out: string[] = [];
  if (!THREAD_ID.test(d.threadId)) out.push(`${at}: give it a Community thread id.`);
  if (!caseApproved(d)) out.push(`${at}: record the content owner, Clinical, Quality and Community owner approval of the case note, and the date.`);
  if (!d.policy.title || !d.policy.version) out.push(`${at}: record the governing policy or agreement and its version.`);
  if (!d.reviewDue) out.push(`${at}: set the case note’s next review date.`);
  else if (d.reviewDue < today) out.push(`${at}: the case note’s review date (${d.reviewDue}) has passed. Review it first.`);
  if (!d.caseNote.summary || !d.caseNote.boundaries.length) out.push(`${at}: write the case note and its decision boundaries.`);
  if (!d.caseNote.sources.length) out.push(`${at}: link the case note to its sources.`);
  if (d.seeds.filter((s) => s.body).length < 3) out.push(`${at}: add at least three varied seed responses.`);
  if (d.checklist.length < 3) out.push(`${at}: add the self-review questions.`);
  const ids = identifierWarnings([d.scene, ...d.known, ...d.seeds.map((s) => s.body)].join("\n"));
  if (ids.length) out.push(`${at} looks like it contains ${ids.join(" and ")}. Use fictional details only.`);
  out.push(...caseGuardrailProblems(d).map((p) => `${at}: ${p}`));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Screening what a learner writes
// ---------------------------------------------------------------------------------------------

const RISK =
  /\b(fell|fallen|falls?|falling|injur\w*|hurt|bleed\w*|unconscious|not breathing|chest pain|choking|seizure|abus\w*|assault\w*|neglect\w*|missing|danger|unsafe|can[’']?t get up)\b/i;
const NOW = /\b(right now|happening now|at the moment|as we speak|just now|this morning|this afternoon|today|tonight|last night|currently)\b/i;
const REAL =
  /\b(my|our|one of my|one of our|a real)\s+(client|participant|customer|lady|gentleman)\b|\bI(?:[’']ve| have)\s+(got\s+)?(a|an)\s+(client|participant|lady|man|gentleman|woman)\b|\bI[’']?m\s+(with|at)\s+(a|my|the)\s+(client|participant)\b/i;
const ASKING = /\b(what (should|do) I do|urgent (help|advice)|need help (now|today|urgently))\b/i;

export type CaseScreen = { live: boolean; identifying: string[] };
/**
  Checks before anything is saved. Cautious on purpose; it can't prove text is safe, only flag it.

  - **Live:** a real person and a risk, or a risk happening now, or a plea for help now. The fictional cases are
    about falls and refusals, so a risk word alone isn't enough: the general question gate would flag nearly every
    good answer to the fall case.
  - **Identifying:** the question gate's checks (lib/playbook gateQuestion: names, dates, case numbers, contact
    details), after the case's own fictional names are set aside. "The client" is how everyone writes about the
    case; "my client" still counts.
*/
export function screenCaseText(text: string, people: string[] = []): CaseScreen {
  let t = text;
  for (const name of people.filter((n) => n.trim().length > 1))
    t = t.replace(new RegExp(`\\b(?:(?:Mr|Mrs|Ms|Miss|Dr)\\.?\\s+)?${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "the person");
  const gate = gateQuestion(t);
  const identifying = gate.identifying.filter((w) => w !== "a specific client" || /\b(my|our) client\b/i.test(t));
  const live = (RISK.test(t) && (NOW.test(t) || REAL.test(t))) || (REAL.test(t) && ASKING.test(t));
  return { live, identifying };
}

// ---------------------------------------------------------------------------------------------
// The first take, the feed and completion
// ---------------------------------------------------------------------------------------------

export type Take = { say: string; do: string; who: string };
export const emptyTake = (): Take => ({ say: "", do: "", who: "" });
export const cleanTake = (v: unknown): Take => {
  const o = obj(v);
  const s = (x: unknown) => (typeof x === "string" ? x.replace(/\r\n/g, "\n").trim().slice(0, 3000) : "");
  return { say: s(o.say), do: s(o.do), who: s(o.who) };
};
export const takeText = (t: Take) => [t.say, t.do, t.who].join("\n");
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
export const takeWords = (t: Take) => wordCount(takeText(t));
/** A first take as a shared post reads: the three answers under their questions. */
export const takeAsPost = (t: Take) =>
  [t.say && `What I’d say: ${t.say}`, t.do && `What I’d do next: ${t.do}`, t.who && `Who needs to know: ${t.who}`].filter(Boolean).join("\n\n");

export type Completion = { firstTake: boolean; note: boolean; peer: boolean; reflection: boolean };
/** First take, the case note viewed, at least one peer approach viewed, and a reflection. Nothing else counts. */
export const completionOf = (a: { submittedAt: string | null; noteViewedAt: string | null; peersViewed: number; reflection: string }): Completion => ({
  firstTake: Boolean(a.submittedAt),
  note: Boolean(a.noteViewedAt),
  peer: a.peersViewed > 0,
  reflection: a.reflection.trim().length > 0,
});
export const isComplete = (c: Completion) => c.firstTake && c.note && c.peer && c.reflection;

export type RankedPost = { id: string; kind: "seed" | "verified" | "member"; helpful: number; endorsed: boolean; current: boolean; at: string };
/**
  The feed in each view. Helpful: verified coordinators and seeds on the current policy, endorsed examples first
  (an editorial act), then by helpful votes, then newest. Other perspectives: everyone else, newest first. Recent:
  everything approved, newest first. All: everything approved, oldest first. Votes never move a post across views
  or above an endorsement, and the case note is never in the feed at all.
*/
export function rankFeed<T extends RankedPost>(posts: T[], view: FeedView): T[] {
  const newest = (a: T, b: T) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);
  if (view === "helpful")
    return posts
      .filter((p) => p.kind !== "member" && p.current)
      .sort((a, b) => Number(b.endorsed) - Number(a.endorsed) || b.helpful - a.helpful || newest(a, b));
  if (view === "others") return posts.filter((p) => p.kind === "member").sort(newest);
  if (view === "recent") return [...posts].sort(newest);
  return [...posts].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export const isFeedView = (v: unknown): v is FeedView => typeof v === "string" && v in FEED_VIEWS;
