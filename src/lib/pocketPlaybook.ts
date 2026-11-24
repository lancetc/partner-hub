import type { PbAudience } from "./playbook";

/*
  The Live Call Pocket Playbook (docs/pocket-playbook.md): Work Tools a coordinator opens during a call, from the
  Companion Drawer behind the Favourites control. Everything here is pure, so the server, the drawer and the tests
  share it.

  - A Pocket tool is a canonical Work Tool, like a Job Aid: one stable id, a family, a version, an owner and a
    specialist reviewer, its sources, effective and review dates, and a status. Pinning and saving it go through the
    one Favourites list (a pin is a preference on a saved Favourite, never a second collection).
  - Three families: the contribution Quick-Calc (lib/quickCalc), the incident first-steps path, and Golden Scripts.
  - Nothing in a tool decides a real contribution, classifies a real incident or writes to a real system.
*/

export const TOOL_FAMILIES = {
  calculator: "Contribution calculator",
  escalation: "Escalation path",
  script: "Golden Scripts",
} as const;
export type ToolFamily = keyof typeof TOOL_FAMILIES;

/** Where a tool is in its governance. Only "approved" is current guidance; the pilot's are drafts, labelled as such everywhere. */
export const TOOL_STATUS = {
  draft: "Draft: awaiting approval",
  in_review: "In review",
  approved: "Approved",
  withdrawn: "Withdrawn",
} as const;
export type ToolStatus = keyof typeof TOOL_STATUS;

export type ToolSource = { label: string; href: string; section: string; kind: "programme" | "commission" | "trilogy" | "example" };

export type PocketTool = {
  /** Stable id: the canonical page is /tools/<id>. */
  id: string;
  family: ToolFamily;
  title: string;
  /** "Use when…", in the coordinator's words. */
  task: string;
  purpose: string;
  audiences: PbAudience[];
  /** The accountable team, and the specialist reviewer who signs off its rules or wording. */
  owner: string;
  reviewer: string;
  version: number;
  status: ToolStatus;
  effectiveOn: string;
  reviewedOn: string;
  nextReview: string;
  /** What the owner has still to supply before release (shown on the status strip, and in Admin). */
  awaiting: string;
  sources: ToolSource[];
  /** Everyday task words it is found by, beside its title: "gardener", "bruise", "price not confirmed". */
  tags: string[];
  /** The approved route when the tool can't be used: who to contact. A directory key (playbook_contacts) or none. */
  fallback: { text: string; contactKey: string };
  /** Job Aids it builds on or links to, by id. */
  relatedAids: string[];
  /** The Problem desk theme it answers, if any. */
  themeId: string;
};

export const toolHref = (id: string) => `/tools/${id}`;

// ---------------------------------------------------------------------------------------------
// Use events: ids and counts only
// ---------------------------------------------------------------------------------------------

/**
  The PRD's tool events. Each holds the person, their role, the tool (or script, or Job Aid) id, its version, where
  it was opened from and an idempotency key. Never a figure, a search phrase, a filled-in script or an incident
  detail: there is no field for any of them.
*/
export const POCKET_EVENTS = [
  "work_tools_opened",
  "tool_pinned",
  "tool_unpinned",
  "tool_opened",
  "calculator_estimate_run",
  "calculator_needs_verification",
  "funding_view_opened",
  "interim_contribution_view_opened",
  "incident_path_opened",
  "internal_escalation_link_opened",
  "script_opened",
  "script_copied",
  "source_opened",
  "tool_outdated_seen",
  "search_no_result",
  "tool_issue_reported",
] as const;
export type PocketEvent = (typeof POCKET_EVENTS)[number];
/** What a page may send. Pins are recorded by the server when the pin changes. */
export const POCKET_CLIENT_EVENTS: PocketEvent[] = POCKET_EVENTS.filter((e) => e !== "tool_pinned" && e !== "tool_unpinned");
/** Where a tool was opened from. Anything else is recorded as "page". */
export const PLACES = ["drawer", "home", "search", "favourites", "page", "placement"] as const;
export type Place = (typeof PLACES)[number];
export const place = (v: unknown): Place => ((PLACES as readonly string[]).includes(v as string) ? (v as Place) : "page");

/** Reasons a coordinator can report an issue with a tool. A choice, never free text, so nothing identifying is kept. */
export const TOOL_ISSUES = {
  wrong: "Something here looks wrong",
  outdated: "The source looks out of date",
  missing: "My situation isn’t covered",
  contact: "A contact or link doesn’t work",
} as const;
export type ToolIssue = keyof typeof TOOL_ISSUES;

// ---------------------------------------------------------------------------------------------
// Task search: everyday words, not policy nouns
// ---------------------------------------------------------------------------------------------

/** Words people use on a call, mapped to the words tools are tagged with. Spelling variants included. */
const SYNONYMS: Record<string, string[]> = {
  gardener: ["gardening"],
  garden: ["gardening"],
  mowing: ["gardening"],
  lawn: ["gardening"],
  pay: ["contribution", "cost"],
  paying: ["contribution", "cost"],
  cost: ["contribution"],
  costs: ["contribution"],
  charge: ["contribution"],
  charged: ["contribution"],
  bill: ["contribution", "statement"],
  fee: ["contribution"],
  fees: ["contribution"],
  free: ["contribution"],
  copay: ["contribution"],
  "co-contribution": ["contribution"],
  cocontribution: ["contribution"],
  bruise: ["incident", "injury"],
  bruising: ["incident", "injury"],
  bruised: ["incident", "injury"],
  fall: ["incident", "injury"],
  fell: ["incident", "injury"],
  hurt: ["incident", "injury"],
  injured: ["incident", "injury"],
  abuse: ["incident", "sirs"],
  neglect: ["incident", "sirs"],
  rough: ["incident"],
  sirs: ["incident", "sirs"],
  serious: ["incident"],
  missed: ["no-show"],
  "no-show": ["no-show"],
  noshow: ["no-show"],
  late: ["no-show"],
  contractor: ["no-show", "worker"],
  worker: ["worker"],
  arrive: ["no-show"],
  arrived: ["no-show"],
  turn: ["no-show"],
  daughter: ["family"],
  son: ["family"],
  family: ["family"],
  husband: ["family"],
  wife: ["family"],
  carer: ["family"],
  decide: ["consent", "family"],
  decision: ["consent"],
  consent: ["consent"],
  interim: ["interim"],
  waiting: ["interim"],
  bridging: ["interim"],
  pending: ["pending", "interim"],
  notified: ["pending"],
  price: ["price"],
  quote: ["price"],
  unconfirmed: ["pending", "price"],
  "not confirmed": ["pending", "price"],
};
const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "my",
  "is",
  "it",
  "i",
  "be",
  "and",
  "or",
  "on",
  "in",
  "at",
  "about",
  "what",
  "how",
  "why",
  "do",
  "does",
  "not",
  "wants",
  "want",
]);

/** Lower case, letters and numbers only, single spaces. */
export const taskWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A rough stem, so "gardens", "gardening" and "gardener" meet "garden". */
const stem = (w: string) => w.replace(/(ings|ing|ers|er|es|s|ed)$/, "") || w;

/** The words of a query, with their everyday synonyms, for matching against a tool's title and tags. */
export function expandQuery(q: string): string[][] {
  const text = taskWords(q).slice(0, 120);
  const out: string[][] = [];
  // "not confirmed" and other two-word phrases first.
  for (const phrase of Object.keys(SYNONYMS).filter((k) => k.includes(" "))) if (text.includes(phrase)) out.push([phrase, ...SYNONYMS[phrase]]);
  for (const w of text.split(" ")) {
    if (!w || STOP.has(w)) continue;
    out.push([w, ...(SYNONYMS[w] ?? [])]);
  }
  return out.slice(0, 8);
}

/**
  How well a tool's words answer a task query: 0 is no match. Most of the query's words have to land (with their
  synonyms), and a word in the title counts most. Plain rules, no model.
*/
export function taskScore(query: string, item: { title: string; tags: string[]; task: string; purpose?: string }) {
  const groups = expandQuery(query);
  if (!groups.length) return 0;
  const title = taskWords(item.title);
  const tags = item.tags.map(taskWords);
  const rest = taskWords(`${item.task} ${item.purpose ?? ""}`);
  const has = (hay: string, w: string) => hay.split(" ").some((x) => x === w || stem(x) === stem(w)) || (w.includes(" ") && hay.includes(w));
  let score = 0;
  let hit = 0;
  for (const g of groups) {
    const best = Math.max(...g.map((w) => (has(title, w) ? 4 : tags.some((t) => t === w || stem(t) === stem(w) || has(t, w)) ? 3 : has(rest, w) ? 1 : 0)));
    if (best) hit++;
    score += best;
  }
  // Most of what was asked has to be there: one common word isn't enough for a two- or three-word task.
  const need = groups.length <= 2 ? 1 : Math.ceil(groups.length / 2);
  return hit >= need ? score : 0;
}

// ---------------------------------------------------------------------------------------------
// Tool B: the incident first-steps path
// ---------------------------------------------------------------------------------------------

export type IncidentPathVersion = {
  id: string;
  version: number;
  status: ToolStatus;
  serviceSetting: string;
  /** Step 1: safety and urgent help. */
  safety: { question: string; emergency: string[]; notNow: string[] };
  /** Step 2: record and notify internally. The contact comes from the directory, the IMS link from Quality. */
  internal: { contactKey: string; imsUrl: string; steps: string[]; afterHours: string };
  /** Step 3: possible SIRS types, as reviewed prompts, never a classification. */
  sirs: { intro: string; types: { id: string; label: string; prompt: string }[]; homeServices: string; alleged: string };
  /** Step 4: priority and notification, for the authorised reviewer. Versioned, and kept apart from the internal action. */
  priority: { p1: string; p2: string; awareness: string; decider: string; notInternal: string };
  /** Step 5: follow-through. */
  followThrough: string[];
  /** Official guidance and Trilogy Care's process. The primary escalation must stand even when these fail. */
  links: ToolSource[];
  /** A Job Aid this builds on (the existing SIRS first steps). */
  relatedAid: string;
};

/** What stops an incident path being released. The primary escalation action has to be there even if every link fails. */
export function incidentPathProblems(p: IncidentPathVersion): string[] {
  const out: string[] = [];
  if (!p.safety.question.trim() || !p.safety.emergency.length) out.push("Step 1 needs the safety question and the emergency action.");
  if (!p.internal.contactKey.trim()) out.push("Name the internal escalation contact (a directory key).");
  if (!p.internal.steps.length) out.push("Step 2 needs the internal recording and notification steps.");
  if (!p.internal.imsUrl.trim()) out.push("Quality has to supply the Incident Management System link.");
  if (!p.internal.afterHours.trim()) out.push("Quality has to supply the after-hours route.");
  if (p.sirs.types.length !== 8) out.push("Step 3 lists the eight reportable incident types.");
  if (!p.priority.p1.trim() || !p.priority.p2.trim() || !p.priority.decider.trim()) out.push("Step 4 needs Priority 1 and 2 and who decides.");
  if (!p.links.some((l) => l.kind === "commission")) out.push("Link the current Commission guidance.");
  return out;
}

export type IncidentAnswers = { danger?: "yes" | "no" | "unsure" | null; sirsType?: "yes" | "no" | "unsure" | null };
/**
  What the path says to do, from what the coordinator has answered so far. It always escalates internally: there is
  no answer that returns "not reportable", because the tool can't make that call and an incomplete picture is never
  a reason to wait. An emergency or an unsure answer puts the emergency route first.
*/
export function incidentGuidance(a: IncidentAnswers): { first: "emergency" | "internal"; escalate: true; headline: string; sirsNote: string } {
  const first = a.danger === "yes" || a.danger === "unsure" ? "emergency" : "internal";
  const headline =
    first === "emergency"
      ? "Get emergency help now (000), make the person safe, then tell the incident responder."
      : "Tell the incident responder now, and record the facts in the incident system.";
  const sirsNote =
    a.sirsType === "yes"
      ? "It may be a reportable incident. Escalate now: the authorised reviewer decides the type and priority, and any Commission notice."
      : a.sirsType === "unsure"
        ? "Not sure? Escalate now. You don’t need proof, and you don’t decide reportability."
        : a.sirsType === "no"
          ? "Even if none of these seems to fit, every incident is managed: tell the responder and record it. The authorised reviewer decides reportability."
          : "Look at the prompts after the immediate steps. Whatever you find, the responder is told.";
  return { first, escalate: true, headline, sirsNote };
}

// ---------------------------------------------------------------------------------------------
// Tool C: Golden Scripts
// ---------------------------------------------------------------------------------------------

export type ScriptSlot = { key: string; label: string; hint: string };
export type GoldenScriptVersion = {
  id: string;
  version: number;
  status: ToolStatus;
  /** The moment, in the coordinator's words. */
  trigger: string;
  tags: string[];
  intent: string;
  /** The opening, with [slot] placeholders the coordinator fills as they speak. */
  opening: string;
  slots: ScriptSlot[];
  /** "Check before saying this". */
  check: string;
  /** What not to say or promise. */
  guardrail: string;
  next: string;
  related: { kind: "tool" | "aid"; id: string; label: string }[];
  owner: string;
  reviewer: string;
  source: string;
  audiences: PbAudience[];
  reviewOn: string;
  /** Where the wording came from: a staff contribution, a complaint theme, a Story beat or the PRD's pilot set. */
  origin: string;
};

/** The [slot] placeholders in a piece of script text. */
export const placeholders = (text: string) => [...new Set([...text.matchAll(/\[([^\]]{1,40})\]/g)].map((m) => m[1]))];

/** Words a script must never say: it can't promise an outcome, classify an incident or press someone to drop a complaint. */
const FORBIDDEN = [
  /\b(not|isn[’']?t|is not) (sirs[- ])?reportable\b/i,
  /\bguarantee/i,
  /\bwill be (free|approved|exempt)\b/i,
  /\bwithdraw (your|the) complaint\b/i,
  /\bdefinitely\b/i,
];

/** What stops a script being released: unfilled or undeclared placeholders, a missing check or guardrail, a promise. */
export function scriptProblems(s: GoldenScriptVersion): string[] {
  const out: string[] = [];
  const used = placeholders(s.opening);
  const declared = s.slots.map((x) => x.label);
  for (const u of used) if (!declared.includes(u)) out.push(`The placeholder “[${u}]” isn’t a declared fact slot.`);
  for (const d of declared) if (!used.includes(d)) out.push(`The fact slot “${d}” isn’t used in the opening.`);
  if (!s.trigger.trim()) out.push("Say when to use it, in the coordinator’s words.");
  if (!s.check.trim()) out.push("Add the “check before saying this” line.");
  if (!s.guardrail.trim()) out.push("Add the guardrail: what not to say or promise.");
  if (!s.next.trim()) out.push("Add the next step or escalation.");
  if (!s.owner.trim() || !s.reviewer.trim()) out.push("Name the owner and the reviewer.");
  if (!s.source.trim()) out.push("Name the approved source.");
  if (FORBIDDEN.some((re) => re.test(s.opening))) out.push("The opening makes a promise or a determination a script can’t make.");
  return out;
}

/** The text a coordinator copies: the opening with its placeholders left visible, and the cue to verify. Never filled with a client's details. */
export const scriptCopyText = (s: GoldenScriptVersion) => `${s.opening}\n\nVerify before use: ${s.check}`;
