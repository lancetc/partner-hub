import type { Card } from "@/content/lessons";
import { BLOCK_LABELS, GUIDE_ROLES, type BlockType, type GuideRole } from "./magazine";
import { BLOCK_REGISTRY, contractFor, textMatch, type ActivityContract } from "./blockRegistry";

/*
  The Activity Catalogue (docs/activity-catalogue-audit.md): one entry for every activity a learner can do on the Hub,
  whatever surface it lives on. Magazine blocks, Topic cards, the standalone Work Tools, calculators and games each keep
  their own renderer, schema and permissions; this layer only says, in one place, what each one is, where it can be used,
  who it's for, and whether the AI builder may recommend or configure it, with the reason.

  It extends the block registry (lib/blockRegistry) rather than replacing it: a Magazine block's pedagogy (what the
  learner does, the barriers it addresses, its evidence, events and sign-off) stays in its activity contract, and this
  adds the catalogue's own facts beside it. The Admin catalogue, the AI builder's candidate list, the learner directory
  and the homepage showcase all read from here, so none of them keeps its own list of names.

  Every Magazine block type and every Topic card type must have an explicit entry: the maps below are typed as complete
  records, so a new block or card type fails the type check (and lib/activityCatalogue.test.ts) until someone decides
  whether the AI may use it and says why.
*/

export const CATALOGUE_VERSION = 1;

export const ACTIVITY_KINDS = {
  learning_block: "Learning block",
  simulator: "Simulator",
  roleplay: "Roleplay",
  calculator: "Calculator",
  job_aid: "Job Aid",
  work_tool: "Work tool",
  game: "Game",
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;

export const SURFACES = {
  magazine: "Magazine",
  topic: "Topics",
  path: "Discovery Paths",
  challenge: "Challenges",
  community: "Community",
  resources: "Resources and Work Tools",
  play: "Play",
} as const;
export type Surface = keyof typeof SURFACES;

/**
  What the AI builder may do with an activity. "configurable": it can recommend it and write a draft configuration the
  schema checks. "recommend": it can suggest it, with reasons, but a specialist sets it up from a reviewed case.
  "human": a person chooses and builds it; the AI never selects it. "unavailable": the builder can't place it at all.
*/
export const AI_MODES = {
  configurable: { label: "AI configurable", text: "The AI can recommend it and prepare a draft configuration that the schema checks and the author reviews." },
  recommend: {
    label: "AI recommended (specialist setup)",
    text: "The AI can recommend it with its reasons. A specialist sets it up from a reviewed case: the AI never writes its rules, figures or answer key.",
  },
  human: { label: "Human authored only", text: "A person chooses and builds it. The AI builder never selects or configures it." },
  unavailable: { label: "Unavailable to the AI builder", text: "Not a block the builder can place: it lives on its own page." },
} as const;
export type AiMode = keyof typeof AI_MODES;

/** Extra runtime gates beyond a course's audience: business planner access, or a superadmin's release. */
export type Gate = "planner" | "released" | null;

export type CatalogueEntry = {
  /** Stable id. For a Magazine block it's the block type saved in content; never rename one. */
  id: string;
  version: number;
  name: string;
  description: string;
  /** Older or design names, so a search for any of them finds this one entry. */
  aliases: string[];
  kind: ActivityKind;
  /** The palette group or library it belongs to. */
  category: string;
  surfaces: Surface[];
  /** Who it's designed for (GUIDE_ROLES). Empty: anyone the course or page is for. Who may open it is still the course audience and any gate. */
  designedFor: GuideRole[];
  gate: Gate;
  /** The file that draws it, from src/. */
  renderer: string;
  /** The file that checks its configuration, from src/, or null where nothing is configured. */
  schema: string | null;
  /** Where an author builds or configures it. */
  authoring: string;
  /** The AI builder that could place it, if any. */
  builder: "magazine" | "topic" | null;
  ai: { mode: AiMode; reason: string; constraints: string[] };
  /** The block's activity contract (purpose, barriers, evidence, events, sign-off), for Magazine blocks. */
  contract: ActivityContract | null;
  minutes: number | null;
  /** Who must sign it off before it's published, in words. Empty for none. */
  signoff: string;
  /** The events it records, as declared. */
  events: string[];
  /** A standalone page learners open, or null for a block that lives inside a course. */
  route: string | null;
  /** The admin page for its content or reporting, if any. */
  admin: string | null;
  /** Whether it may be featured on the homepage at all (a simulator, roleplay or calculator a learner can open). */
  homepage: boolean;
};

// ---------------------------------------------------------------------------------------------
// Magazine blocks
// ---------------------------------------------------------------------------------------------

type BlockMeta = {
  kind: ActivityKind;
  ai: AiMode;
  /** Why the AI may or may not use it. Required: no default, so every block has a decision on record. */
  reason: string;
  constraints?: string[];
  aliases?: string[];
  /** The component that draws it, under src/components/. */
  renderer: string;
  /** The file under src/lib/ that parses it, when it isn't lib/magazine itself. */
  schema?: string;
  designedFor?: GuideRole[];
  also?: Surface[];
  admin?: string;
};

const WRITES = "The AI writes its configuration from the documents; the page check and the Magazine schema validate it before the author sees it.";
const REVIEWED = (what: string) =>
  `Its ${what} come from a reviewed fictional case with named sign-off. The AI may recommend it with reasons; a specialist inserts it from the palette and sets it up. The AI never writes its configuration.`;
const OWNERS: GuideRole[] = ["owner"];

const simple = (renderer: string, kind: ActivityKind = "learning_block", more: Partial<BlockMeta> = {}): BlockMeta => ({
  kind,
  ai: "configurable",
  reason: WRITES,
  renderer,
  ...more,
});
const specialist = (renderer: string, schema: string, kind: ActivityKind, what: string, more: Partial<BlockMeta> = {}): BlockMeta => ({
  kind,
  ai: "recommend",
  reason: REVIEWED(what),
  constraints: ["Specialist setup required", "Never invent its rules, thresholds, prices, approvals or client facts"],
  renderer: `components/magazine/${renderer}`,
  schema: `lib/${schema}`,
  ...more,
});
const G = "components/magazine/GuideBlocks.tsx";
const I = "components/magazine/InteractiveBlocks.tsx";

/** One decision for every Magazine block type. Typed as a complete record: a new block type won't compile until it has one. */
export const BLOCK_META: Record<BlockType, BlockMeta> = {
  // Content
  text: simple(G),
  image: simple(G, "learning_block", { constraints: ["The picture slot is left empty and flagged for the author to fill"] }),
  textMedia: simple(G, "learning_block", { constraints: ["The picture slot is left empty and flagged for the author to fill"] }),
  video: { kind: "learning_block", ai: "human", reason: "Needs a real recording with captions; the AI can't supply one.", renderer: G },
  callout: simple(G),
  guide: {
    kind: "learning_block",
    ai: "human",
    reason: "Retired from the palette (Nov 2026): Ava's videos go in with the Ava video block. Any existing AI Learning Guide block still shows and edits.",
    renderer: "components/magazine/LearningGuide.tsx",
    admin: "/admin/learning-guide",
  },
  ava: {
    kind: "learning_block",
    ai: "human",
    reason: "Needs an uploaded video of Ava (made in ElevenLabs with the Laura avatar). The AI must never select or configure it.",
    renderer: I,
    aliases: ["Ava video", "Ava in page content"],
  },
  playbook: {
    kind: "job_aid",
    ai: "recommend",
    reason:
      "Places an approved Job Aid from the library by reference. The AI may suggest that one belongs here; the author picks the Job Aid, and nothing is written.",
    constraints: ["Only a Job Aid that's in the library, at its approved release"],
    renderer: "components/magazine/PlaybookBlock.tsx",
    schema: "lib/playbook.ts",
    aliases: ["Job Aid", "Work Tool in a course"],
    also: ["resources"],
    admin: "/admin/playbooks",
  },
  // Explore
  accordion: simple(G),
  tabs: simple(I),
  carousel: { kind: "learning_block", ai: "human", reason: "Needs two or more real pictures; the AI can't supply them.", renderer: G },
  timeline: simple(I),
  journey: specialist("SahJourney.tsx", "journey.ts", "simulator", "story, decisions and consent facts", {
    aliases: ["The SaH Journey", "Support at Home journey"],
  }),
  hubvisual: simple("components/magazine/HubVisual.tsx", "learning_block", {
    constraints: ["Only one of the Hub's own diagrams; nothing is redrawn"],
    aliases: ["Hub diagram", "Client journey map"],
  }),
  reset: specialist("ExpectationReset.tsx", "reset.ts", "learning_block", "timeline and scripts", { aliases: ["Expectation Reset"] }),
  process: simple(I),
  hotspots: {
    kind: "learning_block",
    ai: "human",
    reason: "Needs a real picture of the form, document or screen with its regions marked; the AI can't supply one.",
    renderer: I,
  },
  myths: specialist("MythTilesBlock.tsx", "myths.ts", "learning_block", "tiles", {
    reason: "Draws reviewed tiles from the Myth vs Reality library. The AI may recommend it; the author chooses the tiles. Nothing is written.",
    aliases: ["Myth vs Reality"],
    also: ["resources"],
    admin: "/admin/myths",
  }),
  // Practise
  flashcards: simple(I),
  sorting: simple(I),
  matching: simple(I),
  sequencing: simple(I),
  spot: {
    kind: "learning_block",
    ai: "human",
    reason: "Needs a fictional document or picture with its mistakes marked on it; the AI can't supply one.",
    renderer: I,
    aliases: ["Spot the mistake"],
  },
  hazardscan: specialist("SpotTheHazard.tsx", "hazardScan.ts", "simulator", "rooms, variants and answer keys", {
    aliases: ["Spot the Hazard", "hazard scenario", "home safety check"],
  }),
  fillblank: simple(I),
  decision: simple(G),
  line: specialist("LineDrawer.tsx", "line.ts", "learning_block", "cases and approved answers", { aliases: ["Where Is the Line?", "scope of practice"] }),
  redpen: specialist("RedPen.tsx", "redpen.ts", "learning_block", "document and reviewed rewrite", { aliases: ["Red Pen critique"] }),
  checklist: simple(G),
  quiz: {
    kind: "learning_block",
    ai: "recommend",
    reason: "Questions must come from the approved Question Pool, pinned to a version. The AI may recommend an assessed check; it never writes the questions.",
    constraints: ["Approved Question Pool questions only"],
    renderer: G,
    admin: "/admin/questions",
  },
  // Simulate
  branching: simple(I, "simulator", { constraints: ["4 to 10 scenes, at least one good and one poor ending"], aliases: ["Branching scenario"] }),
  conversation: simple(I, "roleplay", { aliases: ["Conversation simulator"] }),
  phonecall: specialist("FamilyCall.tsx", "phonecall.ts", "roleplay", "scene, case file, rubric and critical errors", {
    aliases: ["Tough Phone Call", "Tough Family Call", "family call roleplay", "voice roleplay"],
    admin: "/admin/family-calls",
  }),
  signal: specialist("SignalCase.tsx", "signal.ts", "simulator", "case, signals and regulatory answer", {
    aliases: ["Spot the Signal", "reportable incident case"],
  }),
  mission: specialist("MissionBoard.tsx", "mission.ts", "simulator", "case, dates and statement rules", { aliases: ["First 30 Days Mission Board"] }),
  balance: specialist("BalanceScale.tsx", "balance.ts", "simulator", "situation, cards and criteria", { aliases: ["Dignity of Risk Balance Scale"] }),
  xray: specialist("InvoiceXRay.tsx", "xray.ts", "simulator", "document lines, sources and answer key", {
    aliases: ["Invoice X-Ray", "Quote/Invoice X-Ray", "Excluded Item X-Ray", "can this be funded"],
  }),
  auditor: specialist("DocumentAuditor.tsx", "auditor.ts", "simulator", "pack, comparison records and answer key", {
    aliases: ["Document Auditor", "Contractor Vetting Card", "Contractor Compliance"],
  }),
  bridge: specialist("WhileYouWait.tsx", "bridge.ts", "calculator", "figures and status wording", { aliases: ["While You Wait calculator"] }),
  baton: specialist("BatonRelay.tsx", "baton.ts", "simulator", "relay, roles and consequences", { aliases: ["Pass the Baton relay"] }),
  budget: simple(I, "calculator", {
    constraints: ["Always flagged illustrative: a made-up budget, never real rates, fees or a participant's figures"],
    aliases: ["Budget simulator"],
  }),
  sandbox: specialist("BudgetSandbox.tsx", "sandbox.ts", "calculator", "participant, assessed rates and prices", { aliases: ["Budget Sandbox"] }),
  hiring: specialist("HiringRunwayLab.tsx", "hiringRunway.ts", "calculator", "agreement, workload, cost and cash figures", {
    aliases: ["Hiring Runway", "Hiring Runway Decision Lab", "hiring window"],
    designedFor: OWNERS,
    admin: "/admin/hiring-runway",
  }),
  onedaymap: specialist("OneDayMap.tsx", "oneDay.ts", "simulator", "day, cast and events", {
    aliases: ["One Day, Five Perspectives", "multi-persona Journey Map", "Coordinator's day map"],
  }),
  intake: specialist("GrowthReadinessLab.tsx", "growthLab.ts", "calculator", "month, hours and supplier slots", {
    aliases: ["Growth readiness", "Next 10 Clients", "Can we take on the next 10 clients"],
    designedFor: OWNERS,
  }),
  workload: specialist("WorkloadLensLab.tsx", "workloadLab.ts", "calculator", "week, categories and rework", {
    aliases: ["Workload Lens", "Coordinator Week"],
    designedFor: OWNERS,
  }),
  coverage: specialist("LocalCoverageLab.tsx", "coverageLab.ts", "calculator", "areas, needs and supply rows", {
    aliases: ["Local Coverage Comparison", "Suburb Growth Readiness"],
    designedFor: OWNERS,
  }),
  referral: specialist("ReferralJourneyLab.tsx", "referralLab.ts", "calculator", "cohort, funnel and effort figures", {
    aliases: ["Referral Journey Calculator", "Referral Journey"],
    designedFor: OWNERS,
  }),
  reliability: specialist("ServiceReliabilityLab.tsx", "reliabilityLab.ts", "calculator", "visits, recovery tasks and costs", {
    aliases: ["Service Reliability Calculator", "Missed Service Cost"],
    designedFor: OWNERS,
  }),
  cashbridge: specialist("CashBridgeLab.tsx", "cashBridgeLab.ts", "calculator", "agreement, dated receipts, outflows and actuals", {
    aliases: ["90-Day Cash Bridge", "cash flow calculator"],
    designedFor: OWNERS,
  }),
  budgetlab: specialist("BudgetDecisionLab.tsx", "budgetLab.ts", "simulator", "quarter, rule set and figures", {
    aliases: ["Quarterly Budget Decision Lab", "quarter end budget"],
  }),
  discharge: specialist("DischargePivot.tsx", "dischargePivot.ts", "simulator", "handover record, alerts, actions and rubric", {
    aliases: ["72-Hour Discharge Pivot", "hospital discharge simulator", "triage simulator"],
  }),
  network: specialist("NetworkBench.tsx", "networkBench.ts", "simulator", "contractor cards, decisions and scorecard", {
    aliases: ["Build Your Local Bench", "Contractor Network Builder (practice)"],
    designedFor: ["owner", "coordinator"],
  }),
  trustcheck: specialist("TrustCheck.tsx", "trustCheck.ts", "simulator", "signal cards, decisions and checkpoints", {
    aliases: ["28-Day Trust Check", "service recovery"],
  }),
  referralstudio: specialist("ReferralStudioBlock.tsx", "referralStudio.ts", "roleplay", "referrer scenarios, claim register and rubric", {
    aliases: ["Local Referral Studio", "referral pitch practice"],
    designedFor: ["partner", "owner"],
    admin: "/admin/referral-studio",
  }),
  shadowcoach: specialist("ShadowCoach.tsx", "shadowCoach.ts", "simulator", "work samples, findings and plan suggestions", {
    aliases: ["First 100 Days: Shadow & Coach", "Shadow and Coach"],
    designedFor: ["owner", "staff"],
  }),
  // Reflect and apply
  journal: simple("components/magazine/ReflectBlocks.tsx", "learning_block", { constraints: ["Never asks for a real client's details"] }),
  perspectives: simple("components/magazine/ReflectBlocks.tsx", "learning_block", { constraints: ["Guidance from a source is flagged for verification"] }),
  pulse: simple("components/magazine/ReflectBlocks.tsx"),
  action: simple("components/magazine/ReflectBlocks.tsx"),
  // Reflect and share
  reflection: simple(I),
  wall: simple(I, "learning_block", { constraints: ["At most one per course; never personal or about clients"], aliases: ["Insight wall"] }),
  casethread: specialist("../caseThreads/CaseThread.tsx", "caseThread.ts", "learning_block", "case, case note and seed responses", {
    renderer: "components/caseThreads/CaseThread.tsx",
    aliases: ["What Would You Do?", "Community case thread"],
    also: ["community"],
    admin: "/admin/case-threads",
  }),
  poll: simple(I),
  benchmark: specialist("PeerPoll.tsx", "benchmark.ts", "learning_block", "case, options and reviewed next step", { aliases: ["Peer benchmark poll"] }),
  mentor: specialist("NotesDeck.tsx", "notes.ts", "learning_block", "notes", {
    reason: "Deals reviewed notes from the mentor note library. The AI may recommend it; nothing is written.",
    aliases: ["Notes to a Younger Me"],
    admin: "/admin/mentor-notes",
  }),
  confidence: simple(I),
};

/**
  Blocks no longer offered in the editor's palette, each with why. Existing ones still render and edit, so saved
  courses are untouched; the catalogue check accepts them missing from the palette.
*/
export const RETIRED_FROM_PALETTE: Partial<Record<BlockType, string>> = {
  guide:
    "One Ava insert (the owner, Nov 2026): her ElevenLabs videos go in with the Ava video block, the same way as at the top of a page. No course used this block.",
};

/** The Magazine editor's palette groups, for an entry's category. */
const PALETTE_GROUP: Record<string, BlockType[]> = {
  Content: ["text", "image", "textMedia", "video", "guide", "ava", "callout", "playbook"],
  Explore: ["accordion", "tabs", "carousel", "timeline", "journey", "hubvisual", "reset", "process", "hotspots", "myths"],
  Practise: ["flashcards", "sorting", "matching", "sequencing", "spot", "hazardscan", "fillblank", "decision", "line", "redpen", "checklist", "quiz"],
  Reflect: ["journal", "perspectives", "pulse", "action"],
  Share: ["reflection", "wall", "casethread", "poll", "benchmark", "mentor", "confidence"],
};
const groupOf = (t: BlockType) => Object.entries(PALETTE_GROUP).find(([, list]) => list.includes(t))?.[0] ?? "Simulate";

const HOMEPAGE_KINDS = new Set<ActivityKind>(["simulator", "roleplay", "calculator"]);

function blockEntry(c: ActivityContract): CatalogueEntry {
  const m = BLOCK_META[c.type];
  return {
    id: c.type,
    version: c.version,
    name: BLOCK_LABELS[c.type],
    description: c.purpose,
    aliases: m.aliases ?? [],
    kind: m.kind,
    category: groupOf(c.type),
    surfaces: ["magazine", "path", ...(m.also ?? [])],
    designedFor: m.designedFor ?? [],
    gate: null,
    renderer: m.renderer,
    schema: m.schema ?? "lib/magazine.ts",
    authoring: `Magazine editor → Add block → ${groupOf(c.type)}`,
    builder: "magazine",
    ai: { mode: m.ai, reason: m.reason, constraints: m.constraints ?? [] },
    contract: c,
    minutes: c.minutes,
    signoff: c.signoff,
    events: c.events,
    route: null,
    admin: m.admin ?? null,
    homepage: HOMEPAGE_KINDS.has(m.kind),
  };
}

// ---------------------------------------------------------------------------------------------
// Topic cards
// ---------------------------------------------------------------------------------------------

type CardType = Card["type"];
type CardMeta = { name: string; description: string; kind: ActivityKind; ai: AiMode; reason: string };
const TOPIC_WRITES =
  "The Topic builder (server/lessonDraft) writes it as part of its fixed seven-stage pattern. It doesn't choose activities from the catalogue.";
const TOPIC_HUMAN = "The Topic builder never writes it: an author adds it in the Topic editor.";

/** One decision for every Topic card type. Typed as a complete record, like the blocks. */
export const TOPIC_CARD_META: Record<CardType, CardMeta> = {
  presenter: { name: "Presenter video", description: "Ava introduces the Topic on video", kind: "learning_block", ai: "configurable", reason: TOPIC_WRITES },
  image: { name: "Image card", description: "Reads a short explanation with a picture", kind: "learning_block", ai: "configurable", reason: TOPIC_WRITES },
  audio: { name: "Audio card", description: "Listens to a narrated explanation", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  listen: { name: "Listen card", description: "Listens to a short script", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  decision: { name: "Decision card", description: "Chooses what to do in the situation", kind: "learning_block", ai: "configurable", reason: TOPIC_WRITES },
  quiz: { name: "Quick quiz", description: "Answers two or three questions with feedback", kind: "learning_block", ai: "configurable", reason: TOPIC_WRITES },
  response: {
    name: "Your turn",
    description: "Applies it to their own work and compares a model answer",
    kind: "learning_block",
    ai: "configurable",
    reason: TOPIC_WRITES,
  },
  summary: { name: "Summary", description: "Reads the recap and one action to take", kind: "learning_block", ai: "configurable", reason: TOPIC_WRITES },
  calculator: { name: "Calculator card", description: "Works out a figure with a small calculator", kind: "calculator", ai: "human", reason: TOPIC_HUMAN },
  checklist: { name: "Checklist card", description: "Ticks off the checks for a task", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  hotspot: { name: "Hotspot card", description: "Finds the parts of a picture", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  resources: { name: "Resources card", description: "Opens the official resources", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  written: {
    name: "Written answer",
    description: "Answers in their own words, checked by AI against the author's criteria",
    kind: "learning_block",
    ai: "human",
    reason: TOPIC_HUMAN,
  },
  wall: { name: "Wall card", description: "Reads and adds to peers' answers", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  poll: { name: "Poll card", description: "Votes and sees how others voted", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  rating: { name: "Rating card", description: "Rates confidence and sees the spread", kind: "learning_block", ai: "human", reason: TOPIC_HUMAN },
  widget: {
    name: "Interactive widget",
    description: "Uses a small interactive made for the Topic",
    kind: "learning_block",
    ai: "human",
    reason: "Made one at a time with the widget builder (server/widgetGen) at the author's request. The Topic builder doesn't place it.",
  },
};

function cardEntry(type: CardType): CatalogueEntry {
  const m = TOPIC_CARD_META[type];
  return {
    id: `topic.${type}`,
    version: 1,
    name: m.name,
    description: m.description,
    aliases: [],
    kind: m.kind,
    category: "Topic cards",
    surfaces: ["topic", "path", "challenge"],
    designedFor: [],
    gate: null,
    renderer: "components/player/LessonPlayer.tsx",
    schema: "content/lessons.ts",
    authoring: "Topic editor",
    builder: "topic",
    ai: { mode: m.ai, reason: m.reason, constraints: [] },
    contract: null,
    minutes: null,
    signoff: "Topic approval workflow",
    events: [],
    route: null,
    admin: "/admin/lessons",
    homepage: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Standalone tools, calculators and games
// ---------------------------------------------------------------------------------------------

const STANDALONE = (
  id: string,
  e: Pick<CatalogueEntry, "name" | "description" | "kind" | "category" | "surfaces" | "renderer" | "authoring" | "route"> &
    Partial<CatalogueEntry> & { block?: BlockType },
): CatalogueEntry => ({
  id,
  version: 1,
  aliases: [],
  designedFor: [],
  gate: null,
  schema: null,
  builder: null,
  ai: {
    mode: "unavailable",
    reason: e.block
      ? `A standalone ${ACTIVITY_KINDS[e.kind].toLowerCase()} on its own page, not a block. The Magazine builder can't place it; the matching block is “${BLOCK_LABELS[e.block]}”, or link to the page.`
      : `A standalone ${ACTIVITY_KINDS[e.kind].toLowerCase()} on its own page, not a block. The Magazine builder can't place it; an author can link to the page.`,
    constraints: [],
  },
  contract: null,
  minutes: null,
  signoff: "",
  events: [],
  admin: null,
  homepage: false,
  ...e,
});

export const STANDALONE_ACTIVITIES: CatalogueEntry[] = [
  STANDALONE("tool.job-aids", {
    name: "Job Aids (Work Tools library)",
    description: "Short, approved tools for the task in front of you: a checklist, the questions to ask, who to tell. Always the current release.",
    kind: "job_aid",
    category: "Work Tools",
    surfaces: ["resources"],
    renderer: "components/playbooks/WorkTools.tsx",
    authoring: "Administration → Job Aids",
    route: "/tools",
    admin: "/admin/playbooks",
    aliases: ["Work Tools", "playbooks"],
    block: "playbook",
    events: ["playbook viewed", "playbook acknowledged", "saved to Favourites"],
  }),
  STANDALONE("tool.caseload-margin", {
    name: "Caseload-to-Margin & Hiring Capacity",
    description: "Plans when to recruit and what growth could do to workload, margin and cash, for a fictional example or the person's own business.",
    kind: "calculator",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: OWNERS,
    gate: "planner",
    renderer: "components/tools/CaseloadPlanner.tsx",
    authoring: "Code and content (lib/caseloadPlanner, lib/hiringModel)",
    route: "/tools/caseload-margin",
    admin: "/admin/hiring-runway",
    aliases: ["Plan my business", "Plan capacity", "hiring calculator"],
    block: "hiring",
    events: ["planner_events (ids only, never values)"],
  }),
  STANDALONE("tool.network-builder", {
    name: "Contractor Network Builder",
    description: "Builds local contractor capacity for a service gap, on demo data only.",
    kind: "work_tool",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: OWNERS,
    gate: "planner",
    renderer: "components/tools/NetworkBuilderTool.tsx",
    authoring: "Code and content (content/networkDemo)",
    route: "/tools/network-builder",
    block: "network",
    events: ["network_tool_events"],
  }),
  STANDALONE("tool.referral-studio", {
    name: "Local Referral Studio (Work Tool)",
    description: "Practises a referral conversation, then creates an approved one-pager for a GP practice or hospital team.",
    kind: "work_tool",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: OWNERS,
    gate: "planner",
    renderer: "components/tools/ReferralStudioTool.tsx",
    authoring: "Administration → Local Referral Studio (claim register)",
    route: "/tools/referral-studio",
    admin: "/admin/referral-studio",
    block: "referralstudio",
    events: ["referral_studio_events"],
  }),
  STANDALONE("tool.trust-check", {
    name: "28-Day Trust Check (Work Tool)",
    description: "Follows up a missed visit, a statement query or an unanswered call with the person, an owner and a check that it helped. Demo data only.",
    kind: "work_tool",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: OWNERS,
    gate: "planner",
    renderer: "components/tools/TrustCheckTool.tsx",
    authoring: "Code and content (content/trustDemo)",
    route: "/tools/trust-check",
    block: "trustcheck",
    events: ["trust_tool_events"],
  }),
  STANDALONE("tool.first-100-days", {
    name: "First 100 Days workbench",
    description: "Plans a new coordinator's observations, approved learning and a scoped readiness conversation. Demo data only; never an HR record.",
    kind: "work_tool",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: OWNERS,
    gate: "planner",
    renderer: "components/tools/First100DaysTool.tsx",
    authoring: "Code and content (content/shadowCoachDemo)",
    route: "/tools/first-100-days",
    block: "shadowcoach",
    events: ["shadow_tool_events"],
  }),
  STANDALONE("tool.while-you-wait", {
    name: "While You Wait (live call)",
    description:
      "For a call with someone waiting for funding: what can be arranged now, what it could cost, and what changes when funding is in place. Nothing is saved.",
    kind: "calculator",
    category: "Work Tools",
    surfaces: ["resources"],
    designedFor: ["coordinator", "staff"],
    gate: "released",
    renderer: "components/magazine/WhileYouWait.tsx",
    authoring: "Code; released by a superadmin",
    route: "/tools/while-you-wait",
    block: "bridge",
  }),
  STANDALONE("tool.contribution-quick-calc", {
    name: "Contribution Quick-Calc",
    description: "Works out a participant contribution during a live call, from the Pocket Playbook.",
    kind: "calculator",
    category: "Pocket Playbook",
    surfaces: ["resources"],
    designedFor: ["coordinator", "staff"],
    renderer: "components/pocket/QuickCalc.tsx",
    authoring: "Content (content/pocketPlaybook, content/quickCalcRules)",
    route: "/tools/contribution-quick-calc",
    admin: "/admin/pocket-playbook",
  }),
  STANDALONE("tool.incident-first-steps", {
    name: "Incident first steps",
    description: "Steps through what to do first when an incident may be reportable, with the SIRS categories and who to tell.",
    kind: "job_aid",
    category: "Pocket Playbook",
    surfaces: ["resources"],
    renderer: "components/pocket/IncidentPath.tsx",
    authoring: "Content (content/pocketPlaybook)",
    route: "/tools/incident-first-steps",
    admin: "/admin/pocket-playbook",
    aliases: ["SIRS Red-Flag", "SIRS first steps", "incident red flags"],
  }),
  STANDALONE("tool.golden-scripts", {
    name: "Golden Scripts",
    description: "Approved words for common moments in a call.",
    kind: "job_aid",
    category: "Pocket Playbook",
    surfaces: ["resources"],
    designedFor: ["coordinator", "staff"],
    renderer: "components/pocket/GoldenScripts.tsx",
    authoring: "Content (content/pocketPlaybook)",
    route: "/tools/golden-scripts",
    admin: "/admin/pocket-playbook",
  }),
  STANDALONE("play.coordinators-day", {
    name: "The Coordinator’s Day",
    description: "A board game through a care coordinator’s day, from the first call to handover: good decisions move you forward.",
    kind: "game",
    category: "Play",
    surfaces: ["play"],
    renderer: "components/coordinatorsDay/CoordinatorsDay.tsx",
    authoring: "Content (content/coordinatorsDay)",
    route: "/play/coordinators-day",
    aliases: ["Coordinator's Day board game"],
  }),
  STANDALONE("play.explorer", {
    name: "Neighbourhood Explorer",
    description: "Walks a pixel-art neighbourhood helping clients, quest by quest.",
    kind: "game",
    category: "Play",
    surfaces: ["play"],
    renderer: "components/explorer/Explorer.tsx",
    authoring: "Content (content/explorer)",
    route: "/explorer",
  }),
  STANDALONE("play.conversations", {
    name: "Care Conversations",
    description: "Draws conversation cards and talks them over with others, alone or in a shared room.",
    kind: "game",
    category: "Play",
    surfaces: ["play"],
    renderer: "components/conversations/CareConversations.tsx",
    authoring: "Content (content/conversations)",
    route: "/play/conversations",
  }),
  STANDALONE("magazine.ava-relay", {
    name: "Ava Relay",
    description: "Checks in with Ava, the AI guide, from a Magazine story page: questions about the page and the work it points to.",
    kind: "roleplay",
    category: "Magazine page feature",
    surfaces: ["magazine"],
    renderer: "components/relay/AvaRelay.tsx",
    authoring: "Magazine editor → a page → Ava Relay",
    route: null,
    admin: "/admin/relay",
    aliases: ["Ava-hosted story activity", "Check in with Ava"],
    ai: {
      mode: "human",
      reason: "A page setting, not a block: the author switches it on for a story page in the editor's sidebar. The AI builder never turns it on.",
      constraints: [],
    },
  }),
];

/**
  What the scan found and deliberately left out of the catalogue, with why. Kept here so the audit and the Admin view show
  the same reasons, and a reviewer can challenge them.
*/
export const EXCLUDED: { id: string; name: string; where: string; reason: string }[] = [
  {
    id: "page.journey",
    name: "Client journey page",
    where: "/journey",
    reason: "A reference diagram, not an activity. Its activity form is the Hub diagram block (hubvisual).",
  },
  {
    id: "page.pocket-deck",
    name: "Pocket Deck",
    where: "/pocket-deck",
    reason: "The learner's own saved mentor notes: a personal collection, not an activity. The activity is the Notes to a Younger Me block (mentor).",
  },
  {
    id: "page.field-notes",
    name: "Field Notes from Ava",
    where: "/field-notes",
    reason: "An invitation back to a character; each return episode is an ordinary Magazine page whose blocks are catalogued.",
  },
  {
    id: "page.business-notes",
    name: "Business Field Notes",
    where: "/business-notes",
    reason: "A moderated community edition for principals: stories and discussion, not a scored or practised activity.",
  },
  {
    id: "community.digital-members",
    name: "Digital Member chat",
    where: "/community",
    reason: "Conversation with fictional community members for connection and story; it isn't designed or measured as practice.",
  },
  {
    id: "community.lives",
    name: "Lives in Progress and Life Moments",
    where: "/community",
    reason: "Ongoing character stories for voluntary engagement; no learning activity or outcome is attached.",
  },
  {
    id: "surface.challenges",
    name: "Challenges",
    where: "/challenges",
    reason: "A container: each day's mission is a Topic, so its activities are the Topic cards.",
  },
  {
    id: "elearning.scorm",
    name: "eLearning (SCORM)",
    where: "/elearning",
    reason: "Imported packages run in their own player; their activities are inside the package and can't be inspected or selected.",
  },
];

/** Every catalogued activity: Magazine blocks first (in the registry's order), then Topic cards, then standalone ones. */
export const CATALOGUE: CatalogueEntry[] = [
  ...BLOCK_REGISTRY.map(blockEntry),
  ...(Object.keys(TOPIC_CARD_META) as CardType[]).map(cardEntry),
  ...STANDALONE_ACTIVITIES,
];

const BY_ID = new Map(CATALOGUE.map((e) => [e.id, e]));
export const catalogueEntry = (id: string) => BY_ID.get(id);

/** Finds an entry by its id, name or any alias, ignoring case: saved content and old names land on one canonical entry. */
export function resolveActivity(nameOrId: string): CatalogueEntry | undefined {
  const k = nameOrId.trim().toLowerCase();
  return BY_ID.get(nameOrId) ?? CATALOGUE.find((e) => e.id.toLowerCase() === k || e.name.toLowerCase() === k || e.aliases.some((a) => a.toLowerCase() === k));
}

/** Whether the Magazine AI builder may name this block at all, and how. */
export function magazineAiMode(type: string): AiMode {
  const e = BY_ID.get(type);
  return e && e.builder === "magazine" ? e.ai.mode : "unavailable";
}

/** The blocks the Magazine AI builder may write configuration for. */
export const AI_CONFIGURABLE_BLOCKS = CATALOGUE.filter((e) => e.builder === "magazine" && e.ai.mode === "configurable").map((e) => e.id as BlockType);

/**
  The Magazine builder's shortlist for a course: every block it may write, plus the specialist ones it may recommend that
  best match the brief (by the registry's own text match), up to `specialists`. Filtered by who the course is for: a block
  designed only for business owners isn't offered for a course that partners can't read. Deterministic: the same brief
  and audience always give the same list.
*/
export function magazineCandidates(input: { text: string; audience: string[]; specialists?: number }) {
  const roles = new Set<string>(
    input.audience.length ? [...input.audience, ...(input.audience.includes("partner") ? ["owner"] : [])] : GUIDE_ROLES.map((r) => r.value),
  );
  const fits = (e: CatalogueEntry) => !e.designedFor.length || e.designedFor.some((r) => roles.has(r));
  const blocks = CATALOGUE.filter((e) => e.builder === "magazine" && fits(e));
  const configurable = blocks.filter((e) => e.ai.mode === "configurable");
  const specialist = blocks
    .filter((e) => e.ai.mode === "recommend")
    .map((e) => ({
      e,
      score: e.contract ? textMatch(e.contract, input.text) + e.aliases.filter((a) => input.text.toLowerCase().includes(a.toLowerCase())).length * 6 : 0,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
    .slice(0, input.specialists ?? 8)
    .map((x) => x.e);
  return [...configurable, ...specialist];
}

/** The short line a candidate gets in the builder's prompt: id, name, mode, time, what the learner does and what it's good for. */
export const candidateLine = (e: CatalogueEntry) =>
  `- ${e.id} (${e.name}; ${e.ai.mode === "configurable" ? "you write it" : "specialist setup: recommend only"}; about ${e.minutes ?? "?"} min): ${e.description}${
    e.contract?.goodFor.length ? ` Good for: ${e.contract.goodFor.slice(0, 5).join("; ")}.` : ""
  }${e.contract?.poorFit ? ` Poor fit: ${e.contract.poorFit}` : ""}${e.ai.constraints.length ? ` Rules: ${e.ai.constraints.join("; ")}.` : ""}`;

/** contractFor, re-exported so callers that only need the catalogue have one import. */
export { contractFor };

/** Test or throwaway courses never count as examples and are never featured. */
export const isTestSlug = (slug: string) => /^(zz-|test-|throwaway)/i.test(slug);

// ---------------------------------------------------------------------------------------------
// The Admin view: one row per entry with its checked status, filtered the same way on screen and in the export
// ---------------------------------------------------------------------------------------------

export const CHECKS = {
  exists: "Exists",
  registered: "Registered",
  renderable: "Renderable",
  authorable: "Authorable",
  aiReady: "AI-ready",
  tracked: "Tracked",
  published: "Published",
  promotable: "Promotable",
} as const;
export type CheckKey = keyof typeof CHECKS;
export type CheckState = "yes" | "partial" | "no" | "unknown" | "n/a";
export type Check = { state: CheckState; note: string };

export const APPROVAL = {
  reviewed: "Published (not a demo edition)",
  demo: "Published under a demo sign-off only",
  test: "Published only in a test course",
  draft: "In drafts only",
  none: "Not used yet",
  live: "Live",
  withdrawn: "Withdrawn",
  na: "Not applicable",
} as const;
export type Approval = keyof typeof APPROVAL;

export type Example = { guideId: string; slug: string; title: string; demo: boolean; test: boolean; audience: string[] };

export type CatalogueRow = Omit<CatalogueEntry, "contract"> & {
  purpose: string;
  goodFor: string[];
  poorFit: string;
  inputs: string[];
  evidence: string;
  checks: Record<CheckKey, Check>;
  approval: Approval;
  health: "ok" | "attention" | "broken";
  attention: string[];
  examples: Example[];
  drafts: number;
  observed: number;
  sample: { title: string; href: string } | null;
  actions: { preview: string | null; builder: string | null; usage: string | null };
  lastVerified: string;
  validation: string[];
};

export type CatalogueFilters = {
  q?: string;
  kind?: string;
  surface?: string;
  role?: string;
  ai?: string;
  authoring?: string;
  approval?: string;
  health?: string;
};

/** The on-screen filters. The export runs the same function on the same query, so the file matches the screen. */
export function filterRows(rows: CatalogueRow[], f: CatalogueFilters) {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || [r.id, r.name, r.description, ...r.aliases, ...r.goodFor].some((s) => s.toLowerCase().includes(q))) &&
      (!f.kind || r.kind === f.kind) &&
      (!f.surface || r.surfaces.includes(f.surface as Surface)) &&
      (!f.role || !r.designedFor.length || r.designedFor.includes(f.role as GuideRole)) &&
      (!f.ai || r.ai.mode === f.ai) &&
      (!f.authoring || r.checks.authorable.state === f.authoring) &&
      (!f.approval || r.approval === f.approval) &&
      (!f.health || (f.health === "attention" ? r.health !== "ok" : r.health === f.health)),
  );
}

/** The export's columns and the value of each for a row. */
export const EXPORT_COLUMNS: [string, (r: CatalogueRow) => string | number][] = [
  ["ID", (r) => r.id],
  ["Name", (r) => r.name],
  ["Kind", (r) => ACTIVITY_KINDS[r.kind]],
  ["Category", (r) => r.category],
  ["Surfaces", (r) => r.surfaces.map((s) => SURFACES[s]).join(", ")],
  [
    "Designed for",
    (r) => (r.designedFor.length ? r.designedFor.map((x) => GUIDE_ROLES.find((g) => g.value === x)?.label ?? x).join(", ") : "Anyone the course is for"),
  ],
  ["Extra gate", (r) => (r.gate === "planner" ? "Business planner access" : r.gate === "released" ? "Released by a superadmin" : "")],
  ["AI selection", (r) => AI_MODES[r.ai.mode].label],
  ["Why (AI decision)", (r) => r.ai.reason],
  ["AI constraints", (r) => r.ai.constraints.join("; ")],
  ...(Object.keys(CHECKS) as CheckKey[]).map((k): [string, (r: CatalogueRow) => string] => [CHECKS[k], (r) => `${r.checks[k].state}: ${r.checks[k].note}`]),
  ["Approval", (r) => APPROVAL[r.approval]],
  ["Health", (r) => r.health],
  ["Needs attention", (r) => r.attention.join(" | ")],
  ["Published examples", (r) => r.examples.map((e) => `${e.title}${e.demo ? " (demo edition)" : ""}${e.test ? " (test course)" : ""}`).join(" | ")],
  ["Drafts using it", (r) => r.drafts],
  ["Events recorded", (r) => r.observed],
  ["Sample", (r) => r.sample?.href ?? ""],
  ["Route", (r) => r.route ?? ""],
  ["Renderer", (r) => `src/${r.renderer}`],
  ["Schema", (r) => (r.schema ? `src/${r.schema}` : "")],
  ["Authoring", (r) => r.authoring],
  ["Sign-off", (r) => r.signoff],
  ["Declared events", (r) => r.events.join(", ")],
  ["Minutes", (r) => r.minutes ?? ""],
  ["Aliases", (r) => r.aliases.join(", ")],
  ["Owner", () => "Not recorded in code"],
  ["Last verified", (r) => r.lastVerified],
  ["Validation", (r) => (r.validation.length ? r.validation.join(" | ") : "Passed")],
];

/**
  The catalogue's own rules, checked without the file system: every entry has an explicit AI decision with a reason,
  ids and aliases are unique, surfaces match what the entry is, and a homepage-eligible entry is something a learner
  can open. The test adds the file checks (renderer, schema, route) on top. Returns problems by entry id.
*/
export function validateCatalogue(entries: CatalogueEntry[] = CATALOGUE): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, p: string) => out.set(id, [...(out.get(id) ?? []), p]);
  const names = new Map<string, string>();
  for (const e of entries) {
    if (!(e.ai.mode in AI_MODES)) add(e.id, `Unknown AI mode “${e.ai.mode}”.`);
    if (!e.ai.reason || e.ai.reason.length < 20) add(e.id, "No explicit reason for its AI eligibility.");
    if (!e.surfaces.length) add(e.id, "No surface.");
    if (!e.renderer) add(e.id, "No renderer.");
    for (const key of [e.id, ...e.aliases].map((s) => s.toLowerCase())) {
      const other = names.get(key);
      if (other && other !== e.id) add(e.id, `“${key}” is also ${other}'s id or alias.`);
      names.set(key, e.id);
    }
    if (e.builder === "magazine" && !e.surfaces.includes("magazine")) add(e.id, "A Magazine block that doesn't claim the Magazine surface.");
    if (e.builder !== "magazine" && e.builder !== "topic" && e.ai.mode === "configurable")
      add(e.id, "Says the AI can configure it, but no builder can place it.");
    if (e.surfaces.includes("topic") && e.builder !== "topic") add(e.id, "Claims the Topic surface, but Topics can only hold Topic cards.");
    // A page feature (Ava Relay) lives on Magazine pages, so it needs no route of its own.
    if (e.route === null && e.builder === null && e.category !== "Magazine page feature") add(e.id, "A standalone activity with no route a learner can open.");
    if (e.homepage && e.builder !== "magazine" && !e.route) add(e.id, "Homepage-eligible, but nothing a learner can open.");
    if (e.gate && e.builder === "magazine") add(e.id, "A block can't carry its own gate: who reads it is the course's audience.");
  }
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) add(e.id, "Duplicate id.");
    seen.add(e.id);
  }
  return out;
}
