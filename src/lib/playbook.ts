/*
  Live SOP-to-Playbook snippets (docs/live-playbooks.md). A short, usable procedure bound to a section of an
  approved policy record. Every placement (a Magazine block, the Resources playbook page, a saved Shift Wallet
  reference) resolves to the snippet's current approved release for the reader's role.

  - "Live" means current approved content with prompt propagation, never unreviewed source text. A source edit
    creates a pending change the owner reviews; learners keep the last approved release until then.
  - Safety-critical snippets need Clinical and Quality co-approval, stop at their review date, and can be withdrawn
    at once to an approved fallback route.
  - Contact routes come from a managed directory, per role. Steps never carry a typed-in phone number.
  - "Ask a Lead" checks for urgency and identifying details before anything is shared. An urgent concern gets the
    urgent route, and nothing is posted; a question that might identify someone is held for privacy review.
  Everything here is pure, so the server and the pages share it.
*/

import { identifierWarnings } from "./redpen";
import { POCKET_EVENTS } from "./pocketPlaybook";

export const RISK = { operational: "Operational reference", sensitive: "Sensitive operational", safety_critical: "Safety-critical" } as const;
export type Risk = keyof typeof RISK;
export const PB_AUDIENCES = { partner: "Care Partners", coordinator: "Care coordinators", staff: "Trilogy Care staff" } as const;
export type PbAudience = keyof typeof PB_AUDIENCES;
export const STEP_KINDS = { now: "Do now", then: "Then", exception: "If this is different" } as const;
export type StepKind = keyof typeof STEP_KINDS;
/*
  Job Aids (docs/job-aids.md). A playbook is the Hub's Job Aid: the same governed, versioned snippet, now with a
  template that says how the tool is used, a "Use when" trigger in the worker's words, and a short quick action
  for where it's embedded in learning. Learners see the library as Work Tools.
*/
export const AID_TEMPLATES = {
  checklist: {
    label: "Checklist",
    hint: "A trigger, short steps, the exception and the next action.",
    groups: { now: "Do now", then: "Then", exception: "If this is different" },
  },
  conversation: {
    label: "Conversation prompt",
    hint: "The goal, questions to ask, what to confirm and the follow-up.",
    groups: { now: "Ask", then: "Confirm", exception: "Follow up" },
  },
  decision: {
    label: "Decision path",
    hint: "The condition, the authorised next step and the escalation route.",
    groups: { now: "Check first", then: "Then", exception: "Escalate when" },
  },
  escalation: {
    label: "Escalation map",
    hint: "The signal, the immediate route, the contact or process and the recording step.",
    groups: { now: "Do now", then: "Then record", exception: "If this is different" },
  },
  handover: {
    label: "Handover template",
    hint: "The required fields, the owner and the next contact.",
    groups: { now: "Always include", then: "Then", exception: "If something is missing" },
  },
  briefing: {
    label: "Change briefing",
    hint: "What changed, from when, who it affects, what to do and the source.",
    groups: { now: "What changed", then: "What you do", exception: "If this is different" },
  },
} as const;
export type AidTemplate = keyof typeof AID_TEMPLATES;
export type AidLink = { label: string; href: string };
/** A page on the Hub, a web address, an email or a phone link. */
export const safeAidLink = (href: string) => /^(\/(?!\/)|https:\/\/|mailto:|tel:)/.test(href);

export const ISSUES = {
  unclear: "The step is unclear",
  outdated: "The source appears out of date",
  notcovered: "My situation is not covered",
  lead: "I need a lead to answer",
} as const;
export type Issue = keyof typeof ISSUES;
export const RELEASE_STATUS = { draft: "Draft", in_review: "In review", approved: "Approved", superseded: "Superseded" } as const;
export type ReleaseStatus = keyof typeof RELEASE_STATUS;
export const GAP_STATUS = {
  awaiting_review: "Awaiting privacy review",
  posted: "Posted",
  answered: "Answered",
  policy_update_pending: "Policy update pending",
  resolved: "Resolved",
  declined: "Not posted",
} as const;
export type GapStatus = keyof typeof GAP_STATUS;
export const REPLY_LABELS = { peer: "Peer suggestion", lead: "Lead response", policy: "Policy-owner approved guidance" } as const;
export type ReplyLabel = keyof typeof REPLY_LABELS;

/** Use of a Job Aid or a Favourite. Adoption evidence only: none of these is a completion, a pass or a work outcome. */
export const AID_EVENTS = [
  "job_aid_viewed",
  "job_aid_opened_from_placement",
  "job_aid_favourited",
  "job_aid_unfavourited",
  "passage_selection_saved",
  "favourites_opened",
  "saved_item_opened",
  "current_source_opened",
  "job_aid_update_seen",
  "job_aid_issue_reported",
  // The Live Call Pocket Playbook's tool events (lib/pocketPlaybook): the same table, the same rules.
  ...POCKET_EVENTS,
] as const;
export type AidEvent = (typeof AID_EVENTS)[number];
/** The events a page may send. Saves, views and reports are recorded by the server as they happen. */
export const AID_CLIENT_EVENTS: AidEvent[] = ["job_aid_opened_from_placement", "favourites_opened", "current_source_opened"];
export const REVIEW_DECISIONS = { keep: "Keep", revise: "Revise", retarget: "Retarget", withdraw: "Withdraw", close: "Close" } as const;
export type ReviewDecision = keyof typeof REVIEW_DECISIONS;

export const NOT_AN_INCIDENT_REPORT = "Asking here doesn’t report an incident or notify anyone of one.";
export const UNCONTROLLED = "Printed or exported copies are uncontrolled. Check the current release in the Partner Hub before you rely on it.";

export type SourceSection = { anchor: string; heading: string; text: string };
export type SourceDoc = { id: string; title: string; system: string; owner: string; audiences: PbAudience[]; sections: SourceSection[] };

export type Step = { id: string; kind: StepKind; text: string; why: string; anchor: string };
export type SnippetData = {
  title: string;
  purpose: string;
  /** Who it's for, as shown on the card (role and setting). */
  roleLabel: string;
  risk: Risk;
  ownerTeam: string;
  audiences: PbAudience[];
  source: { docId: string; anchor: string };
  /** What to do when the procedure is unavailable, with the directory contacts to show. */
  fallback: { text: string; contactKeys: string[] };
  contactKeys: string[];
  /** Hub users alerted to questions; empty alerts every learning author. */
  leads: string[];
  tag: string;
  /** How the tool is used: it names the groups its steps fall into. */
  template: AidTemplate;
  /** "Use when…", in the worker's words: what they are doing when this helps. */
  trigger: string;
  /** About how long it takes to use, in minutes. 0 when it isn't given. */
  minutes: number;
  /** Where to go from here: the agreement, the form, the queue. Never a phone number. */
  links: AidLink[];
  /** The Problem desk theme this answers, if any. */
  themeId: string;
};
export type ReleaseData = {
  steps: Step[];
  changeSummary: string;
  effectiveOn: string;
  reviewBy: string;
  ackRequired: boolean;
  /** The essential action, in a sentence or two: what an embedded section shows. */
  quick: string;
  /** A worked example a reader can open. Fictional. */
  example: string;
  approvals: { owner: string; clinical: string; quality: string };
  /** The source as it was when this release was written. */
  sourceVersion: number;
  sourceChecksum: string;
  sourceText: string;
};
export type Release = { snippetId: string; number: number; status: ReleaseStatus; data: ReleaseData; approvedAt: string; approvedBy: string };
export type Contact = { key: string; label: string; routes: Record<PbAudience, string> };

/** A short, stable checksum of text (FNV-1a), to tell when a source section has changed. */
export function checksum(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const many = <T extends string>(v: unknown, all: readonly T[]) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is T => all.includes(x as T)))];
const keys = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,60}$/.test(x)).slice(0, 6);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export function cleanSnippet(raw: unknown): SnippetData {
  const o = obj(raw);
  const src = obj(o.source);
  const fb = obj(o.fallback);
  return {
    title: s(o.title, 120),
    purpose: s(o.purpose, 300),
    roleLabel: s(o.roleLabel, 120),
    risk: (Object.keys(RISK) as Risk[]).includes(o.risk as Risk) ? (o.risk as Risk) : "operational",
    ownerTeam: s(o.ownerTeam, 80),
    audiences: many(o.audiences, Object.keys(PB_AUDIENCES) as PbAudience[]),
    source: { docId: s(src.docId, 80), anchor: s(src.anchor, 80) },
    fallback: { text: s(fb.text, 400), contactKeys: keys(fb.contactKeys) },
    contactKeys: keys(o.contactKeys),
    leads: (Array.isArray(o.leads) ? o.leads : []).filter((x): x is string => typeof x === "string").slice(0, 10),
    tag: s(o.tag, 40),
    template: (Object.keys(AID_TEMPLATES) as AidTemplate[]).includes(o.template as AidTemplate) ? (o.template as AidTemplate) : "checklist",
    trigger: s(o.trigger, 160),
    minutes: Number.isFinite(Number(o.minutes)) ? Math.min(60, Math.max(0, Math.round(Number(o.minutes)))) : 0,
    links: (Array.isArray(o.links) ? o.links : [])
      .slice(0, 4)
      .map((x) => ({ label: s(obj(x).label, 80).trim(), href: s(obj(x).href, 300).trim() }))
      .filter((l) => l.label && safeAidLink(l.href)),
    themeId: typeof o.themeId === "string" && /^[\w-]{1,60}$/.test(o.themeId) ? o.themeId : "",
  };
}

export function cleanRelease(raw: unknown): ReleaseData {
  const o = obj(raw);
  const a = obj(o.approvals);
  return {
    steps: (Array.isArray(o.steps) ? o.steps : []).slice(0, 9).map((x, i) => {
      const st = obj(x);
      return {
        id: typeof st.id === "string" && st.id ? st.id.slice(0, 40) : `s${i + 1}`,
        kind: (Object.keys(STEP_KINDS) as StepKind[]).includes(st.kind as StepKind) ? (st.kind as StepKind) : "then",
        text: s(st.text, 400),
        why: s(st.why, 400),
        anchor: s(st.anchor, 80),
      };
    }),
    changeSummary: s(o.changeSummary, 400),
    effectiveOn: date(o.effectiveOn),
    reviewBy: date(o.reviewBy),
    ackRequired: o.ackRequired === true,
    quick: s(o.quick, 320),
    example: s(o.example, 900),
    approvals: { owner: s(a.owner, 120), clinical: s(a.clinical, 120), quality: s(a.quality, 120) },
    sourceVersion: Number.isInteger(o.sourceVersion) ? (o.sourceVersion as number) : 0,
    sourceChecksum: s(o.sourceChecksum, 20),
    sourceText: s(o.sourceText, 6000),
  };
}

/** A phone-number-like string typed into a step: contact routes must come from the managed directory. */
const PHONE = /(\+?61[\s-]?|\b0)[2-478](?:[\s-]?\d){8}\b|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b/;

/** What stops a release from being approved. */
export function releaseProblems(sn: SnippetData, r: ReleaseData, contacts: Contact[], today: string): string[] {
  const out: string[] = [];
  const steps = r.steps.filter((x) => x.text.trim());
  if (steps.length < 1 || steps.length > 9) out.push("Add one to nine steps (three to seven is usual).");
  if (!steps.some((x) => x.kind === "now") && sn.risk === "safety_critical") out.push("A safety-critical procedure needs a “Do now” step.");
  if (steps.some((x) => PHONE.test(x.text)) || PHONE.test(r.quick) || PHONE.test(r.example)) out.push("A step contains a phone number. Use a contact from the directory instead.");
  if (!sn.trigger.trim()) out.push("Say when to use it: the task the worker is doing, in their words.");
  if (!r.effectiveOn) out.push("Set the effective date.");
  if (!r.reviewBy || (today && r.reviewBy <= today)) out.push("Set a review date in the future.");
  if (!r.approvals.owner.trim()) out.push("Record the policy owner’s approval.");
  if (sn.risk === "safety_critical" && (!r.approvals.clinical.trim() || !r.approvals.quality.trim())) out.push("A safety-critical release needs Clinical and Quality co-approval.");
  if (!r.sourceChecksum) out.push("Bind it to the current source section.");
  if (!sn.fallback.text.trim()) out.push("Set the fallback route shown if the procedure is unavailable.");
  const unconfigured = [...sn.contactKeys, ...sn.fallback.contactKeys].filter((k) => {
    const c = contacts.find((x) => x.key === k);
    return !c || sn.audiences.some((a) => !c.routes[a]?.trim());
  });
  if (unconfigured.length) out.push(`Configure these contacts for every audience first: ${[...new Set(unconfigured)].join(", ")}.`);
  if (!sn.audiences.length) out.push("Choose who it’s for.");
  if (!sn.ownerTeam.trim()) out.push("Name the owning team.");
  return out;
}

export type Readiness = "current" | "review_due" | "fallback";
/**
  Whether a reader gets the steps. A withdrawn snippet, or none approved, falls back. Past its review date a
  safety-critical snippet stops (fallback); an operational one shows with "review due".
*/
export function readiness(sn: Pick<SnippetData, "risk">, withdrawn: boolean, current: Release | undefined, today: string): Readiness {
  if (withdrawn || !current) return "fallback";
  if (current.data.reviewBy && today && current.data.reviewBy < today) return sn.risk === "safety_critical" ? "fallback" : "review_due";
  return "current";
}

/** A line-by-line difference between two versions of a source section, for the owner's review. */
export function lineDiff(before: string, after: string): { kind: "same" | "add" | "del"; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { kind: "same" | "add" | "del"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

// ---------------------------------------------------------------------------------------------
// The question gates: urgency first, then identifying details
// ---------------------------------------------------------------------------------------------

const URGENT = [
  /\b(fell|fallen|falls?)\b.*\b(today|now|just|this morning|last night)\b/i,
  /\b(injur|bleed|unconscious|not breathing|chest pain|choking|seizure|overdose)/i,
  /\b(abuse|assault|assaulted|hit (him|her|them)|neglect|sexual)\b/i,
  /\b(missing|can'?t find|emergency|ambulance|000|police|danger|unsafe right now|happening now|right now)\b/i,
];
const IDENTIFYING = [
  { re: /\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+/, why: "a person’s name" },
  { re: /\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/, why: "a date" },
  // An ID has a digit in it, so "the incident system" isn't mistaken for "incident #AB1234".
  { re: /\b(incident|case|ticket|ref(erence)?)\s*(no\.?|number|#|id)?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{3,}\b/i, why: "an incident or case number" },
  { re: /\b(my|our|the) client\b/i, why: "a specific client" },
];

export type Gate = { urgent: boolean; identifying: string[] };
/**
  Deterministic checks on a question. They're cautious on purpose: anything urgent gets the urgent route, and
  anything that might identify someone is held for review. They can't prove a question is safe, only flag it.
*/
export function gateQuestion(text: string): Gate {
  const identifying = [...identifierWarnings(text), ...IDENTIFYING.filter((x) => x.re.test(text)).map((x) => x.why)];
  return { urgent: URGENT.some((re) => re.test(text)), identifying: [...new Set(identifying)] };
}

// ---------------------------------------------------------------------------------------------
// The Magazine block
// ---------------------------------------------------------------------------------------------

/** A Job Aid placed in a page by reference: never a copy of its body. `why`: why it belongs at this point, shown with it. */
export type PlaybookBlockData = { snippetId: string; why?: string };
type Raw = Record<string, unknown>;
export function parsePlaybookBlock(o: Raw, where: string, h: { unfinished: (p: string) => void }): PlaybookBlockData {
  const snippetId = typeof o.snippetId === "string" && /^[a-z0-9-]{1,80}$/.test(o.snippetId) ? o.snippetId : "";
  if (!snippetId) h.unfinished(`${where} needs a Job Aid.`);
  const why = typeof o.why === "string" ? o.why.trim().slice(0, 300) : "";
  return { snippetId, ...(why && { why }) };
}
