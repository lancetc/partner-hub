/*
  Care Partner Business Field Notes (docs/business-field-notes.md): the business edition of "Notes to a Younger Me"
  for verified Care Partner principals. A business card is an ordinary mentor note (lib/notes) with a `business`
  context: one library, one version history, one set of helpful votes and one Pocket Deck. What's here is pure, so
  the server, the pages and the editors share it.

  - Peer experience, never policy, a staffing benchmark or a verified business result.
  - Principal-only on every surface. The server decides who's a principal; nothing here does.
  - One canonical, moderated thread per card. Answers carry a label, and a source-backed Trilogy Care annotation
    always sits above peer replies, however popular they are.
  - Posts that might identify someone, or that touch current or future prices, customer or territory plans, are
    held for a person to review. A live incident is routed to the incident process and never posted.
*/

import { gateQuestion } from "./playbook";

/** The audience key for verified Care Partner business owners. Never derived from a job title. */
export const PRINCIPAL = "principal";
export const EDITION_LABEL = "Business Field Note";
export const PEER_NOTICE = "Peer experience, not Trilogy Care policy, a staffing benchmark or a verified business result.";
export const FICTIONAL_NOTICE = "Fictional illustration for development. Not a real Care Partner’s story, quote or business result.";

export const STAGES = {
  starting: "Starting out",
  first_hire: "First hire",
  growing: "Growing a team",
  established: "Established",
  changing: "Changing direction",
} as const;
export type Stage = keyof typeof STAGES;

export const THEMES = {
  "first-hire": "First coordinator hire",
  onboarding: "Onboarding and quality sampling",
  "home-hub": "Home-based or local hub",
  cash: "Cash runway and payment timing",
  "funding-waits": "Planning through funding waits",
  contractors: "Building a contractor bench",
  relationships: "Local GP and community relationships",
  "service-failure": "Handling a service failure",
  delegation: "Delegation and workload",
  succession: "Succession",
  "not-growing": "Choosing not to grow yet",
} as const;
export type Theme = keyof typeof THEMES;

export const COLLECTIONS = {
  starting: { title: "Starting out", blurb: "A first staff member, a first local referral relationship, deciding what to do yourself." },
  team: { title: "Growing a team", blurb: "Delegation, supervision, quality sampling and capacity." },
  running: { title: "Running the business", blurb: "Cash timing, home or hub operations, contractor continuity and hard trade-offs." },
  continues: { title: "The story continues", blurb: "Dated check-ins where a contributor revisits an earlier belief." },
} as const;
export type Collection = keyof typeof COLLECTIONS;

export const SERVICE_MODELS = { home: "Home-based", hub: "Local hub", mixed: "Home-based and hub" } as const;
export type ServiceModel = keyof typeof SERVICE_MODELS;

/**
  The Work Tools a card can link to. Magazine calculator articles are found by slug (or title) and only offered when
  published and open to the reader. Tools that don't exist yet are labelled placeholders, never a dead link.
*/
export const TOOLS = {
  "hiring-runway": {
    title: "Hiring Runway",
    kind: "article",
    slug: "mayas-next-coordinator-when-to-hire",
    match: "when to hire",
    use: "Test when a hire is affordable, privately.",
  },
  "caseload-margin": {
    title: "Caseload-to-Margin & Hiring Capacity",
    kind: "tool",
    href: "/tools/caseload-margin",
    use: "Plan capacity, margin and cash for your own business, privately.",
  },
  intake: {
    title: "Next 10 Clients",
    kind: "article",
    slug: "can-we-take-on-the-next-10-clients",
    match: "next 10 clients",
    use: "Check whether the team can take on more people.",
  },
  workload: {
    title: "Workload Lens",
    kind: "article",
    slug: "where-does-a-coordinators-week-go",
    match: "coordinator’s week",
    use: "See where a coordinator’s week actually goes.",
  },
  coverage: {
    title: "Local Coverage",
    kind: "article",
    slug: "is-this-suburb-ready-for-growth",
    match: "suburb ready for growth",
    use: "Check contractor coverage before you grow in an area.",
  },
  referral: {
    title: "Referral Journey",
    kind: "article",
    slug: "which-referrals-become-active-clients",
    match: "referrals become active",
    use: "See which referrals become active clients.",
  },
  reliability: {
    title: "Service Reliability",
    kind: "article",
    slug: "what-does-a-missed-service-cost",
    match: "missed service",
    use: "Work out what a missed service costs, and who it affects.",
  },
  cashbridge: { title: "Cash Bridge", kind: "article", slug: "can-we-fund-the-next-90-days", match: "next 90 days", use: "Follow the cash date by date." },
  "first-100-days": { title: "First 100 Days Shadow & Coach", kind: "placeholder", use: "A coaching checklist for a new coordinator’s first 100 days." },
  "referral-studio": { title: "Local Referral Studio", kind: "placeholder", use: "Practise a local referral conversation." },
  "contractor-network": { title: "Contractor Network Builder", kind: "placeholder", use: "Build and check a contractor bench." },
  "trust-check": { title: "28-Day Trust Check", kind: "placeholder", use: "A Job Aid for an early client disappointment." },
} as const satisfies Record<string, { title: string; kind: "article" | "tool" | "placeholder"; slug?: string; match?: string; href?: string; use: string }>;
export type ToolId = keyof typeof TOOLS;
export const PLACEHOLDER_LABEL = "Planned Work Tool: not built yet";

export const DISPLAY = {
  name: "My name",
  first: "My first name and a business label",
  anonymous: "“A Care Partner principal”, without my name",
} as const;
export type Display = keyof typeof DISPLAY;

/** Separate permissions, each off until the contributor turns it on. Text and audience are the note's own consent. */
export const CONSENTS = {
  portrait: "A portrait or photo of me",
  recordedVoice: "A recording of my actual voice",
  syntheticVoice: "A synthetic (AI) voice reading my words",
  crossFormat: "Placing the card in Magazine courses as well as the deck",
  promotion: "Mentioning it in notifications or a webinar",
  followUpContact: "Contacting me later for a check-in",
} as const;
export type ConsentKey = keyof typeof CONSENTS;
export type Consents = Record<ConsentKey, boolean>;
export const noConsents = (): Consents => ({
  portrait: false,
  recordedVoice: false,
  syntheticVoice: false,
  crossFormat: false,
  promotion: false,
  followUpContact: false,
});

export type Claim = { text: string; basis: "reported" | "verified"; source: string };

export type BusinessContext = {
  /** The editorial Field Note number, shown on the card. */
  number: number;
  collection: Collection;
  stage: Stage;
  theme: Theme;
  serviceModel: ServiceModel | "";
  /** When: "2025, the business’s second year". */
  era: string;
  /** Broad context only: "Regional Queensland, home-based". Never a suburb plus a date plus a supplier. */
  context: string;
  /** The front: the one decision point. */
  decision: string;
  /** Optional "Before you flip" question. */
  choice: string;
  believed: string;
  tried: string;
  failed: string;
  tradeoff: string;
  /** Facts the story rests on, each contributor-reported unless verified through an authorised source. */
  claims: Claim[];
  /** The related Work Tools, the first being the one Pocket Deck offers. */
  toolIds: ToolId[];
  /** A programme rule has changed since the story happened: shown as a historical story. */
  historical: boolean;
  /** The approved guidance any rule in the story rests on, in a line. */
  ruleNote: string;
  display: Display;
  businessLabel: string;
  /** Anything the contributor says must stay private. Editors only, never shown or exported. */
  privateNote: string;
  /** Free writing, when the contributor chose that path. Editors shape it; the contributor approves the result. */
  freeText: string;
  /** Takes follow-up questions; the UI never promises a personal reply. */
  takesQuestions: boolean;
  answerWindow: string;
  consents: Consents;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const pick = <T extends string>(v: unknown, all: Record<T, unknown>, fallback: T): T => (Object.keys(all).includes(v as string) ? (v as T) : fallback);

export function cleanBusiness(raw: unknown): BusinessContext {
  const o = obj(raw);
  const c = obj(o.consents);
  return {
    number: Number.isInteger(o.number) && (o.number as number) > 0 ? Math.min(999, o.number as number) : 0,
    collection: pick(o.collection, COLLECTIONS, "starting"),
    stage: pick(o.stage, STAGES, "starting"),
    theme: pick(o.theme, THEMES, "first-hire"),
    serviceModel: o.serviceModel === "" ? "" : pick(o.serviceModel, SERVICE_MODELS, "home"),
    era: s(o.era, 80),
    context: s(o.context, 160),
    decision: s(o.decision, 300),
    choice: s(o.choice, 240),
    believed: s(o.believed, 500),
    tried: s(o.tried, 500),
    failed: s(o.failed, 500),
    tradeoff: s(o.tradeoff, 400),
    claims: (Array.isArray(o.claims) ? o.claims : [])
      .map((x) => obj(x))
      .map((x) => ({
        text: s(x.text, 200),
        basis: x.basis === "verified" && s(x.source, 200).trim() ? ("verified" as const) : ("reported" as const),
        source: s(x.source, 200),
      }))
      .filter((x) => x.text.trim())
      .slice(0, 5),
    toolIds: [...new Set((Array.isArray(o.toolIds) ? o.toolIds : []).filter((x): x is ToolId => typeof x === "string" && x in TOOLS))].slice(0, 3),
    historical: o.historical === true,
    ruleNote: s(o.ruleNote, 300),
    display: pick(o.display, DISPLAY, "first"),
    businessLabel: s(o.businessLabel, 80),
    privateNote: s(o.privateNote, 600),
    freeText: s(o.freeText, 4000),
    takesQuestions: o.takesQuestions !== false,
    answerWindow: s(o.answerWindow, 120),
    consents: Object.fromEntries((Object.keys(CONSENTS) as ConsentKey[]).map((k) => [k, c[k] === true])) as Consents,
  };
}

/** What a business card needs, beyond a note's own fields, before it can be submitted or published. */
export function businessProblems(b: BusinessContext): string[] {
  const out: string[] = [];
  if (b.decision.trim().length < 15) out.push("Describe the one decision this card is about.");
  if (b.believed.trim().length < 15) out.push("Say what you believed then.");
  if (b.tried.trim().length < 15) out.push("Say what you tried.");
  if (b.failed.trim().length < 15) out.push("Say what didn’t work, or what surprised you.");
  if (!b.era.trim()) out.push("Give a rough timeframe, such as the year or the business’s stage.");
  if (!b.toolIds.length) out.push("Choose a related Work Tool.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Screening text before it's shared: urgency, identifying detail, commercially sensitive terms
// ---------------------------------------------------------------------------------------------

/**
  Current or future commercial coordination between businesses that could compete. Retrospective lessons, decision
  methods and public information are welcome; these phrases are held for a person to review. Cautious on purpose: a
  hold is a question for a reviewer, never a legal finding.
*/
const COMMERCIAL: { re: RegExp; why: string }[] = [
  {
    re: /\b(our|my|your|their|the)\s+(new\s+)?(price|prices|pricing|fee schedule|fees|rates?|hourly rate|margin|markup|pay rates?|pay offer)\b[^.?!]*\b(will|going to|plan|planning|next|from (january|february|march|april|may|june|july|august|september|october|november|december|next)|raise|raising|increase|increasing|lift|set|charge)\b/i,
    why: "a current or future price, fee, margin or pay rate",
  },
  { re: /\$\s?\d[\d,.]*\s*(an|per|\/)\s*(hour|hr|visit|client|month|week)\b/i, why: "a specific price or rate" },
  {
    re: /\b(we|let'?s|should|could)\s+(all\s+)?(agree|charge|pay|offer|set|match|hold)\b[^.?!]*\b(rates?|prices?|fees?|pay|margins?)\b/i,
    why: "agreeing prices, fees or pay with other businesses",
  },
  {
    re: /\b(client|customer|referrer|referral|supplier|contractor)\s+(lists?|allocation|split)\b|\bshare (our|my|your) (clients|customers|referrers|contractors)\b/i,
    why: "customer, referrer or supplier lists or allocation",
  },
  {
    re: /\b(territory|territories|patch|suburbs?|region|areas?|postcodes?)\b[^.?!]*\b(split|divide|divvy|carve|stay out|keep out|you take|i'?ll take|we'?ll take|leave (it|them) to)\b|\b(split|divide|carve up)\b[^.?!]*\b(territory|territories|suburbs?|region|areas?|market)\b|\bmarket (split|division|sharing)\b/i,
    why: "dividing territory or markets",
  },
  { re: /\b(tender|bid|bids|bidding|quote)\b[^.?!]*\b(together|agree|coordinate|same price|between us)\b/i, why: "coordinating a bid or quote" },
];

export type Screen = { urgent: boolean; identifying: string[]; commercial: string[] };
/** Urgency first, then anything that might identify a person, then commercially sensitive terms. */
export function screenText(text: string): Screen {
  const gate = gateQuestion(text);
  return { urgent: gate.urgent, identifying: gate.identifying, commercial: [...new Set(COMMERCIAL.filter((c) => c.re.test(text)).map((c) => c.why))] };
}
export const held = (sc: Screen) => sc.identifying.length > 0 || sc.commercial.length > 0;
export const heldReason = (sc: Screen) =>
  [
    sc.identifying.length ? `It might identify someone (${sc.identifying.join(", ")}).` : "",
    sc.commercial.length ? `It might share commercially sensitive information (${sc.commercial.join(", ")}).` : "",
  ]
    .filter(Boolean)
    .join(" ");

/** Shown before anything is posted or submitted. The server needs them confirmed. */
export const PRE_SUBMIT = [
  "Could an older person or a worker recognise themselves?",
  "Are you sharing a current or future price, a customer list or a territory plan?",
  "Is this a live care or incident decision that needs an authorised team now?",
] as const;

export const URGENT_ROUTE = {
  title: "This sounds like something happening now",
  text: "Don’t post it here: the deck isn’t monitored in real time. If someone is in danger, call 000. Then follow the incident first steps and contact the designated incident responder.",
  href: "/tools/sirs-first-steps",
  linkText: "Incident first steps",
  after: "Nothing has been posted, and no incident report has been lodged. Lodge it through the incident process.",
};

// ---------------------------------------------------------------------------------------------
// The canonical thread
// ---------------------------------------------------------------------------------------------

export const REPLY_LABELS = {
  contributor: "Contributor experience",
  peer: "Peer perspective",
  approved: "Approved Trilogy guidance",
  owner_review: "Needs owner review",
  outdated: "Outdated or withdrawn",
} as const;
export type ReplyLabel = keyof typeof REPLY_LABELS;

export const POST_STATUS = {
  posted: "Posted",
  held: "Held for review",
  hidden: "Hidden by a moderator",
  declined: "Not posted",
  withdrawn: "Withdrawn by the author",
} as const;
export type PostStatus = keyof typeof POST_STATUS;

export type ThreadReply = { id: string; label: ReplyLabel; helpful: number; pinned: boolean; at: string };
/**
  The order replies are read in. A current Approved Trilogy guidance annotation always comes first, then anything a
  moderator pinned, then the contributor, then replies waiting for an owner, then peers by helpfulness and recency.
  Outdated replies come last. Helpful votes only ever order peers among themselves, so a popular answer can't
  outrank a correction.
*/
export function orderReplies<T extends ThreadReply>(replies: T[]): T[] {
  const tier = (r: T) =>
    r.label === "approved" ? 0 : r.label === "outdated" ? 5 : r.pinned ? 1 : r.label === "contributor" ? 2 : r.label === "owner_review" ? 3 : 4;
  return [...replies].sort((a, b) => tier(a) - tier(b) || (tier(a) === 4 ? b.helpful - a.helpful : 0) || b.at.localeCompare(a.at));
}

/** A question is answered when it has a useful response: the contributor's, approved guidance, or a reply the asker marked useful. */
export const isAnswered = (replies: { label: ReplyLabel; usefulToAsker: boolean }[]) =>
  replies.some((r) => r.label === "contributor" || r.label === "approved" || (r.label === "peer" && r.usefulToAsker));

// ---------------------------------------------------------------------------------------------
// Check-in chapters
// ---------------------------------------------------------------------------------------------

export type ChapterData = {
  /** "Eight weeks later". */
  title: string;
  /** The date the update describes, as the contributor dates it. */
  dated: string;
  whatChanged: string;
  nowThink: string;
  /** A factual correction to the original: marked, never a silent rewrite. */
  correction: boolean;
  correctionNote: string;
};
export function cleanChapter(raw: unknown): ChapterData {
  const o = obj(raw);
  return {
    title: s(o.title, 120),
    dated: /^\d{4}-\d{2}-\d{2}$/.test(s(o.dated, 10)) ? s(o.dated, 10) : "",
    whatChanged: s(o.whatChanged, 1200),
    nowThink: s(o.nowThink, 800),
    correction: o.correction === true,
    correctionNote: s(o.correctionNote, 300),
  };
}
export function chapterProblems(c: ChapterData): string[] {
  const out: string[] = [];
  if (c.title.trim().length < 3) out.push("Give the check-in a short title.");
  if (!c.dated) out.push("Date the check-in.");
  if (c.whatChanged.trim().length < 30) out.push("Say what changed since the card.");
  if (c.correction && c.correctionNote.trim().length < 10) out.push("Say what the correction is.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Editorial review: the steps before a business card is published
// ---------------------------------------------------------------------------------------------

export const REVIEW_STEPS = {
  editorial: "Editorial review",
  privacy_commercial: "Privacy and commercial check",
  subject_matter: "Subject-matter check",
} as const;
export type ReviewStep = keyof typeof REVIEW_STEPS;
/** The subject-matter check is needed when the card mentions a rule, or a screen raised a concern. */
export function stepsNeeded(b: Pick<BusinessContext, "ruleNote" | "historical">, flagged: boolean): ReviewStep[] {
  return ["editorial", "privacy_commercial", ...(b.ruleNote.trim() || b.historical || flagged ? (["subject_matter"] as const) : [])];
}

/** Playbook proposals: what a repeated question might become, and where it is in its review. */
export const PROPOSAL_OUTPUTS = {
  job_aid: "A Job Aid",
  tool_prompt: "A revised Work Tool prompt",
  scenario: "A new scenario",
  process_fix: "A process fix",
  existing: "Point to existing guidance",
} as const;
export type ProposalOutput = keyof typeof PROPOSAL_OUTPUTS;
export const PROPOSAL_STATUS = { proposed: "Proposed", owner_review: "With the owner", approved: "Approved", declined: "Declined", done: "Done" } as const;
export type ProposalStatus = keyof typeof PROPOSAL_STATUS;

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

export const EVENTS = [
  "business_deck_opened",
  "business_card_front_viewed",
  "business_card_flipped",
  "business_reflection_saved",
  "business_card_saved",
  "business_thread_opened",
  "business_question_submitted",
  "business_reply_helpful",
  "business_tool_opened",
  "business_note_contribution_started",
  "business_note_submitted",
  "business_note_published",
  "business_story_checkin_opened",
  "business_playbook_proposed",
  "business_content_flagged",
  "business_content_withdrawn",
] as const;
export type BusinessEvent = (typeof EVENTS)[number];

/** Cohorts smaller than this are suppressed in every aggregate, so a small group can't be identified. */
export const MIN_CELL = 5;
/** A count of people, or null when it's below the minimum cell size (and not zero). */
export const suppress = (n: number) => (n > 0 && n < MIN_CELL ? null : n);
export const cellText = (n: number | null) => (n === null ? `fewer than ${MIN_CELL}` : String(n));
