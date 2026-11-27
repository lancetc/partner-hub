import { safeHref } from "./richText";
import { parseVideoLink } from "./videoLinks";
import { narrationState, pageSnapshot } from "./magazineNarration";
import { reviewChecks } from "./magazineReview";
import { guideChecks, type GuideMode, type GuidePurpose } from "./magazineGuide";
import { emphasisChecks } from "./emphasis";
import { blankRoleplay, DEFAULT_METER, DIMENSIONS, TURN_RANGE, type Dimension, type Roleplay } from "./roleplay";
import { parseSignal, type SignalBlockData } from "./signal";
import { parseMission, type MissionBlockData } from "./mission";
import { parseBalance, type BalanceBlockData } from "./balance";
import { parseXRay, type XRayBlockData } from "./xray";
import { parseReset, type ResetBlockData } from "./reset";
import { parseLine, type LineBlockData } from "./line";
import { parseBridge, type BridgeBlockData } from "./bridge";
import { parseJourney, type JourneyBlockData } from "./journey";
import { parseBenchmark, type BenchmarkBlockData } from "./benchmark";
import { parseMythBlock, type MythBlockData } from "./myths";
import { parseBaton, type BatonBlockData } from "./baton";
import { parseRedPen, type RedPenBlockData } from "./redpen";
import { parseNotesDeck, type NotesDeckData } from "./notes";
import { parsePlaybookBlock, type PlaybookBlockData } from "./playbook";
import { cleanRelayCourse, cleanRelayPage, relayChecks, type RelayCourse, type RelayPage } from "./relayConfig";
import { parseAuditor, type AuditorBlockData } from "./auditor";
import { parsePhoneCase, type PhoneCallData } from "./phonecall";
import { parseFamilyCall } from "./familyCall";
import { parseSandbox, type SandboxBlockData } from "./sandbox";
import { parseHiringLab, type HiringLabData } from "./hiringRunway";
import { parseOneDay, type OneDayData } from "./oneDay";
import { parseIntakeLab, type IntakeLabData } from "./growthLab";
import { parseWorkloadLab, type WorkloadLabData } from "./workloadLab";
import { parseCoverageLab, type CoverageLabData } from "./coverageLab";
import { parseReferralLab, type ReferralLabData } from "./referralLab";
import { parseReliabilityLab, type ReliabilityLabData } from "./reliabilityLab";
import { parseCashBridgeLab, type CashBridgeLabData } from "./cashBridgeLab";
import { parseCaseThread, type CaseThreadData } from "./caseThread";
import { parseBudgetLab, type BudgetLabData } from "./budgetLab";
import { parseHazardScan, type HazardScanData } from "./hazardScan";
import { parseDischarge, type DischargeData } from "./dischargePivot";
import { parseNetwork, type NetworkData } from "./networkBench";
import { parseTrust, type TrustData } from "./trustCheck";
import { parseStudio, type StudioData } from "./referralStudio";
import { parseShadow, type ShadowData } from "./shadowCoach";

/*
  Magazine: the Hub's desk-reading format. A Magazine is a course of one or more pages; a one-page
  Magazine shows learners as a Guide, a longer one as a Course. Each page is an article with its own
  teaching pattern (Decide, Do, Notice, Adapt), made of sections of blocks. The whole course is a typed
  document, stored as JSON and checked here before it is saved, published or drawn, so nothing in it is
  ever put on the page as HTML. Text uses the Hub's rich text marks (lib/richText). The same renderer
  draws the published pages, the author's preview and every version kept for reporting.

  Schema version 2 (pages). Version 1 (one list of sections) is upgraded on reading to a one-page
  course, so anything published on it stays readable.
*/

export const GUIDE_SCHEMA = 2;

/** Who a guide is for, using the Hub's own audiences. An empty list is everyone signed in. */
export const GUIDE_AUDIENCES = [
  { value: "coordinator", label: "Care coordinators", phrase: "care coordinators" },
  { value: "partner", label: "Care partners", phrase: "care partners" },
  { value: "staff", label: "Trilogy Care staff", phrase: "Trilogy Care staff" },
] as const;

/** "care coordinators and Trilogy Care staff": who a guide is for, as it reads in a sentence. */
export const audiencePhrase = (values: readonly string[]) =>
  GUIDE_AUDIENCES.filter((a) => values.includes(a.value))
    .map((a) => a.phrase)
    .join(" and ");
export type GuideAudience = (typeof GUIDE_AUDIENCES)[number]["value"];

/**
  What the learner should be able to do on a page. The author picks one for each page; it sets the
  page's starting sections, not a fixed design. (Say, conversation practice, waits for the Hub's role
  play to be embeddable; it isn't offered until it works.)
*/
export const PAGE_TEMPLATES = {
  decide: {
    label: "Decide",
    title: "Story and decision",
    action: "Make a judgement in a realistic situation.",
    pattern: "Hook → person and context → choice → consequence and feedback → the principle → apply it elsewhere",
    example: "Dot and the rose garden",
  },
  do: {
    label: "Do",
    title: "Field guide",
    action: "Carry out a repeatable task at work.",
    pattern: "When you'll do it → steps → worked example → common mistake → quick practice → job aid",
    example: "Check a supplier invoice",
  },
  notice: {
    label: "Notice",
    title: "Worked example",
    action: "Inspect something and recognise the detail that matters.",
    pattern: "The example → guided notes → reasoning → a second one to inspect → your turn → feedback",
    example: "Read the changes in a care plan",
  },
  adapt: {
    label: "Adapt",
    title: "Change briefing",
    action: "Update an established way of working.",
    pattern: "What changed and when → before and now → who it affects → a typical case → source and next step",
    example: "A revised coordination process",
  },
  say: {
    label: "Say",
    title: "Conversation practice",
    action: "Choose words and respond to another person.",
    pattern: "Conversation goal → the scene → the conversation, turn by turn → coaching → phrases to take away",
    example: "Explaining client contributions to a worried family member",
  },
  blank: { label: "Blank", title: "Start blank", action: "Your own structure.", pattern: "One section to start", example: "" },
} as const;
export type PageTemplate = keyof typeof PAGE_TEMPLATES;

/** How a Magazine shows to learners: one page is a Guide; more is a Course. */
export const formatLabel = (doc: { pages: unknown[] }) => (doc.pages.length > 1 ? "Course" : "Guide");

/**
  The simulation and decision-lab blocks: a reader plays a case through rather than reading about it. The editor's
  "Simulate" palette and the Magazine's "Simulations" format both read this list.
*/
export const SIMULATION_BLOCKS = [
  "branching",
  "conversation",
  "phonecall",
  "signal",
  "mission",
  "balance",
  "xray",
  "auditor",
  "bridge",
  "baton",
  "budget",
  "sandbox",
  "hiring",
  "onedaymap",
  "intake",
  "workload",
  "coverage",
  "referral",
  "reliability",
  "cashbridge",
  "budgetlab",
  "discharge",
  "network",
  "trustcheck",
  "referralstudio",
  "shadowcoach",
] as const satisfies readonly BlockType[];

/**
  What a reader is opening, for browsing the Magazine: a course (several pages), a simulation (one page built around a
  simulation or decision lab), or a guide (one page to read: a field guide, expert guidance or an explainer).
*/
/**
  Browsing tags: who a guide is for by role, and what it helps them do. They only shape browsing and search: who may
  read a guide is still its audience (above). The Hub serves partner businesses (their owners and managers as well
  as the people delivering services) and Trilogy Care's own teams, and the aim running through it is growing the
  business, ours and the partners'.
*/
/**
  The roles a story can be tagged for, named as the Hub's demo profiles are (the owner, Nov 2026): Suppliers (a partner
  business's workers: Sam), Care Coordinators (Riley), Care Partners (the partner business's owner or manager: Casey) and
  Trilogy Care staff (Avery, and administrators). The values stay as they were, so existing tags keep working.
*/
export const GUIDE_ROLES = [
  { value: "partner", label: "Suppliers" },
  { value: "coordinator", label: "Care Coordinators" },
  { value: "owner", label: "Care Partners" },
  { value: "staff", label: "Trilogy Care staff" },
] as const;
export type GuideRole = (typeof GUIDE_ROLES)[number]["value"];

/**
  The browsing role someone starts on in the Magazine's and the activity directory's role filters: their own (a partner
  business's owner or manager is a Care Partner, its workers Suppliers), or none for authors and administrators, who
  start on everything. They can always choose another.
*/
export function browsingRole(v: { audience: string; role: string; canAuthor?: boolean; selfRole?: string | null }): GuideRole | null {
  if (v.canAuthor || v.role === "author") return null;
  // The role they picked for themself at the first sign-in (lib/onboardingCourses ROLE_CHOICES).
  if (v.audience === "partner" && v.selfRole === "principal") return "owner";
  if (v.audience === "partner" && v.selfRole === "supplier") return "partner";
  if (v.role === "org_admin" && v.audience === "partner") return "owner";
  return GUIDE_ROLES.find((r) => r.value === v.audience)?.value ?? null;
}
export const GUIDE_GOALS = [
  { value: "grow", label: "Grow the business" },
  { value: "money", label: "Money and getting paid" },
  { value: "quality", label: "Quality and safety" },
  { value: "clients", label: "Client experience" },
  { value: "start", label: "Getting started" },
  { value: "compliance", label: "Rules and compliance" },
] as const;
export type GuideGoal = (typeof GUIDE_GOALS)[number]["value"];
export type GuideTags = { roles: GuideRole[]; goals: GuideGoal[] };

/** The words that suggest each goal, for a guide (or eLearning course) its author hasn't tagged yet. */
const GOAL_WORDS: Record<GuideGoal, RegExp> = {
  grow: /\b(grow|growth|growing|hir(e|ing)|business|margin|capacity|referr\w*|marketing|scal(e|ing)|new clients?)\b/i,
  money: /\b(invoic|paid|pay(ment)?s?|pricing|price|rates?|budget|money|cash|fees?|funding)/i,
  quality: /\b(safe|safety|incident|risk|sirs|quality|scope|harm|falls?|hurt)/i,
  clients: /\b(client|journey|family|families|conversation|person|people we support|choice)/i,
  start: /\b(first (shift|steps?|week|visit|days?|month)|onboard|induction|getting started|new partner|welcome)/i,
  compliance: /\b(complian|agreement|policy|rules?|standards?|legislation|act\b|audit)/i,
};
const OWNER_BLOCKS = new Set<string>(["hiring", "sandbox", "budget"]);

/**
  A guide's browsing tags: the author's when they've set any, else worked out from who it's for, its blocks and its
  words, so content written before tags existed still browses sensibly.
*/
export function guideTags(doc: GuideDoc | null, audience: readonly string[], title: string): GuideTags {
  const set = doc?.tags;
  // Its title and standfirst, and the titles of its pages and sections: what it says it's about.
  const words = [title, ...(doc?.pages ?? []).flatMap((p) => [p.title, ...p.sections.map((s) => s.title ?? "")])].join(" ");
  const blocks = doc ? allBlocks(doc).map((b) => b.type as string) : [];
  const roles: GuideRole[] = set?.roles.length
    ? set.roles
    : [
        ...(audience.includes("partner") ? (["partner"] as const) : []),
        ...(audience.includes("coordinator") ? (["coordinator"] as const) : []),
        ...(blocks.some((t) => OWNER_BLOCKS.has(t)) || /\b(business owner|hir(e|ing)|margin)\b/i.test(words) ? (["owner"] as const) : []),
        ...(audience.includes("staff") ? (["staff"] as const) : []),
      ];
  const goals: GuideGoal[] = set?.goals.length
    ? set.goals
    : [
        ...new Set<GuideGoal>([
          ...(blocks.some((t) => OWNER_BLOCKS.has(t)) ? (["grow", "money"] as const) : []),
          ...(Object.keys(GOAL_WORDS) as GuideGoal[]).filter((g) => GOAL_WORDS[g].test(words)),
        ]),
      ];
  return { roles, goals };
}
const cleanTags = (v: unknown): GuideTags | undefined => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!o) return undefined;
  const pick = <T extends string>(x: unknown, all: readonly { value: T }[]) =>
    Array.isArray(x) ? [...new Set(x.filter((s): s is T => all.some((a) => a.value === s)))] : [];
  const roles = pick(o.roles, GUIDE_ROLES);
  const goals = pick(o.goals, GUIDE_GOALS);
  return roles.length || goals.length ? { roles, goals } : undefined;
};

export type GuideFormat = "course" | "simulation" | "guide";
export function guideFormat(doc: GuideDoc): GuideFormat {
  if (doc.pages.length > 1) return "course";
  const sims = new Set<string>(SIMULATION_BLOCKS);
  return allBlocks(doc).some((b) => sims.has(b.type)) ? "simulation" : "guide";
}

/**
  How a course counts as done. Opening pages, moving between them or reaching the bottom never does.
  reference: nothing to complete; they can mark it read. confirm: they finish each required page.
  decision: the questions on each required page answered, then the page finished. assessed: required
  pages finished and the linked learning path's quiz passed. Optional pages never hold completion up.
*/
export const COMPLETION_MODES = {
  reference: "Reference",
  confirm: "Read and confirm",
  decision: "Decision activity",
  assessed: "Assessed",
} as const;
export type CompletionMode = keyof typeof COMPLETION_MODES;

/** Where a claim came from, for authors and reviewers. Learners don't see it. */
export type Evidence = { source: string; ref?: string; quote?: string };
/**
  An author's flag on a block. "verify": a claim without enough support (blocks publishing until it's
  resolved). "illustrative": a made-up example or linking copy, marked so reviewers know.
*/
export type Flag = { kind: "verify" | "illustrative"; note: string };

/**
  How a block comes into view as the reader scrolls to it. Rise is the default, so it isn't stored; "none" keeps it still.
  Readers who ask their device for less motion never see it.
*/
export const REVEALS = { rise: "Rise", fade: "Fade", slide: "Slide in", zoom: "Zoom", none: "None" } as const;
export type Reveal = keyof typeof REVEALS;
/**
  “Why this block?”: why the AI builder chose a block (lib/activityCatalogue), for the author and reviewers to read and
  change. The behaviour it practises, what informed the choice, the option it was weighed against, what the learner does
  and what will be measured. Learners never see it.
*/
export type BlockWhy = {
  behaviour: string;
  evidence: string;
  alternative: string;
  rationale: string;
  learnerAction: string;
  signal: string;
  owner?: string;
  source?: string;
};
export const WHY_FIELDS: [keyof BlockWhy, string][] = [
  ["behaviour", "Behaviour it practises"],
  ["rationale", "Why this activity fits"],
  ["evidence", "What informed the choice"],
  ["alternative", "Option considered instead"],
  ["learnerAction", "What the learner does"],
  ["signal", "What will be measured or observed"],
  ["owner", "Review owner"],
  ["source", "Source"],
];
/** `aiWhy`: the AI builder's “Why this block?” (BlockWhy). Named apart from the Job Aid block's `why` and the notes deck's `selection`. */
type Base = { id: string; note?: string; evidence?: Evidence[]; flag?: Flag; reveal?: Exclude<Reveal, "rise">; aiWhy?: BlockWhy };
/**
  `position`: which part of the picture shows when it's cropped to its frame (a wide strip, a circle), as
  "x% y%" (CSS object-position). The author drags the picture to choose it; centred when not set.
*/
export type Media = { src: string; alt: string; decorative?: boolean; caption?: string; position?: string };

const POSITION = /^(\d{1,3}(?:\.\d)?)% (\d{1,3}(?:\.\d)?)%$/;
/** A picture's position as [x, y] percentages, centred when it has none (or a bad one). */
export function picturePosition(p: string | undefined): [number, number] {
  const m = p ? POSITION.exec(p) : null;
  return m ? [Math.min(100, Number(m[1])), Math.min(100, Number(m[2]))] : [50, 50];
}
export const positionText = (x: number, y: number) =>
  `${Math.round(Math.min(100, Math.max(0, x)) * 10) / 10}% ${Math.round(Math.min(100, Math.max(0, y)) * 10) / 10}%`;
export type Width = "column" | "wide" | "full";

export type TextBlock = Base & { type: "text"; heading?: string; level?: 2 | 3; body: string };
/**
  The frame a picture is cropped to (its `position` says which part shows). No frame: the whole picture, at its own shape.
*/
export type Frame = "landscape" | "wide" | "square";
export const FRAMES: { value: Frame | undefined; label: string; aspect: string }[] = [
  { value: undefined, label: "Original", aspect: "" },
  { value: "landscape", label: "Landscape", aspect: "aspect-[16/9]" },
  { value: "wide", label: "Wide", aspect: "aspect-[320/117]" },
  { value: "square", label: "Square", aspect: "aspect-square" },
];
/** The classes that crop a picture to its frame (none for the whole picture). */
export const frameClass = (f: Frame | undefined) => (f ? `${FRAMES.find((x) => x.value === f)!.aspect} object-cover` : "");
const frameOf = (v: unknown): Frame | undefined => (v === "landscape" || v === "wide" || v === "square" ? v : undefined);

export type ImageBlock = Base & { type: "image"; media: Media; width: Width; enlarge?: boolean; frame?: Frame };
/**
  A video on YouTube, Vimeo or Loom, played in their own player. `hash`: the private part of an unlisted Vimeo
  link. `portrait`: a YouTube Short.
*/
export type VideoEmbed = { provider: "youtube" | "vimeo" | "loom"; id: string; hash?: string; portrait?: boolean };
/**
  A video: uploaded to the Hub (`src`, with a WebVTT captions file), or on YouTube, Vimeo or Loom (`embed`,
  whose captions live on that site: `captionsOnPlayer` is the author confirming they're there).
  `trim`: the part that plays, in seconds (the file itself isn't cut). `recording`: made in the Magazine's
  recording studio: how, when, how long, and the author confirming everyone and everything shown may be shared.
*/
export type VideoRecording = { mode: "camera" | "screen"; at: string; seconds: number; consent: boolean };
export type VideoBlock = Base & {
  type: "video";
  title: string;
  src: string;
  embed?: VideoEmbed;
  captionsOnPlayer?: boolean;
  poster?: string;
  captions?: string;
  transcript: string;
  caption?: string;
  trim?: { start: number; end: number };
  recording?: VideoRecording;
};
/** A video's own settings, without a block's id and type: for a video inside another block. */
export type VideoFields = Omit<VideoBlock, keyof Base | "type">;
/**
  Text with a picture, or with a video (`video`, set up just like a video block). By default the media
  sits on its side and the text flows around it and on below it, like a magazine; `wrap: false` puts them
  side by side instead. On a phone the media always sits above the text.
*/
export type TextMediaBlock = Base & {
  type: "textMedia";
  heading?: string;
  body: string;
  media: Media;
  video?: VideoFields;
  /** Readers can open the picture full size (for detail like a document). */
  enlarge?: boolean;
  /** The frame the picture is cropped to; the whole picture when not set. */
  frame?: Frame;
  layout: "media-left" | "media-right";
  wrap?: false;
};
/** A text-and-media block's video as a video block (same id), for the video player and its editor. */
export const videoOf = (b: TextMediaBlock): VideoBlock | null => (b.video ? { ...b.video, id: b.id, type: "video" } : null);

/**
  Set apart: something important, an example or a tip. `confirm`: a tick box the reader ticks to confirm
  it (an acknowledgement, say), with these words. It counts as an activity, and the tick is recorded.
*/
export type CalloutBlock = Base & {
  type: "callout";
  style: "important" | "example" | "tip";
  label?: string;
  body: string;
  link?: { href: string; label: string };
  confirm?: string;
  /** An optional picture, shown as a vertical strip down the callout's right side (a band across the top on a phone). */
  media?: Media;
};
export type Verdict = "best" | "acceptable" | "risky";
/** An optional photo in a circle beside the question (a person, say), as on a decision question. */
export type WithPhoto = { media?: Media };
/** The blocks that can have that photo (the decision question can also have it wide across the top). */
export const PHOTO_BLOCKS = ["decision", "sequencing", "poll", "wall", "reflection", "conversation"] as const;
export type Choice = { id: string; text: string; verdict: Verdict; feedback: string };
/**
  "What would you do?", with feedback on each answer. `media`: an optional picture, in a circle beside the
  question (a person, say), or `mediaStyle: "wide"` across the top to set the scene.
*/
export type DecisionBlock = Base & {
  type: "decision";
  prompt: string;
  context?: string;
  choices: Choice[];
  source?: { label: string; href?: string };
  media?: Media;
  mediaStyle?: "wide";
};
export type QuizBlock = Base & { type: "quiz"; pathId: string; intro?: string };
export type ChecklistBlock = Base & { type: "checklist"; title: string; items: string[]; resource?: { href: string; label: string } };
/** Text in folds: each item a title the reader opens to see its text. For detail some readers need and others skip. */
/** A fold's picture sits above its text, below it, or on the right with the text flowing round it. */
export type FoldPlacement = "above" | "below" | "right";
export type AccordionItem = { id: string; title: string; body: string; media?: Media; placement?: FoldPlacement };
export type AccordionBlock = Base & { type: "accordion"; heading?: string; items: AccordionItem[] };
/** Pictures to step through one at a time, each with its description and caption. Never moves by itself. */
export type CarouselSlide = { id: string; media: Media };
export type CarouselBlock = Base & { type: "carousel"; slides: CarouselSlide[]; width: "column" | "wide" };

/** Cards to flip: a prompt on the front (with an optional picture), the answer on the back. */
export type FlashcardsBlock = Base & { type: "flashcards"; cards: { id: string; front: string; back: string; media?: Media }[] };
/** Sections side by side, one shown at a time: for comparing options. */
export type TabsBlock = Base & { type: "tabs"; tabs: { id: string; label: string; body: string }[] };
/** Events in order, each with when it happens. */
export type TimelineBlock = Base & { type: "timeline"; events: { id: string; when: string; title: string; body: string }[] };
/** A workflow, one step at a time. */
export type ProcessBlock = Base & { type: "process"; steps: { id: string; title: string; body: string }[] };
export type BranchOutcome = "good" | "mixed" | "poor";
/**
  A scene of a branching scenario: what happens, then choices that lead to other scenes; or an ending
  with how it turned out. The first scene is where it starts.
*/
export type BranchScene = {
  id: string;
  text: string;
  choices: { id: string; text: string; next: string }[];
  ending?: { outcome: BranchOutcome; summary: string };
};
export type BranchingBlock = Base & { type: "branching"; title: string; scenes: BranchScene[] };
/**
  A practice conversation: at each turn the other person says something, the learner picks a response,
  and sees coaching and how the person replies. Bounded choices, not an open chat.
*/
export type ConversationTurn = { id: string; line: string; responses: { id: string; text: string; verdict: Verdict; feedback: string; reply: string }[] };
export type ConversationBlock = Base & {
  type: "conversation";
  person: string;
  role: string;
  setting: string;
  turns: ConversationTurn[];
  /**
    Free conversation (lib/roleplay): the learner types or speaks a reply and the character answers. When
    set, this is what learners get; the turns above stay as the version to fall back to if it can't run.
  */
  roleplay?: Roleplay;
} & WithPhoto;
/** A picture or document with mistakes to find, each at a point on it (x, y as percentages). */
export type SpotBlock = Base & {
  type: "spot";
  prompt: string;
  media: Media;
  mistakes: { id: string; x: number; y: number; label: string; explanation: string }[];
};
/** "How confident are you…?" on a 1 to 5 scale. `compareWith`: an earlier check, to show the change. */
export type ConfidenceBlock = Base & { type: "confidence"; statement: string; low: string; high: string; compareWith?: string };
/** An open question the learner answers in their own words; Claude gives feedback using the author's guidance. */
export type ReflectionBlock = Base & { type: "reflection"; prompt: string; guidance: string; minWords: number } & WithPhoto;
/** An insight wall, as in Topics: everyone answers the same question, and the shared answers open once you've posted. */
/** A picture with points to open: each shows a title and a note. For exploring a screen, a form or a room. */
export type HotspotsBlock = Base & {
  type: "hotspots";
  prompt: string;
  media: Media;
  spots: { id: string; x: number; y: number; title: string; body: string }[];
};
/** Sort items into groups, then check: each item can say why it belongs where it does. */
export type SortingBlock = Base & {
  type: "sorting";
  prompt: string;
  groups: { id: string; label: string }[];
  items: { id: string; text: string; group: string; feedback: string }[];
};
/** Put steps in order, then check. `steps` is the right order; readers get them shuffled. */
export type SequencingBlock = Base & { type: "sequencing"; prompt: string; steps: { id: string; text: string }[]; feedback: string } & WithPhoto;
/** Match each item on the left to one on the right, then check. */
export type MatchingBlock = Base & { type: "matching"; prompt: string; pairs: { id: string; left: string; right: string }[]; feedback: string };
/** Text with gaps to fill: each [[answer|another accepted answer]] is a gap. */
export type FillBlankBlock = Base & { type: "fillblank"; prompt: string; text: string; feedback: string };
/** A poll, as in Topics: one vote each (it can be changed), and everyone's answers shown back once you've voted. */
export type PollBlock = Base & { type: "poll"; question: string; options: { id: string; text: string }[] } & WithPhoto;
export type WallBlock = Base & { type: "wall"; prompt: string; placeholder?: string; anonymous?: boolean } & WithPhoto;
/** A fictional care budget: learners change services' frequency and cost and watch the balance. */
export type BudgetService = { id: string; name: string; unit: string; cost: number; perWeek: number; max: number };
/**
  With `utilisation` it reads as a utilisation calculator (the owner, Nov 2026): how much of the budget the plan uses, what
  would be left unspent, and, with `carryover`, how much of that carries over to the next quarter and how much wouldn't.
*/
export type BudgetBlock = Base & {
  type: "budget";
  title: string;
  budget: number;
  weeks: number;
  services: BudgetService[];
  utilisation?: boolean;
  /** Dollars of unspent budget that carry over (Support at Home: up to $1,000 or 10% of the quarterly budget, whichever is greater). */
  carryover?: number;
};

/*
  Reflect and apply (docs/magazine-reflect-apply.md): four unscored blocks. A learner's entries are private
  to them (server/magazineNotes), are never graded, and never complete a page unless the author asks for a
  response, in which case writing or "prefer not to write" both count.
*/
/**
  A private note on a prompt. With `revisits` it's a later look at an earlier journal: the learner sees what
  they wrote then and adds a dated follow-up, without changing the original.
*/
export type JournalBlock = Base & {
  type: "journal";
  prompt: string;
  /** A way in, shown under the prompt ("What would you ask first?"). */
  scaffold?: string;
  /** About how long it takes, in minutes. */
  minutes?: number;
  required?: boolean;
  revisits?: string;
};
/** A defensible way of seeing a case: its reasoning, and what it might miss. Never ranked, never "the answer". */
export type PerspectiveView = { id: string; title: string; reasoning: string; misses: string };
/**
  Two or three curated viewpoints, opened by the learner (after their own response when `after` names a
  journal, decision, pulse or action block). What the approved guidance says is shown apart from the opinions.
*/
export type PerspectivesBlock = Base & {
  type: "perspectives";
  prompt: string;
  after?: string;
  views: PerspectiveView[];
  guidance?: { body: string; source?: { label: string; href?: string }; reviewedBy?: string; reviewedOn?: string };
};
/**
  One tap: confidence or a viewpoint, never a scored answer. `compareWith` pairs it with an earlier pulse
  that asks the same thing with the same labels, to show the learner how their own view changed.
*/
export type PulseBlock = Base & {
  type: "pulse";
  question: string;
  kind: "confidence" | "view";
  options: { id: string; label: string }[];
  compareWith?: string;
};
/**
  One concrete action to try at work: a suggestion or their own. With `revisits` it asks later whether they
  tried the earlier one (tried it, not yet, adjusted my plan) with an optional private reflection.
*/
export type ActionBlock = Base & {
  type: "action";
  prompt: string;
  suggestions: { id: string; text: string }[];
  /** Learners can write their own action (on unless set to false). */
  allowOwn?: false;
  /** When it's worth trying ("On your next invoice review"). */
  timing?: string;
  required?: boolean;
  revisits?: string;
};
export const PULSE_DEFAULTS = {
  confidence: ["Not confident", "Unsure", "Somewhat confident", "Confident"],
  view: ["", "", ""],
} as const;
export const ACTION_STATUSES = { tried: "Tried it", not_yet: "Not yet", adjusted: "Adjusted my plan" } as const;
export type ActionStatus = keyof typeof ACTION_STATUSES;
/*
  The AI Learning Guide (lib/magazineGuide): a recorded, scripted segment from the Hub's one AI guide. The
  script is the content; the video or audio is made from it, must match it, and is watched through before
  learners get it. Never an activity: playing it finishes nothing.
*/
export type GuideMedia = {
  kind: "video" | "audio";
  /** Uploaded to the Hub. */
  src: string;
  poster?: string;
  /** A WebVTT captions file (video). */
  captions?: string;
  seconds?: number;
  /** The script it was made from: out of date when the script's words change. */
  scriptHash: string;
  /** Someone watched it all the way through against the script. */
  checked?: { by: string; at: string };
  producedBy?: string;
  /** The provider's reference for the render, when there is one. */
  providerRef?: string;
};
/**
  One of Ava's transmissions in the page's content: a video made elsewhere (ElevenLabs, with the Laura avatar), uploaded
  in the editor with what she says. The video and its words are kept as one of her lines (server/ava.ts, the key
  `magazine:<guideId>:block:<blockId>`), exactly like the one at the top of a page, so it plays in the same window with
  her words highlighted. `title`: what the transmission is about, for its window and screen readers. Never an activity.
*/
export type AvaBlock = Base & { type: "ava"; title?: string };
export type GuideBlock = Base & {
  type: "guide";
  mode: GuideMode;
  purpose: GuidePurpose;
  /** What the guide says: the approved, learner-facing transcript. */
  script: string;
  /** One prompt or takeaway shown on screen. */
  screenText?: string;
  /** A short label in the frame ("Case 03"). */
  caseLabel?: string;
  /** Voice over context: what the learner looks at while the guide speaks. */
  context?: Media;
  status: "draft" | "approved";
  approved?: { by: string; at: string; hash: string };
  owner?: string;
  source?: { label: string; href?: string };
  /** Shown as "Content reviewed by …" only when this review exists. */
  reviewed?: { by: string; on: string };
  pronunciation?: string;
  /** A decision this is feedback on: shown once the learner has answered it. */
  after?: string;
  media?: GuideMedia;
};

export const REFLECT_TYPES = ["journal", "perspectives", "pulse", "action"] as const;

export type Block =
  | TextBlock
  | AccordionBlock
  | ImageBlock
  | CarouselBlock
  | VideoBlock
  | TextMediaBlock
  | CalloutBlock
  | DecisionBlock
  | QuizBlock
  | ChecklistBlock
  | FlashcardsBlock
  | TabsBlock
  | TimelineBlock
  | ProcessBlock
  | BranchingBlock
  | ConversationBlock
  | SpotBlock
  | ConfidenceBlock
  | ReflectionBlock
  | BudgetBlock
  | WallBlock
  | PollBlock
  | HotspotsBlock
  | SortingBlock
  | SequencingBlock
  | MatchingBlock
  | FillBlankBlock
  | JournalBlock
  | PerspectivesBlock
  | PulseBlock
  | ActionBlock
  | GuideBlock
  | AvaBlock
  | SignalBlock
  | MissionBlock
  | BalanceBlock
  | XRayBlock
  | ResetBlock
  | LineBlock
  | BridgeBlock
  | JourneyBlock
  | BenchmarkBlock
  | MythBlock
  | BatonBlock
  | RedPenBlock
  | NotesDeckBlock
  | PlaybookBlock
  | AuditorBlock
  | PhoneCallBlock
  | SandboxBlock
  | HiringBlock
  | OneDayBlock
  | IntakeBlock
  | WorkloadBlock
  | CoverageBlock
  | ReferralBlock
  | ReliabilityBlock
  | CashBridgeBlock
  | CaseThreadBlock
  | BudgetLabBlock
  | HazardScanBlock
  | DischargeBlock
  | NetworkBlock
  | TrustCheckBlock
  | ReferralStudioBlock
  | ShadowCoachBlock
  | HubVisualBlock;
/** Spot the Signal (lib/signal): three updates about one fictional client, read for a pattern, then triage, a provisional assessment and a handover. */
export type SignalBlock = Base & { type: "signal" } & SignalBlockData;
/** First 30 Days Mission Board (lib/mission): a fictional participant's first month, as a board of tasks, dated events and a close-the-loop step. */
export type MissionBlock = Base & { type: "mission" } & MissionBlockData;
/** Dignity of Risk and Duty of Care Balance Scale (lib/balance): a plan built around a person's choice that carries risk, checked against authored criteria. */
export type BalanceBlock = Base & { type: "balance" } & BalanceBlockData;
/** Invoice X-Ray (lib/xray): a fictional quote or receipt sorted line by line into four outcomes, with the split and an explanation. */
export type XRayBlock = Base & { type: "xray" } & XRayBlockData;
/** The Expectation Reset (lib/reset): an illustrative waiting-period timeline with markers that open a reviewed script and moderated peer approaches from the Community. */
export type ResetBlock = Base & { type: "reset" } & ResetBlockData;
/** "Where Is the Line?" (lib/line): self-managed requests sorted into the participant's choice, check first, or cannot authorise as requested. */
export type LineBlock = Base & { type: "line" } & LineBlockData;
/** "While You Wait" (lib/bridge): a fictional waiting-period scenario comparing CHSP, a private quote and the funded Support at Home picture, and a family summary. */
export type BridgeBlock = Base & { type: "bridge" } & BridgeBlockData;
/** The SaH Journey (lib/journey): an illustrative journey from four points of view, with decision points along the way. */
export type JourneyBlock = Base & { type: "journey" } & JourneyBlockData;
/** Peer benchmark poll (lib/benchmark): lock a decision on a fictional case, then see disclosure-checked peer results beside the reviewed perspective. */
export type BenchmarkBlock = Base & { type: "benchmark" } & BenchmarkBlockData;
/** Myth vs Reality tiles (lib/myths): client questions from the canonical tile library, each with an approved, copy-only reply. */
export type MythBlock = Base & { type: "myths" } & MythBlockData;
/** Pass the Baton (lib/baton): a role-handoff relay through a fictional participant's journey. */
export type BatonBlock = Base & { type: "baton" } & BatonBlockData;
/** Red Pen (lib/redpen): critique and rewrite a flawed care plan goal or progress note from a fictional case. */
export type RedPenBlock = Base & { type: "redpen" } & RedPenBlockData;
/** Notes to a Younger Me (lib/notes): a deck of mentor cards from the reviewed note library. */
export type NotesDeckBlock = Base & { type: "mentor" } & NotesDeckData;
/** Live SOP-to-Playbook (lib/playbook): a procedure resolved from the playbook library to its current approved release. */
export type PlaybookBlock = Base & { type: "playbook" } & PlaybookBlockData;
/**
  Document Auditor and Contractor Vetting Card (lib/auditor, lib/auditorVetting): a fictional contractor pack or invoice,
  inspected and marked, then one of four proportionate outcomes (ready for engagement review, request evidence,
  escalate, cannot engage as proposed). Older blocks' Approve, Query and Reject are read as the new codes.
*/
export type AuditorBlock = Base & { type: "auditor" } & AuditorBlockData;
/** Tough Phone Call (lib/phonecall): a telephone preset of the conversational roleplay, with case tools, a privacy gate and a 0 to 3 debrief. */
export type PhoneCallBlock = Base & { type: "phonecall" } & PhoneCallData;
/** Budget Sandbox (lib/sandbox): a Support at Home care plan built with a fictional participant, its quarterly ledger, and an explanation to them. */
export type SandboxBlock = Base & { type: "sandbox" } & SandboxBlockData;
/** Hiring Runway Decision Lab (lib/hiringRunway): a fictional Care Partner business's hiring decision, compared across capacity, operating result and cash, then revised after new information. */
export type HiringBlock = Base & { type: "hiring" } & HiringLabData;
/** One Day, Five Perspectives (lib/oneDay): a fictional coordinator's working day in five lanes, with role lenses kept apart from what the coordinator knows, commitments and a deterministic debrief. */
export type OneDayBlock = Base & { type: "onedaymap" } & OneDayData;
/** Growth readiness: can a Care Partner take on the next starts (docs/growth-readiness.md). */
export type IntakeBlock = Base & { type: "intake" } & IntakeLabData;
/** The Workload Lens: where a coordinator's week goes, before deciding what to change (docs/workload-lens.md). */
export type WorkloadBlock = Base & { type: "workload" } & WorkloadLabData;
/** Local Coverage Comparison: is a suburb ready for growth, by service, place and time window (docs/suburb-growth.md). */
export type CoverageBlock = Base & { type: "coverage" } & CoverageLabData;
/** Referral Journey Calculator: which referrals become active clients, by arrival cohort and stage (docs/referral-journey.md). */
export type ReferralBlock = Base & { type: "referral" } & ReferralLabData;
/** Service Reliability Calculator: what a missed service costs in care, workload and money, and whether reliability comes before more leads (docs/service-reliability.md). */
export type ReliabilityBlock = Base & { type: "reliability" } & ReliabilityLabData;
/** 90-Day Cash Bridge: can a partner business fund the next 90 days, read date by date (docs/cash-bridge.md). */
export type CashBridgeBlock = Base & { type: "cashbridge" } & CashBridgeLabData;
/** "What Would You Do?" Community Case Thread: a private first take, then one canonical moderated discussion shared with the Community page (docs/case-threads.md). */
export type CaseThreadBlock = Base & { type: "casethread" } & CaseThreadData;
/** Quarterly Budget Decision Lab: a fictional participant late in a Support at Home quarter, current versus projected, and a plan she agrees with (docs/budget-decision-lab.md). */
export type BudgetLabBlock = Base & { type: "budgetlab" } & BudgetLabData;
/** Spot the Hazard: a drawn room to scan, with approved variants chosen per attempt on the server (docs/spot-the-hazard.md). */
export type HazardScanBlock = Base & { type: "hazardscan" } & HazardScanData;
/** The 72-Hour Discharge Pivot: a time-aware triage simulation of a participant's return home from hospital, replayed on the server (docs/discharge-pivot.md). */
export type DischargeBlock = Base & { type: "discharge" } & DischargeData;
/** Build Your Local Bench: the Contractor Network Builder's fictional early-morning gap, replayed on the server (docs/network-builder.md). */
export type NetworkBlock = Base & { type: "network" } & NetworkData;
/** The 28-Day Trust Check: a fictional service-recovery case (Mrs Patel's Week 8), replayed on the server (docs/trust-check.md). */
export type TrustCheckBlock = Base & { type: "trustcheck" } & TrustData;
/** Local Referral Studio: pitch and objection practice with a fictional referrer, on the Tough Family Call's engine (docs/local-referral-studio.md). */
export type ReferralStudioBlock = Base & { type: "referralstudio" } & StudioData;
/** First 100 Days: Shadow & Coach: a manager calibrates on a fictional new coordinator's work, replayed on the server (docs/shadow-and-coach.md). */
export type ShadowCoachBlock = Base & { type: "shadowcoach" } & ShadowData;
/**
  One of the Hub's own reviewed diagrams, placed in an article so it can be explained around: the client journey map
  (its feeling curve and road), or a partner model's who-does-what onboarding diagram. The diagram's content lives
  with the diagram (content/journey.ts, content/partnerOnboarding.ts), so every article showing it stays current.
*/
export const HUB_VISUALS = {
  "client-journey": "The client journey map, from enquiry to exit",
  "onboarding-p1": "Partner onboarding: referring partner (P1)",
  "onboarding-brokered": "Partner onboarding: brokered partner",
  "onboarding-coordinator": "Partner onboarding: coordinator managed",
} as const;
export type HubVisualKind = keyof typeof HUB_VISUALS;
export type HubVisualBlock = Base & { type: "hubvisual"; visual: HubVisualKind; caption?: string };
export type BlockType = Block["type"];
export type Section = { id: string; title: string; blocks: Block[] };
/** A chapter marker on the page that starts it: its title, and an optional short introduction. */
export type PageChapter = { title: string; intro?: string };
/**
  A page of the course: an article with a purpose and a teaching pattern, or an assessment page that
  holds the Hub's quiz. Required pages count towards completion; optional ones don't.
*/
export type Page = {
  id: string;
  title: string;
  purpose: string;
  template: PageTemplate;
  kind: "content" | "assessment";
  required: boolean;
  /**
    Readers work through every activity on the page before they can finish it or move on (on unless
    `false`). What counts for each kind of block is in activityDone.
  */
  allActivities?: false;
  /**
    Makes sense read by itself (docs/discovery-paths.md): learners can save this page to a personal
    Discovery Path and it can be suggested for a goal. Off, only the whole course is offered.
  */
  standalone?: true;
  /**
    This page starts a chapter (lib/magazineChapters): the chapter runs to the page before the next one that starts a
    chapter. A course with no chapter markers has no chapters, and reads as before.
  */
  chapter?: PageChapter;
  hero?: Media;
  /** The page's spoken introduction (Audio Guide). */
  narration?: Narration;
  /** Ava Relay on this page (lib/relayConfig): why she's here, what she may talk about and what she holds back. */
  relay?: RelayPage;
  sections: Section[];
};
/*
  The Audio Guide (docs/magazine-audio-guide.md): a short spoken introduction to the course and to each
  page. Kept in the document, so each edition keeps its own narration.
*/
export type NarrationLength = "short" | "standard" | "extended" | "editorial";
/** What the page (or course) said when its script was approved: for noticing it has moved on. */
export type NarrationSnapshot = { hash: string; key: string; sig: number[] };
export type NarrationAudio = {
  /** An MP3 uploaded to the hub. */
  src: string;
  seconds: number;
  /** Each word's place in the script and in the recording, for following along. */
  words: { from: number; to: number; start: number; end: number }[] | null;
  /** The script it was recorded from, and the voice ("topic" for the Topic narrator, "profile:<id>" for a voice profile, else a voice id). */
  scriptHash: string;
  voice: string;
  at: string;
  /** Who made it (Audio Introductions, Nov 2026): "openai", "elevenlabs" or "upload". Absent on earlier recordings. */
  provider?: string;
  /** The voice profile it was made with ("editorial": the Magazine Editorial Voice), when there was one. */
  profile?: string;
  /** The speech model, e.g. gpt-4o-mini-tts. */
  model?: string;
  /** What it cost to make, in US dollars, estimated from its characters and the model's price (lib/magazineNarration). */
  cost?: number;
  /** Made but not yet approved by the author: learners never hear it. Absent means approved (every earlier recording). */
  pending?: true;
};
export type Narration = {
  script: string;
  status: "draft" | "approved";
  basis?: NarrationSnapshot;
  audio?: NarrationAudio;
  /** Warnings from the checks when it was written (a figure to confirm, a possible give-away). */
  checks?: string[];
  /** The script's version: 1 for the first, one more each time a new script replaces it. */
  version?: number;
  /** Who approved the introduction for publication, and when. */
  approvedBy?: string;
  approvedAt?: string;
  /** The author turned the published introduction off: learners don't get the player. */
  hidden?: true;
  /**
    A replacement in progress (a new script, new audio or both) while this one stays what learners hear. Approving it
    for publication puts it in this one's place. Never sent to learners.
  */
  next?: Omit<Narration, "next" | "hidden">;
};
export type GuideAudio = {
  levels: { course: boolean; pages: boolean; blocks: boolean };
  /** A voice profile (the Magazine Editorial Voice), the hub's Topic narrator, another ElevenLabs voice, or one of OpenAI's voices. */
  voice: { kind: "profile"; id: "editorial" } | { kind: "topic" } | { kind: "custom"; voiceId: string; name: string } | { kind: "openai"; voice: string };
  length: NarrationLength;
  /**
    Introductions never play by themselves (Audio Introductions, Nov 2026): learners press Play. What's left of this
    setting is the Audio guide switch, which starts Ava's transmissions without sound when it's off.
    "press-play": no switch (the default). "auto": the switch, starting on. "offer-auto": the switch, starting off.
  */
  playback: "auto" | "offer-auto" | "press-play";
  /** The course introduction. */
  intro?: Narration;
};
/*
  Self-review ("Test myself", lib/magazineReview): practice questions learners can try while reading. Kept in
  the document, so each edition keeps the questions it was published with. Never part of completion.
*/
export type PracticeChoice = { id: string; text: string; feedback?: string };
export type PracticeItem = {
  id: string;
  /** "scenario": the best response to a situation. "spot": which detail in a short example needs attention. */
  kind: "scenario" | "spot";
  /** The page it's about, and the section "See this in the course" opens. */
  pageId: string;
  sectionId?: string;
  prompt: string;
  /** For "spot": the short (fictional) example the issue is in. */
  example?: string;
  choices: PracticeChoice[];
  /** The best answer's choice id. */
  answer: string;
  /** Why the best answer is right, and what's behind the most tempting wrong one. */
  explanation: string;
  /** Only approved questions are served; a retired one never is, but stays on record. */
  status: "draft" | "approved" | "retired";
  /** The page as it was when the question was approved, to notice it has changed since. */
  basis?: NarrationSnapshot;
  /** Who approved which version, when. Editing it afterwards makes it a draft again. */
  approved?: { by: string; at: string; version: string };
  /** Where it came from: written by an author, or drafted by AI from the page and the course's sources. */
  origin?: { kind: "author" | "ai"; by: string; at: string; note?: string };
  /** The source document (and place in it) the answer rests on, if any. */
  source?: string;
};
export type SelfReview = { enabled: boolean; items: PracticeItem[] };
export type GuideDoc = {
  schema: typeof GUIDE_SCHEMA;
  pages: Page[];
  audio?: GuideAudio;
  review?: SelfReview;
  relay?: RelayCourse;
  /** Browsing tags set by the author (roles and goals); see guideTags. */
  tags?: GuideTags;
};

/**
  Whether the reader has worked through a block: null for blocks that are only read (text, pictures,
  callouts, a timeline). Decisions and confidence checks count once answered, a quiz once passed, and
  everything else once the reader has done it, recorded as `done:<block id>` among their answers.
*/
export function activityDone(b: Block, answers: Record<string, string>, quizzes: Record<string, { passed: boolean } | null> = {}): boolean | null {
  switch (b.type) {
    case "text":
    case "image":
      return null;
    case "textMedia":
      // Its video counts like a video block's: once watched, when it's uploaded to the Hub.
      if (!b.video || b.video.embed || !b.video.src) return null;
      break;
    case "callout":
      // Done once the reader ticks to confirm it, when it asks them to.
      if (!b.confirm) return null;
      break;
    case "timeline":
      return null;
    case "decision":
    case "confidence":
      return Boolean(answers[b.id]);
    case "quiz":
      return Boolean(quizzes[b.id]?.passed);
    case "video":
      // A video on another site can't say it's been watched.
      if (b.embed || !b.src) return null;
      break;
    case "carousel":
      if (b.slides.filter((sl) => sl.media.src).length < 2) return null;
      break;
    case "accordion":
    case "checklist":
      if (!b.items.length) return null;
      break;
    // Reflect and apply: never an activity to finish, unless the author asks for a response (writing, or
    // choosing not to, both count).
    case "perspectives":
    case "pulse":
    // The AI Learning Guide, and Ava's transmissions: playing (or not playing) a recording finishes nothing.
    case "guide":
    case "ava":
      return null;
    // A Live SOP playbook is reference: reading it, or not, finishes nothing (docs/live-playbooks.md).
    case "playbook":
      return null;
    case "journal":
    case "action":
      if (!b.required) return null;
      break;
  }
  return answers[`done:${b.id}`] === "1";
}

/** The activities on a page still to work through, when the page asks for all of them. */
export function openActivities(page: Page, answers: Record<string, string>, quizzes: Record<string, { passed: boolean } | null> = {}) {
  if (page.allActivities === false) return [];
  return pageBlocks(page).filter((b) => activityDone(b, answers, quizzes) === false);
}

/** The confidence scale's faces, from 1 (worried) to 5 (beaming). Ratings are still saved as 1 to 5. */
export const CONFIDENCE_FACES = ["😟", "🙁", "😐", "🙂", "😄"] as const;
export const confidenceFace = (n: number) => CONFIDENCE_FACES[Math.min(5, Math.max(1, Math.round(n))) - 1];

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text",
  accordion: "Accordion",
  image: "Image",
  carousel: "Carousel",
  video: "Video",
  textMedia: "Text and media",
  callout: "Callout",
  decision: "Decision question",
  quiz: "Quiz",
  checklist: "Checklist",
  flashcards: "Flashcards",
  tabs: "Tabs",
  timeline: "Timeline",
  process: "Process steps",
  branching: "Branching scenario",
  conversation: "Conversation simulator",
  spot: "Spot the mistake",
  confidence: "Confidence check",
  reflection: "Reflection",
  wall: "Insight wall",
  poll: "Poll",
  hotspots: "Hotspots",
  sorting: "Sorting",
  sequencing: "Sequencing",
  matching: "Matching",
  fillblank: "Fill in the blank",
  budget: "Budget simulator",
  journal: "Private journal",
  perspectives: "Compare perspectives",
  pulse: "Pulse check",
  action: "Action note",
  guide: "Recorded guide (retired)",
  ava: "Ava video",
  signal: "Spot the Signal",
  mission: "First 30 Days Mission Board",
  balance: "Dignity of Risk Balance Scale",
  xray: "Invoice X-Ray",
  reset: "Expectation Reset timeline",
  line: "Where Is the Line?",
  bridge: "While You Wait calculator",
  journey: "The SaH Journey",
  benchmark: "Peer benchmark poll",
  myths: "Myth vs Reality tiles",
  baton: "Pass the Baton relay",
  redpen: "Red Pen critique",
  mentor: "Notes to a Younger Me deck",
  playbook: "Job Aid",
  auditor: "Contractor Vetting Card / Document Auditor",
  phonecall: "Tough Phone Call / Tough Family Call",
  sandbox: "Budget Sandbox",
  hiring: "Hiring Runway Decision Lab",
  onedaymap: "One Day, Five Perspectives",
  intake: "Growth readiness",
  workload: "Workload Lens",
  coverage: "Local Coverage Comparison",
  referral: "Referral Journey Calculator",
  reliability: "Service Reliability Calculator",
  cashbridge: "90-Day Cash Bridge",
  casethread: "What Would You Do? case thread",
  budgetlab: "Quarterly Budget Decision Lab",
  hazardscan: "Spot the Hazard",
  discharge: "72-Hour Discharge Pivot",
  network: "Build Your Local Bench",
  trustcheck: "28-Day Trust Check",
  referralstudio: "Local Referral Studio",
  shadowcoach: "First 100 Days: Shadow & Coach",
  hubvisual: "Hub diagram",
};
export const OUTCOMES: Record<BranchOutcome, string> = { good: "A good outcome", mixed: "A mixed outcome", poor: "A poor outcome" };

export const VERDICTS: Record<Verdict, string> = { best: "Best choice", acceptable: "Works, with care", risky: "Not the best choice" };
export const CALLOUTS: Record<CalloutBlock["style"], string> = { important: "Important", example: "Example", tip: "Tip" };

export class GuideDocError extends Error {
  constructor(public problems: string[]) {
    super(problems[0] ?? "The guide isn’t valid.");
  }
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,24}$/;
const LOOM_ID = /^[0-9a-f]{32}$/;

/**
  The YouTube, Vimeo or Loom video a pasted link points to, or null. Takes the usual shapes: youtube.com/watch,
  youtu.be, Shorts, vimeo.com/123456789 (with the private part of an unlisted link), player.vimeo.com,
  channel or showcase links, and Loom's share and embed links (loom.com/share/…).
*/
export function parseEmbedLink(raw: string): VideoEmbed | null {
  const yt = parseVideoLink(raw);
  if (yt?.provider === "youtube") return { provider: "youtube", id: yt.id, ...(yt.orientation === "portrait" && { portrait: true }) };
  let url: URL;
  try {
    const t = raw.trim();
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "loom.com") {
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return (kind === "share" || kind === "embed") && id && LOOM_ID.test(id) ? { provider: "loom", id } : null;
  }
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((p) => VIMEO_ID.test(p));
  if (at < 0) return null;
  const hash = url.searchParams.get("h") ?? (parts[at + 1] && VIMEO_HASH.test(parts[at + 1]) ? parts[at + 1] : undefined);
  return { provider: "vimeo", id: parts[at], ...(hash && VIMEO_HASH.test(hash) && { hash }) };
}

/** The player's address: YouTube without tracking cookies, Vimeo with Do Not Track, Loom without its share buttons; captions on where the video has them. */
export const embedSrc = (e: VideoEmbed) =>
  e.provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${e.id}?rel=0&playsinline=1&modestbranding=1&cc_load_policy=1`
    : e.provider === "loom"
      ? `https://www.loom.com/embed/${e.id}?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true`
      : `https://player.vimeo.com/video/${e.id}?${e.hash ? `h=${e.hash}&` : ""}dnt=1&texttrack=en`;

/** The video's own page, to show the author. */
export const embedLink = (e: VideoEmbed) =>
  e.provider === "youtube"
    ? e.portrait
      ? `https://www.youtube.com/shorts/${e.id}`
      : `https://www.youtube.com/watch?v=${e.id}`
    : e.provider === "loom"
      ? `https://www.loom.com/share/${e.id}`
      : `https://vimeo.com/${e.id}${e.hash ? `/${e.hash}` : ""}`;

export const EMBED_NAME = { youtube: "YouTube", vimeo: "Vimeo", loom: "Loom" } as const;
/** Fill in the blank: the text in pieces, each [[answer|another accepted answer]] becoming a gap. */
export function blanksOf(text: string): ({ text: string } | { answers: string[] })[] {
  const parts: ({ text: string } | { answers: string[] })[] = [];
  let at = 0;
  for (const m of text.matchAll(/\[\[([^\]]*)\]\]/g)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index) });
    parts.push({
      answers: m[1]
        .split("|")
        .map((a) => a.trim())
        .filter(Boolean),
    });
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** Whether what was typed matches an answer: case, spacing and a final full stop don't matter. */
export const sameAnswer = (typed: string, answer: string) => {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!,;:]+$/, "");
  return norm(typed) !== "" && norm(typed) === norm(answer);
};

/**
  A shuffled order (indexes) that's the same every time for the same block, so the page draws the same
  on the server and in the browser, and never the right order to start with.
*/
export function shuffleFor(seed: string, n: number): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

/** Pictures and video from this site: uploads and the Hub's own images. Never another site's address. */
export const isSiteMedia = (src: string) => /^\/(api\/uploads|images)\/[A-Za-z0-9._/-]+$/.test(src) && !src.includes("..");

/**
  Checks a guide's content against the schema and returns a clean copy (unknown fields dropped). Throws
  GuideDocError listing what's wrong. Used for every save, AI output included, and before drawing.
  A draft ({ draft: true }) may still have empty fields and unfinished questions while it's being
  written; anything unsafe (another site's media, a script link, an unknown block) is refused either way.
*/
export function readGuideDoc(value: unknown, { draft = false }: { draft?: boolean } = {}): GuideDoc {
  const problems: string[] = [];
  /** Something unfinished: refused when publishing, allowed in a draft. */
  const unfinished = (p: string) => {
    if (!draft) problems.push(p);
  };
  const seen = new Set<string>();
  const str = (v: unknown, where: string, opts: { required?: boolean; max?: number } = {}) => {
    if (v == null || v === "") {
      if (opts.required) unfinished(`${where} is missing.`);
      return undefined;
    }
    if (typeof v !== "string") {
      problems.push(`${where} should be text.`);
      return undefined;
    }
    const s = v.trim();
    if (opts.max && s.length > opts.max) problems.push(`${where} is longer than ${opts.max} characters.`);
    if (opts.required && !s) unfinished(`${where} is missing.`);
    return s;
  };
  const idOf = (v: unknown, where: string) => {
    if (typeof v !== "string" || !ID.test(v)) {
      problems.push(`${where} needs an id of lower-case letters, numbers and hyphens.`);
      return "x";
    }
    if (seen.has(v)) problems.push(`${where} repeats the id “${v}”.`);
    seen.add(v);
    return v;
  };
  const link = (v: unknown, where: string) => {
    if (v == null) return undefined;
    const o = v as { href?: unknown; label?: unknown };
    const href = str(o.href, `${where} link`, { required: true });
    const label = str(o.label, `${where} link text`, { required: true, max: 120 });
    if (href && !safeHref(href)) problems.push(`${where} link must be a web address, an email or a page on the Hub.`);
    return href && label ? { href, label } : undefined;
  };
  const media = (v: unknown, where: string): Media => {
    const o = (v ?? {}) as Record<string, unknown>;
    const src = str(o.src, `${where} picture`, { required: true }) ?? "";
    if (src && !isSiteMedia(src)) problems.push(`${where} picture must be uploaded to the Hub.`);
    return {
      src,
      alt: str(o.alt, `${where} description`, { max: 400 }) ?? "",
      ...(o.decorative === true && { decorative: true }),
      ...(str(o.caption, `${where} caption`, { max: 400 }) && { caption: str(o.caption, `${where} caption`)! }),
      // Kept only when it's a real position and not simply the centre.
      ...(typeof o.position === "string" && POSITION.test(o.position) && o.position !== "50% 50%" && { position: o.position }),
    };
  };
  // The optional photo in a circle beside the question: kept once one is chosen.
  const photo = (o: Record<string, unknown>, where: string): WithPhoto =>
    o.media && (o.media as { src?: unknown }).src ? { media: media(o.media, `${where} picture`) } : {};
  const common = (o: Record<string, unknown>, where: string) => {
    const out: Pick<Base, "note" | "evidence" | "flag" | "reveal" | "aiWhy"> = {};
    if (typeof o.reveal === "string" && o.reveal in REVEALS && o.reveal !== "rise") out.reveal = o.reveal as Exclude<Reveal, "rise">;
    const note = str(o.note, `${where} note`, { max: 1000 });
    if (note) out.note = note;
    if (Array.isArray(o.evidence))
      out.evidence = o.evidence.flatMap((e: Record<string, unknown>, i) => {
        const source = str(e?.source, `${where} source ${i + 1}`, { required: true, max: 200 });
        if (!source) return [];
        const ref = str(e.ref, `${where} source ${i + 1} reference`, { max: 80 });
        const quote = str(e.quote, `${where} source ${i + 1} passage`, { max: 2000 });
        return [{ source, ...(ref && { ref }), ...(quote && { quote }) }];
      });
    if (o.flag != null) {
      const f = o.flag as Record<string, unknown>;
      if (f.kind !== "verify" && f.kind !== "illustrative") problems.push(`${where} flag should be “verify” or “illustrative”.`);
      else out.flag = { kind: f.kind, note: str(f.note, `${where} flag note`, { max: 600 }) ?? "" };
    }
    // The AI builder's reasons for the block: kept (trimmed, never refused) while there's a reason to read.
    if (o.aiWhy && typeof o.aiWhy === "object") {
      const w = o.aiWhy as Record<string, unknown>;
      const t = (k: string) => (typeof w[k] === "string" ? (w[k] as string).trim().slice(0, 600) : "");
      const why: BlockWhy = {
        behaviour: t("behaviour"),
        evidence: t("evidence"),
        alternative: t("alternative"),
        rationale: t("rationale"),
        learnerAction: t("learnerAction"),
        signal: t("signal"),
        ...(t("owner") && { owner: t("owner") }),
        ...(t("source") && { source: t("source") }),
      };
      if (why.rationale || why.behaviour) out.aiWhy = why;
    }
    return out;
  };

  /** A list of objects (cards, steps…), up to `max`. */
  const list = (v: unknown, where: string, what: string, max: number): Record<string, unknown>[] => {
    const raw = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    if (raw.length > max) problems.push(`${where} has more than ${max} ${what}.`);
    return raw.slice(0, max);
  };

  /** The free-conversation scene a model works within: every part of it authored, and required. Shared by conversations and phone calls. */
  const readRoleplay = (v: unknown, at: string): Roleplay | undefined => {
    const r = v as Record<string, unknown> | undefined;
    if (!r || typeof r !== "object") return undefined;
    const texts = (v: unknown, what: string, max: number, n: number) =>
      (Array.isArray(v) ? v : [])
        .slice(0, n)
        .map((x, i) => str(x, `${at} ${what} ${i + 1}`, { max }) ?? "")
        .filter(Boolean);
    const num = (v: unknown, lo: number, hi: number, d: number) =>
      Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d;
    const states = texts(r.states, "state", 40, 6);
    if (states.length < 3) unfinished(`${at} needs at least 3 states, the last one for a safety concern.`);
    const moves = list(r.moves, at, "things worth doing", 10).map((m, i) => ({
      id: idOf(m?.id, `${at} good move ${i + 1}`),
      dimension: (typeof m?.dimension === "string" && m.dimension in DIMENSIONS ? m.dimension : "listening") as Dimension,
      text: str(m?.text, `${at} good move ${i + 1}`, { required: true, max: 200 }) ?? "",
      example: str(m?.example, `${at} good move ${i + 1} example`, { max: 300 }) ?? "",
    }));
    if (moves.length < 2) unfinished(`${at} needs at least 2 things worth doing, so the debrief has something to point to.`);
    const risks = list(r.risks, at, "unsafe moves", 10).map((x, i) => ({
      id: idOf(x?.id, `${at} unsafe move ${i + 1}`),
      text: str(x?.text, `${at} unsafe move ${i + 1}`, { required: true, max: 200 }) ?? "",
      caution: str(x?.caution, `${at} unsafe move ${i + 1} caution`, { required: true, max: 600 }) ?? "",
    }));
    if (!risks.length) unfinished(`${at} needs at least one unsafe move, with the caution to show for it.`);
    const safety = list(r.safety, at, "safety rules", 8).map((x, i) => {
      const phrases = texts(x?.phrases, `safety rule ${i + 1} phrase`, 60, 20).filter((p) => p.length >= 3);
      if (!phrases.length) unfinished(`${at} safety rule ${i + 1} needs at least one phrase to listen for.`);
      return {
        id: idOf(x?.id, `${at} safety rule ${i + 1}`),
        label: str(x?.label, `${at} safety rule ${i + 1}`, { required: true, max: 80 }) ?? "",
        phrases,
        response: str(x?.response, `${at} safety rule ${i + 1}: what the learner sees`, { required: true, max: 600 }) ?? "",
        guidance: str(x?.guidance, `${at} safety rule ${i + 1} escalation guidance`, { required: true, max: 800 }) ?? "",
      };
    });
    if (!safety.length) unfinished(`${at} needs at least one safety rule: what stops the scene, and the escalation guidance for this role.`);
    const minTurns = num(r.minTurns, TURN_RANGE.min, TURN_RANGE.max, 3);
    const href = typeof r.guidanceHref === "string" ? r.guidanceHref.trim() : "";
    return {
      goal: str(r.goal, `${at}: what they’re practising`, { required: true, max: 300 }) ?? "",
      learnerRole: str(r.learnerRole, `${at}: who the learner is`, { required: true, max: 200 }) ?? "",
      facts: texts(r.facts, "fact", 300, 8),
      profile: str(r.profile, `${at}: who the character is`, { required: true, max: 2000 }) ?? "",
      opening: str(r.opening, `${at}: the opening line`, { required: true, max: 600 }) ?? "",
      meterTitle: str(r.meterTitle, `${at} indicator title`, { max: 60 }) || DEFAULT_METER,
      states,
      // It can't start in the last state: that one is only reached by a safety rule.
      start: Math.min(Math.max(0, states.length - 2), num(r.start, 0, 5, 1)),
      hideMeter: r.hideMeter === true,
      minTurns,
      maxTurns: Math.max(minTurns, num(r.maxTurns, TURN_RANGE.min, TURN_RANGE.max, 6)),
      moves,
      risks,
      safety,
      guidanceLabel: str(r.guidanceLabel, `${at} guidance`, { max: 120 }) ?? "",
      // A page on the Hub or a web address; anything else is dropped.
      guidanceHref: href && safeHref(href) ? href.slice(0, 300) : "",
      voice: r.voice === true,
    };
  };

  const block = (v: unknown, where: string): Block | null => {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = idOf(o.id, where);
    const base = { id, ...common(o, where) };
    switch (o.type) {
      case "text": {
        const level = o.level === 3 ? 3 : 2;
        const heading = str(o.heading, `${where} heading`, { max: 160 });
        return { ...base, type: "text", ...(heading && { heading, level }), body: str(o.body, `${where} text`, { required: true, max: 8000 }) ?? "" };
      }
      case "accordion": {
        const raw = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
        if (raw.length > 20) problems.push(`${where} has more than 20 items.`);
        if (!raw.length) unfinished(`${where} needs at least one item.`);
        const heading = str(o.heading, `${where} heading`, { max: 160 });
        return {
          ...base,
          type: "accordion",
          ...(heading && { heading }),
          items: raw.map((it, i) => {
            const at = `${where} item ${i + 1}`;
            // A picture is optional; an empty one (still being chosen) isn't kept.
            const m = it?.media && (it.media as { src?: unknown }).src ? media(it.media, at) : undefined;
            const placement = it?.placement === "above" || it?.placement === "right" ? it.placement : "below";
            return {
              id: idOf(it?.id, at),
              title: str(it?.title, `${at} title`, { required: true, max: 200 }) ?? "",
              body: str(it?.body, `${at} text`, { required: true, max: 6000 }) ?? "",
              ...(m && { media: m, placement }),
            };
          }),
        };
      }
      case "carousel": {
        const raw = Array.isArray(o.slides) ? (o.slides as Record<string, unknown>[]) : [];
        if (raw.length > 20) problems.push(`${where} has more than 20 pictures.`);
        if (raw.length < 2) unfinished(`${where} needs at least 2 pictures.`);
        return {
          ...base,
          type: "carousel",
          slides: raw.map((sl, i) => ({ id: idOf(sl?.id, `${where} picture ${i + 1}`), media: media(sl?.media, `${where} picture ${i + 1}`) })),
          width: o.width === "wide" ? "wide" : "column",
        };
      }
      case "image": {
        const width = o.width === "wide" || o.width === "full" ? o.width : "column";
        const frame = frameOf(o.frame);
        return { ...base, type: "image", media: media(o.media, where), width, ...(o.enlarge === true && { enlarge: true }), ...(frame && { frame }) };
      }
      case "video": {
        // On YouTube, Vimeo or Loom: only the provider and the video's id are kept, never an address.
        let embed: VideoEmbed | undefined;
        if (o.embed != null) {
          const e = o.embed as Record<string, unknown>;
          const ok =
            (e.provider === "youtube" && typeof e.id === "string" && YOUTUBE_ID.test(e.id)) ||
            (e.provider === "vimeo" &&
              typeof e.id === "string" &&
              VIMEO_ID.test(e.id) &&
              (e.hash == null || (typeof e.hash === "string" && VIMEO_HASH.test(e.hash)))) ||
            (e.provider === "loom" && typeof e.id === "string" && LOOM_ID.test(e.id));
          if (!ok) problems.push(`${where} video must be a YouTube, Vimeo or Loom video.`);
          else
            embed = {
              provider: e.provider as VideoEmbed["provider"],
              id: e.id as string,
              ...(e.provider === "vimeo" && typeof e.hash === "string" && { hash: e.hash }),
              ...(e.provider === "youtube" && e.portrait === true && { portrait: true }),
            };
        }
        const src = embed ? "" : (str(o.src, `${where} video`, { required: true }) ?? "");
        if (src && !isSiteMedia(src)) problems.push(`${where} video must be uploaded to the Hub, or be on YouTube, Vimeo or Loom.`);
        const poster = str(o.poster, `${where} poster`);
        if (poster && !isSiteMedia(poster)) problems.push(`${where} poster must be uploaded to the Hub.`);
        const captions = str(o.captions, `${where} captions`);
        if (captions && !isSiteMedia(captions)) problems.push(`${where} captions file must be uploaded to the Hub.`);
        const caption = str(o.caption, `${where} caption`, { max: 400 });
        const t = o.trim as { start?: unknown; end?: unknown } | undefined;
        const tenth = (v: unknown) => Math.round(Math.max(0, Number(v) || 0) * 10) / 10;
        const trim = !embed && t && typeof t === "object" && tenth(t.end) > tenth(t.start) ? { start: tenth(t.start), end: tenth(t.end) } : undefined;
        const r = o.recording as Record<string, unknown> | undefined;
        const recording: VideoRecording | undefined =
          !embed && r && typeof r === "object"
            ? {
                mode: r.mode === "screen" ? "screen" : "camera",
                at: typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)) ? new Date(r.at).toISOString() : new Date(0).toISOString(),
                seconds: tenth(r.seconds),
                consent: r.consent === true,
              }
            : undefined;
        return {
          ...base,
          type: "video",
          title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
          src,
          ...(embed && { embed }),
          ...(embed && o.captionsOnPlayer === true && { captionsOnPlayer: true }),
          ...(!embed && poster && { poster }),
          ...(!embed && captions && { captions }),
          transcript: str(o.transcript, `${where} transcript`, { max: 20000 }) ?? "",
          ...(caption && { caption }),
          ...(trim && { trim }),
          ...(recording && { recording }),
        };
      }
      case "textMedia": {
        const heading = str(o.heading, `${where} heading`, { max: 160 });
        // A video instead of the picture: read just as a video block is, then kept without the block's own fields.
        let video: VideoFields | undefined;
        if (o.video && typeof o.video === "object") {
          const v = o.video as Record<string, unknown>;
          // Read under the block's own id, which is already checked and taken.
          seen.delete(id);
          const read = block({ ...v, id, type: "video", title: (typeof v.title === "string" && v.title.trim()) || heading || "Video" }, `${where} video`);
          if (read?.type === "video") {
            const rest: Record<string, unknown> = { ...read };
            for (const k of ["id", "type", "note", "evidence", "flag", "reveal"]) delete rest[k];
            video = rest as VideoFields;
          }
        }
        const m = o.media as { src?: unknown } | undefined;
        return {
          ...base,
          type: "textMedia",
          ...(heading && { heading }),
          body: str(o.body, `${where} text`, { required: true, max: 6000 }) ?? "",
          // With a video, a picture is only kept if there is one (switching back brings it back).
          media: video && !(typeof m?.src === "string" && m.src) ? { src: "", alt: "" } : media(o.media, where),
          ...(video && { video }),
          ...(!video && o.enlarge === true && { enlarge: true }),
          ...(!video && frameOf(o.frame) && { frame: frameOf(o.frame) }),
          layout: o.layout === "media-left" ? "media-left" : "media-right",
          // Wrapping is the default; only turning it off is kept.
          ...(o.wrap === false && { wrap: false as const }),
        };
      }
      case "callout": {
        const style = o.style === "important" || o.style === "example" ? o.style : "tip";
        const label = str(o.label, `${where} label`, { max: 60 });
        const l = link(o.link, where);
        const confirm = str(o.confirm, `${where} confirmation`, { max: 300 });
        return {
          ...base,
          type: "callout",
          style,
          ...(label && { label }),
          body: str(o.body, `${where} text`, { required: true, max: 3000 }) ?? "",
          ...(l && { link: l }),
          ...(confirm && { confirm }),
          ...(o.media && (o.media as { src?: unknown }).src ? { media: media(o.media, `${where} picture`) } : {}),
        };
      }
      case "decision": {
        const raw = Array.isArray(o.choices) ? o.choices : [];
        if (raw.length > 6) problems.push(`${where} has more than 6 choices.`);
        if (raw.length < 2) unfinished(`${where} needs at least 2 choices.`);
        const choices = raw.map((c: Record<string, unknown>, i: number): Choice => {
          const w = `${where} choice ${i + 1}`;
          const verdict = c?.verdict === "best" || c?.verdict === "acceptable" ? c.verdict : "risky";
          return {
            id: idOf(c?.id, w),
            text: str(c?.text, w, { required: true, max: 400 }) ?? "",
            verdict,
            feedback: str(c?.feedback, `${w} feedback`, { required: true, max: 2000 }) ?? "",
          };
        });
        if (!choices.some((c) => c.verdict === "best")) unfinished(`${where} needs at least one best choice.`);
        const context = str(o.context, `${where} context`, { max: 2000 });
        const s = o.source as Record<string, unknown> | undefined;
        const sourceLabel = s ? str(s.label, `${where} source`, { max: 160 }) : undefined;
        const sourceHref = s?.href != null ? str(s.href, `${where} source link`) : undefined;
        if (sourceHref && !safeHref(sourceHref)) problems.push(`${where} source link must be a web address or a page on the Hub.`);
        return {
          ...base,
          type: "decision",
          prompt: str(o.prompt, `${where} question`, { required: true, max: 400 }) ?? "",
          // A picture is kept once one is chosen.
          ...(o.media && (o.media as { src?: unknown }).src
            ? { media: media(o.media, `${where} picture`), ...(o.mediaStyle === "wide" && { mediaStyle: "wide" as const }) }
            : {}),
          ...(context && { context }),
          choices,
          ...(sourceLabel && { source: { label: sourceLabel, ...(sourceHref && { href: sourceHref }) } }),
        };
      }
      case "quiz": {
        const intro = str(o.intro, `${where} intro`, { max: 600 });
        return { ...base, type: "quiz", pathId: str(o.pathId, `${where} learning path`, { required: true, max: 80 }) ?? "", ...(intro && { intro }) };
      }
      case "checklist": {
        const items = (Array.isArray(o.items) ? o.items : [])
          .map((x, i) => str(x, `${where} item ${i + 1}`, { required: true, max: 400 }) ?? "")
          .filter((x) => draft || x);
        if (!items.some(Boolean)) unfinished(`${where} needs at least one item.`);
        const l = link(o.resource, where);
        return { ...base, type: "checklist", title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "", items, ...(l && { resource: l }) };
      }
      case "flashcards": {
        const raw = list(o.cards, where, "cards", 30);
        if (!raw.length) unfinished(`${where} needs at least one card.`);
        return {
          ...base,
          type: "flashcards",
          cards: raw.map((c, i) => {
            const at = `${where} card ${i + 1}`;
            const m = c?.media && (c.media as { src?: unknown }).src ? media(c.media, at) : undefined;
            return {
              id: idOf(c?.id, at),
              front: str(c?.front, `${at} front`, { required: true, max: 300 }) ?? "",
              back: str(c?.back, `${at} back`, { required: true, max: 2000 }) ?? "",
              ...(m && { media: m }),
            };
          }),
        };
      }
      case "tabs": {
        const raw = list(o.tabs, where, "tabs", 8);
        if (raw.length < 2) unfinished(`${where} needs at least 2 tabs.`);
        return {
          ...base,
          type: "tabs",
          tabs: raw.map((t, i) => ({
            id: idOf(t?.id, `${where} tab ${i + 1}`),
            label: str(t?.label, `${where} tab ${i + 1} name`, { required: true, max: 60 }) ?? "",
            body: str(t?.body, `${where} tab ${i + 1} text`, { required: true, max: 6000 }) ?? "",
          })),
        };
      }
      case "timeline": {
        const raw = list(o.events, where, "events", 20);
        if (raw.length < 2) unfinished(`${where} needs at least 2 events.`);
        return {
          ...base,
          type: "timeline",
          events: raw.map((e, i) => ({
            id: idOf(e?.id, `${where} event ${i + 1}`),
            when: str(e?.when, `${where} event ${i + 1} when`, { required: true, max: 60 }) ?? "",
            title: str(e?.title, `${where} event ${i + 1} title`, { required: true, max: 160 }) ?? "",
            body: str(e?.body, `${where} event ${i + 1} text`, { max: 3000 }) ?? "",
          })),
        };
      }
      case "process": {
        const raw = list(o.steps, where, "steps", 20);
        if (raw.length < 2) unfinished(`${where} needs at least 2 steps.`);
        return {
          ...base,
          type: "process",
          steps: raw.map((st, i) => ({
            id: idOf(st?.id, `${where} step ${i + 1}`),
            title: str(st?.title, `${where} step ${i + 1} title`, { required: true, max: 160 }) ?? "",
            body: str(st?.body, `${where} step ${i + 1} text`, { max: 3000 }) ?? "",
          })),
        };
      }
      case "branching": {
        const raw = list(o.scenes, where, "scenes", 30);
        const scenes: BranchScene[] = raw.map((sc, i) => {
          const at = `${where} scene ${i + 1}`;
          const e = sc?.ending as Record<string, unknown> | undefined;
          const ending = e
            ? {
                outcome: (e.outcome === "good" || e.outcome === "mixed" ? e.outcome : "poor") as BranchOutcome,
                summary: str(e.summary, `${at} ending`, { required: true, max: 1500 }) ?? "",
              }
            : undefined;
          return {
            id: idOf(sc?.id, at),
            text: str(sc?.text, `${at} text`, { required: true, max: 3000 }) ?? "",
            // An ending has no choices.
            choices: ending
              ? []
              : list(sc?.choices, at, "choices", 4).map((c, j) => ({
                  id: idOf(c?.id, `${at} choice ${j + 1}`),
                  text: str(c?.text, `${at} choice ${j + 1}`, { required: true, max: 300 }) ?? "",
                  next: typeof c?.next === "string" ? c.next : "",
                })),
            ...(ending && { ending }),
          };
        });
        const sceneIds = new Set(scenes.map((sc) => sc.id));
        scenes.forEach((sc, i) => {
          if (!sc.ending && !sc.choices.length) unfinished(`${where} scene ${i + 1} needs choices, or to be an ending.`);
          sc.choices.forEach((c, j) => {
            if (!c.next) unfinished(`${where} scene ${i + 1}, choice ${j + 1} needs to lead somewhere.`);
            else if (!sceneIds.has(c.next)) problems.push(`${where} scene ${i + 1}, choice ${j + 1} leads to a scene that isn’t there.`);
          });
        });
        if (!scenes.some((sc) => sc.ending)) unfinished(`${where} needs at least one ending.`);
        return { ...base, type: "branching", title: str(o.title, `${where} title`, { max: 160 }) ?? "", scenes };
      }
      case "conversation": {
        const raw = list(o.turns, where, "turns", 12);
        if (!raw.length) unfinished(`${where} needs at least one turn.`);
        // Free conversation: every part of the scene a model works within is authored here, and required.
        const rp = readRoleplay(o.roleplay, `${where} free conversation`);
        const scene = rp ? { roleplay: rp } : {};
        return {
          ...base,
          type: "conversation",
          ...photo(o, where),
          ...scene,
          person: str(o.person, `${where} person`, { required: true, max: 80 }) ?? "",
          role: str(o.role, `${where} role`, { max: 120 }) ?? "",
          setting: str(o.setting, `${where} setting`, { max: 600 }) ?? "",
          turns: raw.map((t, i) => {
            const at = `${where} turn ${i + 1}`;
            const responses = list(t?.responses, at, "responses", 4).map((r, j) => ({
              id: idOf(r?.id, `${at} response ${j + 1}`),
              text: str(r?.text, `${at} response ${j + 1}`, { required: true, max: 400 }) ?? "",
              verdict: (r?.verdict === "best" || r?.verdict === "acceptable" ? r.verdict : "risky") as Verdict,
              feedback: str(r?.feedback, `${at} response ${j + 1} coaching`, { required: true, max: 1500 }) ?? "",
              reply: str(r?.reply, `${at} response ${j + 1} reply`, { max: 600 }) ?? "",
            }));
            if (responses.length < 2) unfinished(`${at} needs at least 2 responses.`);
            if (!responses.some((r) => r.verdict === "best")) unfinished(`${at} needs a best response.`);
            return { id: idOf(t?.id, at), line: str(t?.line, `${at}: what they say`, { required: true, max: 800 }) ?? "", responses };
          }),
        };
      }
      case "spot": {
        const raw = list(o.mistakes, where, "mistakes", 15);
        if (!raw.length) unfinished(`${where} needs at least one mistake to find.`);
        const pct = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) * 10) / 10 || 0));
        return {
          ...base,
          type: "spot",
          prompt: str(o.prompt, `${where} instructions`, { required: true, max: 400 }) ?? "",
          media: media(o.media, where),
          mistakes: raw.map((m, i) => ({
            id: idOf(m?.id, `${where} mistake ${i + 1}`),
            x: pct(m?.x),
            y: pct(m?.y),
            label: str(m?.label, `${where} mistake ${i + 1} name`, { required: true, max: 160 }) ?? "",
            explanation: str(m?.explanation, `${where} mistake ${i + 1} explanation`, { required: true, max: 1000 }) ?? "",
          })),
        };
      }
      case "hotspots": {
        const raw = list(o.spots, where, "points", 12);
        if (!raw.length) unfinished(`${where} needs at least one point to open.`);
        const pct = (v: unknown) => Math.min(100, Math.max(0, Math.round(Number(v) * 10) / 10 || 0));
        return {
          ...base,
          type: "hotspots",
          prompt: str(o.prompt, `${where} instructions`, { max: 400 }) ?? "",
          media: media(o.media, where),
          spots: raw.map((p, i) => ({
            id: idOf(p?.id, `${where} point ${i + 1}`),
            x: pct(p?.x),
            y: pct(p?.y),
            title: str(p?.title, `${where} point ${i + 1} title`, { required: true, max: 160 }) ?? "",
            body: str(p?.body, `${where} point ${i + 1} text`, { required: true, max: 2000 }) ?? "",
          })),
        };
      }
      case "sorting": {
        const groups = list(o.groups, where, "groups", 4).map((g, i) => ({
          id: idOf(g?.id, `${where} group ${i + 1}`),
          label: str(g?.label, `${where} group ${i + 1} name`, { required: true, max: 80 }) ?? "",
        }));
        if (groups.length < 2) unfinished(`${where} needs at least 2 groups.`);
        const ids = new Set(groups.map((g) => g.id));
        const items = list(o.items, where, "items", 16).map((it, i) => {
          const group = typeof it?.group === "string" ? it.group : "";
          if (!group) unfinished(`${where} item ${i + 1} needs a group.`);
          else if (!ids.has(group)) problems.push(`${where} item ${i + 1} is in a group that isn’t there.`);
          return {
            id: idOf(it?.id, `${where} item ${i + 1}`),
            text: str(it?.text, `${where} item ${i + 1}`, { required: true, max: 200 }) ?? "",
            group,
            feedback: str(it?.feedback, `${where} item ${i + 1} feedback`, { max: 600 }) ?? "",
          };
        });
        if (items.length < 2) unfinished(`${where} needs at least 2 items to sort.`);
        return { ...base, type: "sorting", prompt: str(o.prompt, `${where} instructions`, { required: true, max: 400 }) ?? "", groups, items };
      }
      case "sequencing": {
        const steps = list(o.steps, where, "steps", 10).map((st, i) => ({
          id: idOf(st?.id, `${where} step ${i + 1}`),
          text: str(st?.text, `${where} step ${i + 1}`, { required: true, max: 300 }) ?? "",
        }));
        if (steps.length < 3) unfinished(`${where} needs at least 3 steps to put in order.`);
        return {
          ...base,
          type: "sequencing",
          ...photo(o, where),
          prompt: str(o.prompt, `${where} instructions`, { required: true, max: 400 }) ?? "",
          steps,
          feedback: str(o.feedback, `${where} feedback`, { max: 1500 }) ?? "",
        };
      }
      case "matching": {
        const pairs = list(o.pairs, where, "pairs", 8).map((p, i) => ({
          id: idOf(p?.id, `${where} pair ${i + 1}`),
          left: str(p?.left, `${where} pair ${i + 1} left`, { required: true, max: 200 }) ?? "",
          right: str(p?.right, `${where} pair ${i + 1} right`, { required: true, max: 300 }) ?? "",
        }));
        if (pairs.length < 2) unfinished(`${where} needs at least 2 pairs.`);
        return {
          ...base,
          type: "matching",
          prompt: str(o.prompt, `${where} instructions`, { required: true, max: 400 }) ?? "",
          pairs,
          feedback: str(o.feedback, `${where} feedback`, { max: 1500 }) ?? "",
        };
      }
      case "fillblank": {
        const text = str(o.text, `${where} text`, { required: true, max: 3000 }) ?? "";
        if (text && !blanksOf(text).some((p) => "answers" in p)) unfinished(`${where} needs at least one gap: put the answer in [[double brackets]].`);
        if (blanksOf(text).some((p) => "answers" in p && !p.answers.length)) problems.push(`${where} has an empty gap.`);
        return {
          ...base,
          type: "fillblank",
          prompt: str(o.prompt, `${where} instructions`, { max: 400 }) ?? "",
          text,
          feedback: str(o.feedback, `${where} feedback`, { max: 1500 }) ?? "",
        };
      }
      case "confidence": {
        const compareWith = typeof o.compareWith === "string" && ID.test(o.compareWith) ? o.compareWith : undefined;
        return {
          ...base,
          type: "confidence",
          statement: str(o.statement, `${where} question`, { required: true, max: 300 }) ?? "",
          low: str(o.low, `${where} low label`, { max: 60 }) || "Not confident",
          high: str(o.high, `${where} high label`, { max: 60 }) || "Very confident",
          ...(compareWith && { compareWith }),
        };
      }
      case "reflection":
        return {
          ...base,
          type: "reflection",
          ...photo(o, where),
          prompt: str(o.prompt, `${where} question`, { required: true, max: 800 }) ?? "",
          guidance: str(o.guidance, `${where} guidance`, { max: 3000 }) ?? "",
          minWords: Math.min(300, Math.max(0, Math.round(Number(o.minWords) || 0))),
        };
      case "poll": {
        const raw = list(o.options, where, "options", 6);
        if (raw.length < 2) unfinished(`${where} needs at least 2 options.`);
        return {
          ...base,
          type: "poll",
          ...photo(o, where),
          question: str(o.question, `${where} question`, { required: true, max: 300 }) ?? "",
          options: raw.map((op, i) => ({
            id: idOf(op?.id, `${where} option ${i + 1}`),
            text: str(op?.text, `${where} option ${i + 1}`, { required: true, max: 160 }) ?? "",
          })),
        };
      }
      case "ava": {
        const title = typeof o.title === "string" ? o.title.trim().slice(0, 120) : "";
        return { ...base, type: "ava", ...(title && { title }) };
      }
      case "guide": {
        const keep = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
        const when = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : new Date(0).toISOString());
        const site = (x: unknown, what: string) => {
          const v = keep(x, 300);
          if (v && !isSiteMedia(v)) problems.push(`${where} ${what} must be uploaded to the Hub.`);
          return v && isSiteMedia(v) ? v : "";
        };
        const mm = o.media as Record<string, unknown> | undefined;
        const src = mm ? site(mm.src, "recording") : "";
        const poster = mm ? site(mm.poster, "poster") : "";
        const captions = mm ? site(mm.captions, "captions file") : "";
        const ck = mm?.checked as Record<string, unknown> | undefined;
        const ap = o.approved as Record<string, unknown> | undefined;
        const sc = o.source as Record<string, unknown> | undefined;
        const srcLabel = sc ? keep(sc.label, 200) : "";
        const srcHref = sc ? keep(sc.href, 500) : "";
        if (srcHref && !safeHref(srcHref)) problems.push(`${where} source link must be a web address or a page on the Hub.`);
        const rv = o.reviewed as Record<string, unknown> | undefined;
        const ctx = o.context as { src?: unknown } | undefined;
        const seconds = Math.round(Number(mm?.seconds) * 10) / 10;
        const screenText = keep(o.screenText, 200);
        const caseLabel = keep(o.caseLabel, 40);
        const owner = keep(o.owner, 120);
        const pronunciation = keep(o.pronunciation, 600);
        const after = typeof o.after === "string" && ID.test(o.after) ? o.after : undefined;
        const producedBy = keep(mm?.producedBy, 120);
        const providerRef = keep(mm?.providerRef, 200);
        return {
          ...base,
          type: "guide",
          mode: o.mode === "inset" || o.mode === "voice" ? o.mode : "transmission",
          purpose: o.purpose === "attention" || o.purpose === "question" || o.purpose === "consequence" || o.purpose === "bridge" ? o.purpose : "scene",
          script: str(o.script, `${where} script`, { max: 3000 }) ?? "",
          ...(screenText && { screenText }),
          ...(caseLabel && { caseLabel }),
          ...(ctx?.src && typeof ctx.src === "string" ? { context: media(o.context, `${where} context`) } : {}),
          status: o.status === "approved" ? "approved" : "draft",
          ...(ap &&
            typeof ap.by === "string" &&
            typeof ap.hash === "string" && { approved: { by: ap.by.slice(0, 120), at: when(ap.at), hash: ap.hash.slice(0, 40) } }),
          ...(owner && { owner }),
          ...(srcLabel && { source: { label: srcLabel, ...(srcHref && safeHref(srcHref) && { href: srcHref }) } }),
          ...(rv &&
            typeof rv.by === "string" &&
            rv.by.trim() &&
            typeof rv.on === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(rv.on) && { reviewed: { by: rv.by.trim().slice(0, 120), on: rv.on } }),
          ...(pronunciation && { pronunciation }),
          ...(after && { after }),
          ...(src && {
            media: {
              kind: mm?.kind === "audio" ? ("audio" as const) : ("video" as const),
              src,
              ...(poster && { poster }),
              ...(captions && { captions }),
              ...(seconds > 0 && { seconds }),
              scriptHash: keep(mm?.scriptHash, 40),
              ...(ck && typeof ck.by === "string" && { checked: { by: ck.by.slice(0, 120), at: when(ck.at) } }),
              ...(producedBy && { producedBy }),
              ...(providerRef && { providerRef }),
            },
          }),
        };
      }
      case "journal": {
        const scaffold = str(o.scaffold, `${where} scaffold`, { max: 300 });
        const minutes = Math.round(Number(o.minutes));
        const revisits = typeof o.revisits === "string" && ID.test(o.revisits) ? o.revisits : undefined;
        return {
          ...base,
          type: "journal",
          prompt: str(o.prompt, `${where} prompt`, { required: true, max: 500 }) ?? "",
          ...(scaffold && { scaffold }),
          ...(minutes >= 1 && minutes <= 30 && { minutes }),
          ...(o.required === true && { required: true }),
          ...(revisits && { revisits }),
        };
      }
      case "perspectives": {
        const raw = list(o.views, where, "perspectives", 4);
        if (raw.length < 2) unfinished(`${where} needs at least 2 perspectives.`);
        const g = o.guidance as Record<string, unknown> | undefined;
        const body = g ? str(g.body, `${where} guidance`, { max: 2000 }) : undefined;
        const src = g?.source as Record<string, unknown> | undefined;
        const label = src ? str(src.label, `${where} guidance source`, { max: 200 }) : undefined;
        const href = src?.href != null && src.href !== "" ? str(src.href, `${where} guidance link`) : undefined;
        if (href && !safeHref(href)) problems.push(`${where} guidance link must be a web address or a page on the Hub.`);
        const reviewedBy = g ? str(g.reviewedBy, `${where} guidance reviewer`, { max: 120 }) : undefined;
        const reviewedOn = typeof g?.reviewedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.reviewedOn) ? g.reviewedOn : undefined;
        const after = typeof o.after === "string" && ID.test(o.after) ? o.after : undefined;
        return {
          ...base,
          type: "perspectives",
          prompt: str(o.prompt, `${where} prompt`, { max: 400 }) ?? "",
          ...(after && { after }),
          views: raw.map((v, i) => ({
            id: typeof v?.id === "string" && ID.test(v.id) ? v.id : `v${i + 1}`,
            title: str(v?.title, `${where} perspective ${i + 1}`, { required: true, max: 200 }) ?? "",
            reasoning: str(v?.reasoning, `${where} perspective ${i + 1} reasoning`, { required: true, max: 1200 }) ?? "",
            misses: str(v?.misses, `${where} perspective ${i + 1}: what it might miss`, { max: 800 }) ?? "",
          })),
          ...(body && {
            guidance: {
              body,
              ...(label && { source: { label, ...(href && { href }) } }),
              ...(reviewedBy && { reviewedBy }),
              ...(reviewedOn && { reviewedOn }),
            },
          }),
        };
      }
      case "pulse": {
        const raw = list(o.options, where, "response labels", 5);
        if (raw.length < 2) unfinished(`${where} needs at least 2 response labels.`);
        const compareWith = typeof o.compareWith === "string" && ID.test(o.compareWith) ? o.compareWith : undefined;
        return {
          ...base,
          type: "pulse",
          question: str(o.question, `${where} question`, { required: true, max: 300 }) ?? "",
          kind: o.kind === "view" ? "view" : "confidence",
          options: raw.map((op, i) => ({
            id: typeof op?.id === "string" && ID.test(op.id) ? op.id : `o${i + 1}`,
            label: str(op?.label, `${where} label ${i + 1}`, { required: true, max: 80 }) ?? "",
          })),
          ...(compareWith && { compareWith }),
        };
      }
      case "action": {
        const raw = list(o.suggestions, where, "suggested actions", 4);
        const timing = str(o.timing, `${where} timing`, { max: 160 });
        const revisits = typeof o.revisits === "string" && ID.test(o.revisits) ? o.revisits : undefined;
        if (!revisits && raw.length < 2 && o.allowOwn === false) unfinished(`${where} needs at least 2 suggested actions, or let learners write their own.`);
        return {
          ...base,
          type: "action",
          prompt: str(o.prompt, `${where} prompt`, { required: true, max: 400 }) ?? "",
          suggestions: raw.map((sg, i) => ({
            id: typeof sg?.id === "string" && ID.test(sg.id) ? sg.id : `a${i + 1}`,
            text: str(sg?.text, `${where} action ${i + 1}`, { required: true, max: 300 }) ?? "",
          })),
          ...(o.allowOwn === false && { allowOwn: false as const }),
          ...(timing && { timing }),
          ...(o.required === true && { required: true }),
          ...(revisits && { revisits }),
        };
      }
      case "wall": {
        const placeholder = str(o.placeholder, `${where} placeholder`, { max: 200 });
        return {
          ...base,
          type: "wall",
          ...photo(o, where),
          prompt: str(o.prompt, `${where} question`, { required: true, max: 300 }) ?? "",
          ...(placeholder && { placeholder }),
          ...(o.anonymous === true && { anonymous: true }),
        };
      }
      case "signal":
        return { ...base, type: "signal", ...parseSignal(o, where, { str, idOf, list, unfinished }) };
      case "mission":
        return { ...base, type: "mission", ...parseMission(o, where, { str, idOf, list, unfinished }) };
      case "balance":
        return { ...base, type: "balance", ...parseBalance(o, where, { str, idOf, list, unfinished }) };
      case "xray":
        return { ...base, type: "xray", ...parseXRay(o, where, { str, idOf, list, unfinished }) };
      case "reset":
        return { ...base, type: "reset", ...parseReset(o, where, { str, idOf, list, unfinished }) };
      case "line":
        return { ...base, type: "line", ...parseLine(o, where, { str, idOf, list, unfinished }) };
      case "bridge":
        return { ...base, type: "bridge", ...parseBridge(o, where, { str, idOf, list, unfinished }) };
      case "journey":
        return { ...base, type: "journey", ...parseJourney(o, where, { str, idOf, list, unfinished }) };
      case "benchmark":
        return { ...base, type: "benchmark", ...parseBenchmark(o, where, { str, idOf, list, unfinished }) };
      case "myths":
        return { ...base, type: "myths", ...parseMythBlock(o, where, { str, unfinished }) };
      case "baton":
        return { ...base, type: "baton", ...parseBaton(o, where, { str, idOf, list, unfinished }) };
      case "redpen":
        return { ...base, type: "redpen", ...parseRedPen(o, where, { str, idOf, list, unfinished }) };
      case "mentor":
        return { ...base, type: "mentor", ...parseNotesDeck(o, where, { str, unfinished }) };
      case "playbook":
        return { ...base, type: "playbook", ...parsePlaybookBlock(o, where, { unfinished }) };
      case "auditor":
        return { ...base, type: "auditor", ...parseAuditor(o, where, { str, idOf, list, unfinished }) };
      case "sandbox":
        return { ...base, type: "sandbox", ...parseSandbox(o, where, { str, idOf, list, unfinished }) };
      case "hiring":
        return { ...base, type: "hiring", ...parseHiringLab(o, where, { str, idOf, list, unfinished }) };
      case "onedaymap":
        return { ...base, type: "onedaymap", ...parseOneDay(o, where, { str, idOf, list, unfinished }) };
      case "intake":
        return { ...base, type: "intake", ...parseIntakeLab(o, where, { str, unfinished }) };
      case "workload":
        return { ...base, type: "workload", ...parseWorkloadLab(o, where, { str, unfinished }) };
      case "coverage":
        return { ...base, type: "coverage", ...parseCoverageLab(o, where, { str, unfinished }) };
      case "referral":
        return { ...base, type: "referral", ...parseReferralLab(o, where, { str, unfinished }) };
      case "reliability":
        return { ...base, type: "reliability", ...parseReliabilityLab(o, where, { str, unfinished }) };
      case "cashbridge":
        return { ...base, type: "cashbridge", ...parseCashBridgeLab(o, where, { str, unfinished }) };
      case "casethread":
        return { ...base, type: "casethread", ...parseCaseThread(o, where, { str, list, unfinished }) };
      case "budgetlab":
        return { ...base, type: "budgetlab", ...parseBudgetLab(o, where, { str, unfinished }) };
      case "hazardscan":
        return { ...base, type: "hazardscan", ...parseHazardScan(o, where, { str, unfinished }) };
      case "discharge":
        return { ...base, type: "discharge", ...parseDischarge(o, where, { str, unfinished }) };
      case "network":
        return { ...base, type: "network", ...parseNetwork(o, where, { str, unfinished }) };
      case "trustcheck":
        return { ...base, type: "trustcheck", ...parseTrust(o, where, { str, unfinished }) };
      case "referralstudio":
        return { ...base, type: "referralstudio", ...parseStudio(o, where, { str, unfinished }) };
      case "shadowcoach":
        return { ...base, type: "shadowcoach", ...parseShadow(o, where, { str, unfinished }) };
      case "hubvisual": {
        const visual = typeof o.visual === "string" && o.visual in HUB_VISUALS ? (o.visual as HubVisualKind) : "client-journey";
        const caption = str(o.caption, `${where} caption`, { max: 300 });
        return { ...base, type: "hubvisual", visual, ...(caption ? { caption } : {}) };
      }
      case "phonecall": {
        const roleplay = readRoleplay(o.roleplay, `${where} call`);
        if (!roleplay) unfinished(`${where} needs its call: the caller, the scene and what’s worth doing.`);
        const p = o.phone && typeof o.phone === "object" ? (o.phone as Record<string, unknown>) : {};
        return {
          ...base,
          type: "phonecall",
          title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
          person: str(o.person, `${where} caller`, { required: true, max: 80 }) ?? "",
          role: str(o.role, `${where} caller’s relationship`, { max: 120 }) ?? "",
          setting: str(o.setting, `${where} setting`, { max: 600 }) ?? "",
          roleplay: roleplay ?? blankRoleplay(),
          phone: parsePhoneCase(p, where, roleplay, { str, idOf, list, unfinished }, { family: Boolean(o.family) }),
          // A Tough Family Call (lib/familyCall): the family case, checked as a whole by familyCaseProblems.
          ...(o.family && typeof o.family === "object" ? { family: parseFamilyCall(o.family) } : {}),
        };
      }
      case "budget": {
        const raw = list(o.services, where, "services", 12);
        if (!raw.length) unfinished(`${where} needs at least one service.`);
        const money = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) * 100) / 100 || 0));
        const budget = money(o.budget, 10_000_000);
        if (!budget) unfinished(`${where} needs a budget.`);
        const carryover = money(o.carryover, 10_000_000);
        return {
          ...base,
          type: "budget",
          title: str(o.title, `${where} title`, { max: 160 }) ?? "",
          budget,
          ...(o.utilisation === true && { utilisation: true, ...(carryover > 0 && { carryover }) }),
          weeks: Math.min(52, Math.max(1, Math.round(Number(o.weeks) || 13))),
          services: raw.map((sv, i) => {
            const max = Math.min(100, Math.max(1, Number(sv?.max) || 7));
            return {
              id: idOf(sv?.id, `${where} service ${i + 1}`),
              name: str(sv?.name, `${where} service ${i + 1} name`, { required: true, max: 80 }) ?? "",
              unit: str(sv?.unit, `${where} service ${i + 1} unit`, { max: 30 }) || "hour",
              cost: money(sv?.cost, 10_000),
              perWeek: Math.min(max, Math.max(0, Math.round(Number(sv?.perWeek) * 2) / 2 || 0)),
              max,
            };
          }),
        };
      }
      default:
        problems.push(`${where} is an unknown kind of block.`);
        return null;
    }
  };

  const section = (s: Record<string, unknown>, where: string): Section => {
    const blocks = (Array.isArray(s?.blocks) ? s.blocks : []).map((b, j) => block(b, `${where}, block ${j + 1}`)).filter((b): b is Block => b !== null);
    return { id: idOf(s?.id, where), title: str(s?.title, `${where} title`, { required: true, max: 120 }) ?? "", blocks };
  };
  /** A spoken introduction: its script, whether it's approved, and its recording. Never required. */
  const narration = (v: unknown, where: string, nested = false): Narration | undefined => {
    const o = v as Record<string, unknown> | undefined;
    if (!o || typeof o !== "object") return undefined;
    const script = str(o.script, `${where} narration`, { max: 1200 }) ?? "";
    if (!script) return undefined;
    const b = o.basis as Record<string, unknown> | undefined;
    const basis =
      b && typeof b.hash === "string" && typeof b.key === "string" && Array.isArray(b.sig)
        ? { hash: b.hash.slice(0, 40), key: b.key.slice(0, 40), sig: b.sig.slice(0, 32).map((x) => Number(x) >>> 0) }
        : undefined;
    const a = o.audio as Record<string, unknown> | undefined;
    let audio: NarrationAudio | undefined;
    if (a && typeof a === "object") {
      const src = typeof a.src === "string" ? a.src : "";
      if (!isSiteMedia(src)) problems.push(`${where} narration must be recorded on the Hub.`);
      else {
        const words = Array.isArray(a.words)
          ? (a.words as Record<string, unknown>[])
              .slice(0, 600)
              .map((w) => ({ from: Number(w?.from) || 0, to: Number(w?.to) || 0, start: Number(w?.start) || 0, end: Number(w?.end) || 0 }))
          : null;
        audio = {
          src,
          seconds: Math.max(0, Math.round(Number(a.seconds) * 10) / 10 || 0),
          words,
          scriptHash: String(a.scriptHash ?? "").slice(0, 40),
          voice: String(a.voice ?? "topic").slice(0, 60),
          at: typeof a.at === "string" && !Number.isNaN(Date.parse(a.at)) ? new Date(a.at).toISOString() : new Date(0).toISOString(),
          // Where it came from and what it cost (Audio Introductions); absent on earlier recordings.
          ...(typeof a.provider === "string" && /^[a-z0-9-]{2,30}$/.test(a.provider) && { provider: a.provider }),
          ...(typeof a.profile === "string" && /^[a-z0-9-]{2,30}$/.test(a.profile) && { profile: a.profile }),
          ...(typeof a.model === "string" && /^[\w.:-]{2,60}$/.test(a.model) && { model: a.model }),
          ...(typeof a.cost === "number" && Number.isFinite(a.cost) && a.cost >= 0 && { cost: Math.round(a.cost * 1e5) / 1e5 }),
          ...(a.pending === true && { pending: true as const }),
        };
      }
    }
    const checks = Array.isArray(o.checks) ? o.checks.slice(0, 10).map((c) => String(c).slice(0, 300)) : [];
    const version = Math.round(Number(o.version));
    const approvedAt = typeof o.approvedAt === "string" && !Number.isNaN(Date.parse(o.approvedAt)) ? new Date(o.approvedAt).toISOString() : undefined;
    const next = nested ? undefined : narration(o.next, where, true);
    return {
      script,
      status: o.status === "approved" ? "approved" : "draft",
      ...(basis && { basis }),
      ...(audio && { audio }),
      ...(checks.length && { checks }),
      ...(version > 0 && version < 10_000 && { version }),
      ...(typeof o.approvedBy === "string" && o.approvedBy.trim() && { approvedBy: o.approvedBy.trim().slice(0, 80) }),
      ...(approvedAt && { approvedAt }),
      ...(!nested && o.hidden === true && { hidden: true as const }),
      ...(next && { next }),
    };
  };
  const audioSettings = (v: unknown): GuideAudio | undefined => {
    const o = v as Record<string, unknown> | undefined;
    if (!o || typeof o !== "object") return undefined;
    const l = (o.levels ?? {}) as Record<string, unknown>;
    const voice = o.voice as Record<string, unknown> | undefined;
    const intro = narration(o.intro, "The course introduction");
    return {
      levels: { course: l.course !== false, pages: l.pages !== false, blocks: l.blocks === true },
      voice:
        voice?.kind === "profile" && voice.id === "editorial"
          ? { kind: "profile", id: "editorial" }
          : voice?.kind === "custom" && typeof voice.voiceId === "string" && /^[A-Za-z0-9]{8,40}$/.test(voice.voiceId)
            ? { kind: "custom", voiceId: voice.voiceId, name: String(voice.name ?? "").slice(0, 80) }
            : voice?.kind === "openai" && typeof voice.voice === "string" && /^[a-z]{2,20}$/.test(voice.voice)
              ? { kind: "openai", voice: voice.voice }
              : { kind: "topic" },
      length: o.length === "short" || o.length === "extended" || o.length === "editorial" ? o.length : "standard",
      // Introductions never play by themselves now; a stored "auto" or "offer-auto" only keeps the Audio guide switch.
      playback: o.playback === "offer-auto" || o.playback === "auto" ? o.playback : "press-play",
      ...(intro && { intro }),
    };
  };
  const page = (p: Record<string, unknown>, i: number, many: boolean): Page => {
    const where = many ? `Page ${i + 1}` : "The page";
    const id = idOf(p?.id, where);
    const sections = (Array.isArray(p?.sections) ? p.sections : []).map((x: Record<string, unknown>, j: number) => section(x, `${where}, section ${j + 1}`));
    if (!sections.length) unfinished(`${where} needs at least one section.`);
    const hero = p?.hero ? media(p.hero, `${where} hero`) : undefined;
    const template = typeof p?.template === "string" && p.template in PAGE_TEMPLATES ? (p.template as PageTemplate) : "blank";
    // A chapter marker: kept when it's there, with a title (needed to publish) and an optional introduction.
    let chapter: PageChapter | undefined;
    if (p?.chapter != null) {
      if (typeof p.chapter !== "object" || Array.isArray(p.chapter)) problems.push(`${where} chapter should be a title and an optional introduction.`);
      else {
        const c = p.chapter as Record<string, unknown>;
        const intro = str(c.intro, `${where} chapter introduction`, { max: 600 });
        chapter = { title: str(c.title, `${where} chapter title`, { required: true, max: 120 }) ?? "", ...(intro && { intro }) };
      }
    }
    return {
      id,
      ...(chapter && { chapter }),
      title: str(p?.title, `${where} title`, { max: 120 }) ?? "",
      purpose: str(p?.purpose, `${where} purpose`, { max: 400 }) ?? "",
      template,
      kind: p?.kind === "assessment" ? "assessment" : "content",
      required: p?.required !== false,
      ...(p?.allActivities === false && { allActivities: false as const }),
      ...(p?.standalone === true && p?.kind !== "assessment" && { standalone: true as const }),
      ...(hero?.src && { hero }),
      ...((n) => (n ? { narration: n } : {}))(narration(p?.narration, where)),
      ...((r) => (r ? { relay: r } : {}))(cleanRelayPage(p?.relay)),
      sections,
    };
  };

  // Self-review's questions. Lenient like a draft: an unfinished question is kept (it's a draft until approved).
  const selfReview = (v: unknown): SelfReview | undefined => {
    const o = v as Record<string, unknown> | undefined;
    if (!o || typeof o !== "object") return undefined;
    const raw = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
    if (raw.length > 300) problems.push("Self-review can have up to 300 questions.");
    const at = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : new Date(0).toISOString());
    const items = raw.slice(0, 300).map((it, i): PracticeItem => {
      const where = `Self-review question ${i + 1}`;
      const keep = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
      const choices = (Array.isArray(it?.choices) ? (it.choices as Record<string, unknown>[]) : []).slice(0, 5).map((c, j) => {
        const id = typeof c?.id === "string" && ID.test(c.id) ? c.id : `c${j + 1}`;
        const feedback = keep(c?.feedback, 800);
        return { id, text: keep(c?.text, 400), ...(feedback && { feedback }) };
      });
      if (new Set(choices.map((c) => c.id)).size !== choices.length) problems.push(`${where} repeats an answer id.`);
      const b = it?.basis as Record<string, unknown> | undefined;
      const basis =
        b && typeof b.hash === "string" && typeof b.key === "string" && Array.isArray(b.sig)
          ? { hash: b.hash.slice(0, 40), key: b.key.slice(0, 40), sig: (b.sig as unknown[]).slice(0, 64).map((n) => Number(n) || 0) }
          : undefined;
      const ap = it?.approved as Record<string, unknown> | undefined;
      const og = it?.origin as Record<string, unknown> | undefined;
      const example = keep(it?.example, 1500);
      const sectionId = typeof it?.sectionId === "string" && ID.test(it.sectionId) ? it.sectionId : undefined;
      const source = keep(it?.source, 300);
      const note = keep(og?.note, 300);
      return {
        id: idOf(it?.id, where),
        kind: it?.kind === "spot" ? "spot" : "scenario",
        pageId: typeof it?.pageId === "string" ? it.pageId.slice(0, 80) : "",
        ...(sectionId && { sectionId }),
        prompt: keep(it?.prompt, 600),
        ...(example && { example }),
        choices,
        answer: typeof it?.answer === "string" ? it.answer.slice(0, 80) : "",
        explanation: keep(it?.explanation, 1500),
        status: it?.status === "approved" ? "approved" : it?.status === "retired" ? "retired" : "draft",
        ...(basis && { basis }),
        ...(ap &&
          typeof ap.by === "string" &&
          typeof ap.version === "string" && { approved: { by: ap.by.slice(0, 80), at: at(ap.at), version: ap.version.slice(0, 40) } }),
        ...(og &&
          typeof og.by === "string" && {
            origin: { kind: og.kind === "ai" ? ("ai" as const) : ("author" as const), by: og.by.slice(0, 80), at: at(og.at), ...(note && { note }) },
          }),
        ...(source && { source }),
      };
    });
    return { enabled: o.enabled === true, items };
  };

  let doc = (value ?? {}) as { schema?: unknown; sections?: unknown; pages?: unknown; audio?: unknown; review?: unknown; relay?: unknown; tags?: unknown };
  // Schema 1: one list of sections. It becomes a one-page course.
  if (doc.schema === 1 && Array.isArray(doc.sections))
    doc = {
      schema: GUIDE_SCHEMA,
      pages: [{ id: "page-1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: doc.sections }],
    };
  if (doc.schema !== GUIDE_SCHEMA) problems.push(`The guide uses schema ${String(doc.schema)}; this Hub reads schemas 1 and ${GUIDE_SCHEMA}.`);
  const raw = Array.isArray(doc.pages) ? doc.pages : [];
  const pages = raw.map((p: Record<string, unknown>, i: number) => page(p, i, raw.length > 1));
  if (!pages.length) unfinished("The guide needs at least one page.");
  if (pages.length > 30) problems.push("A course can have up to 30 pages.");
  const audio = audioSettings(doc.audio);
  const review = selfReview(doc.review);
  const relay = cleanRelayCourse(doc.relay);
  const tags = cleanTags(doc.tags);
  if (problems.length) throw new GuideDocError(problems);
  return {
    schema: GUIDE_SCHEMA,
    pages,
    ...(audio && { audio }),
    ...(review && (review.enabled || review.items.length) && { review }),
    ...(relay && { relay }),
    ...(tags && { tags }),
  };
}

export const pageBlocks = (page: Page) => page.sections.flatMap((s) => s.blocks);
export const allBlocks = (doc: GuideDoc) => doc.pages.flatMap(pageBlocks);
/** The page's title as learners see it: its own, or for a one-page guide the guide's. */
export const pageTitle = (doc: GuideDoc, page: Page, courseTitle: string) =>
  page.title || (doc.pages.length === 1 ? courseTitle : `Page ${doc.pages.indexOf(page) + 1}`);

/** The order of every block in the course, to check a paired block comes after the one it looks back at. */
const blockOrder = (doc: GuideDoc) => new Map(allBlocks(doc).map((b, i) => [b.id, i]));

/**
  Reflect and apply blocks' own checks. `blocks`: it stops publishing (a pair that's gone, or comes later);
  otherwise it's a suggestion (vague or uneven labels, a pair worded differently, a prompt that invites real
  client details).
*/
export function reflectChecks(b: Block, doc: GuideDoc): { text: string; blocks: boolean }[] {
  const out: { text: string; blocks: boolean }[] = [];
  const order = blockOrder(doc);
  const earlier = (id: string | undefined, type: Block["type"], what: string) => {
    if (!id) return undefined;
    const other = allBlocks(doc).find((x) => x.id === id);
    if (!other || other.type !== type)
      out.push({ text: `the ${what} it looks back at isn’t there any more. Choose another, or remove the link.`, blocks: true });
    else if ((order.get(other.id) ?? 0) >= (order.get(b.id) ?? 0))
      out.push({ text: `the ${what} it looks back at comes after it. Move this block later in the course.`, blocks: true });
    else return other;
    return undefined;
  };
  const personal = (text: string) =>
    /\b(a|your|one of your) (real |actual )?clients?('s)? (name|address|details)|name (the|a|your) client\b/i.test(text)
      ? out.push({ text: "the prompt seems to ask for a real client’s details. Ask for a fictional or de-identified example.", blocks: false })
      : 0;
  if (b.type === "journal") {
    earlier(b.revisits, "journal", "journal");
    personal(b.prompt);
  }
  if (b.type === "action") {
    earlier(b.revisits, "action", "action note");
    if (!b.revisits && b.suggestions.length === 1) out.push({ text: "offer 2 to 4 suggested actions, so there’s a real choice.", blocks: false });
    personal(b.prompt);
  }
  if (b.type === "perspectives") {
    if (b.after && !allBlocks(doc).some((x) => x.id === b.after))
      out.push({ text: "the response it follows isn’t there any more. Choose another, or show it on its own.", blocks: true });
    if (b.views.some((v) => !v.misses)) out.push({ text: "say what each perspective might miss, so none reads as the answer.", blocks: false });
    if (b.guidance && !b.guidance.source) out.push({ text: "link “What the guidance says” to its approved source.", blocks: false });
    if (b.guidance && !b.flag) out.push({ text: "flag the guidance to be verified by its policy owner before publishing.", blocks: false });
  }
  if (b.type === "pulse") {
    const labels = b.options.map((o) => o.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) out.push({ text: "two response labels are the same.", blocks: false });
    if (b.options.some((o) => o.label.trim().length < 2 || /^(ok|fine|maybe|other|n\/a)$/i.test(o.label.trim())))
      out.push({ text: "a response label is vague. Say what choosing it means.", blocks: false });
    if (b.kind === "confidence" && b.options.length < 3)
      out.push({ text: "a confidence scale reads better with 3 to 5 labels, evenly spaced from low to high.", blocks: false });
    const pair = earlier(b.compareWith, "pulse", "pulse check");
    if (pair && pair.type === "pulse") {
      if (pair.options.map((o) => o.label).join("|") !== b.options.map((o) => o.label).join("|"))
        out.push({
          text: "its response labels differ from the pulse check it’s paired with, so the change can’t be compared. Use the same labels.",
          blocks: true,
        });
      else if (pair.question.trim() !== b.question.trim())
        out.push({ text: "it’s worded differently from the pulse check it’s paired with. Check both ask about the same thing.", blocks: false });
    }
  }
  return out;
}

/**
  What stops a guide being published, and suggestions that don't. Required: everything filled in,
  unresolved verification flags, informative pictures without a description, video without captions or
  a transcript, a quiz without a learning path, and an assessed guide without a quiz.
  `signedOff`: blocks whose verification flag a reviewer has signed off, which no longer hold it up.
  `unverified`: the open verification flags among the blocking checks, by block.
*/
export function publishChecks(doc: GuideDoc, mode: CompletionMode, signedOff: Set<string> = new Set()) {
  const blocking: string[] = [];
  const unverified: { blockId: string; check: string }[] = [];
  const located: { blockId: string; pageId: string; check: string }[] = [];
  try {
    readGuideDoc(doc);
  } catch (e) {
    if (e instanceof GuideDocError) blocking.push(...e.problems);
    else throw e;
  }
  const suggestions: string[] = [];
  const many = doc.pages.length > 1;
  doc.pages.forEach((p, pi) => {
    const at = many ? `Page ${pi + 1}, ` : "";
    if (p.kind === "assessment" && !pageBlocks(p).some((b) => b.type === "quiz")) blocking.push(`${at}the assessment page needs a quiz.`);
    if (many && !p.title) blocking.push(`Page ${pi + 1} needs a title.`);
    // The Audio Guide: a recording must match its script; the rest are reminders.
    if (doc.audio && p.narration) {
      const state = narrationState(p.narration, pageSnapshot(p), doc.audio);
      const what = `${at || "The page’s "}narration`.replace(/^Page (\d+), narration$/, "Page $1’s narration");
      if (state === "rerecord") blocking.push(`${what}: the script or voice has changed since it was recorded. Record it again.`);
      if (state === "review") suggestions.push(`${what} may be out of date: the page has changed a lot since it was approved.`);
      if (state === "draft") suggestions.push(`${what}: approve the script (learners don’t hear it until it’s approved and recorded).`);
      if (state === "unrecorded") suggestions.push(`${what}: record the approved script.`);
      if (state === "pending") suggestions.push(`${what}: listen to the audio and approve it (learners don’t hear it until you do).`);
      if (state === "revoice") suggestions.push(`${what} was recorded in an earlier voice. Learners still hear it; make replacement audio when you’re ready.`);
      if (p.narration.next)
        suggestions.push(`${what}: a replacement is in progress. Learners keep hearing the current introduction until you approve the replacement.`);
    }
    p.sections.forEach((s) =>
      s.blocks.forEach((b, i) => {
        const before = blocking.length;
        const where = `${at}“${s.title}”, ${BLOCK_LABELS[b.type].toLowerCase()} ${i + 1}`;
        if (b.flag?.kind === "verify" && !signedOff.has(b.id)) {
          const check = `${where}: needs verification. ${b.flag.note}`.trim();
          blocking.push(check);
          unverified.push({ blockId: b.id, check });
        }
        if ((b.type === "image" || (b.type === "textMedia" && !b.video)) && !b.media.decorative && !b.media.alt)
          blocking.push(`${where}: describe the picture, or mark it decorative.`);
        if (b.type === "callout" && b.media?.src && !b.media.decorative && !b.media.alt)
          blocking.push(`${where}: describe the picture strip, or mark it decorative.`);
        // A video block, or the video in a text-and-media block: the same checks.
        const vid = b.type === "video" ? b : b.type === "textMedia" ? videoOf(b) : null;
        if (vid?.embed && !vid.captionsOnPlayer) blocking.push(`${where}: confirm the video has captions on ${EMBED_NAME[vid.embed.provider]}.`);
        if (vid && !vid.embed && !vid.captions) blocking.push(`${where}: add a captions file.`);
        if (vid && !vid.transcript) blocking.push(`${where}: add a transcript.`);
        if (vid?.recording && !vid.recording.consent) blocking.push(`${where}: confirm everyone who appears agreed, and nothing private is on screen.`);
        if (b.type === "image" && !b.media.caption) suggestions.push(`${where}: a caption helps readers see why the picture matters.`);
        if (b.type === "spot" && !b.media.decorative && !b.media.alt) blocking.push(`${where}: describe the picture for screen readers.`);
        if (b.type === "hotspots" && !b.media.alt) blocking.push(`${where}: describe the picture for screen readers.`);
        if (b.type === "sorting" && b.groups.some((g) => !b.items.some((it) => it.group === g.id)))
          suggestions.push(`${where}: every group usually has at least one item.`);
        if (
          b.type === "sorting"
            ? b.items.some((it) => !it.feedback)
            : (b.type === "sequencing" || b.type === "matching" || b.type === "fillblank") && !b.feedback
        )
          suggestions.push(`${where}: add feedback that explains the right answer, not just what it is.`);
        if ((PHOTO_BLOCKS as readonly string[]).includes(b.type)) {
          const m = (b as WithPhoto).media;
          if (m && !m.decorative && !m.alt) blocking.push(`${where}: describe the picture, or mark it decorative.`);
        }
        if (b.type === "flashcards")
          b.cards.forEach((c, j) => {
            if (c.media && !c.media.decorative && !c.media.alt) blocking.push(`${where}, card ${j + 1}: describe the picture, or mark it decorative.`);
          });
        if (b.type === "confidence" && b.compareWith && !allBlocks(doc).some((x) => x.id === b.compareWith && x.type === "confidence"))
          blocking.push(`${where}: the confidence check it compares with isn’t there any more.`);
        if (b.type === "reflection" && !b.guidance) suggestions.push(`${where}: add guidance on what a good answer covers, so Claude’s feedback is useful.`);
        // Reflect and apply: a pair must still be there, earlier in the course, and ask the same thing.
        for (const p of reflectChecks(b, doc)) (p.blocks ? blocking : suggestions).push(`${where}: ${p.text}`);
        // The AI Learning Guide: an approved script, and media made from it that someone has watched through.
        if (b.type === "guide") for (const p of guideChecks(b, doc)) (p.blocks ? blocking : suggestions).push(`${where}: ${p.text}`);
        if (b.type === "budget" && !b.flag) suggestions.push(`${where}: mark the budget Illustrative, so reviewers know the figures are made up.`);
        if (b.type === "accordion")
          b.items.forEach((it, j) => {
            if (it.media && !it.media.decorative && !it.media.alt) blocking.push(`${where}, item ${j + 1}: describe the picture, or mark it decorative.`);
          });
        if (b.type === "carousel")
          b.slides.forEach((sl, j) => {
            if (!sl.media.decorative && !sl.media.alt) blocking.push(`${where}, picture ${j + 1}: describe the picture, or mark it decorative.`);
          });
        for (const check of blocking.slice(before)) located.push({ blockId: b.id, pageId: p.id, check });
      }),
    );
  });
  if (doc.pages.length && !doc.pages.some((p) => p.required)) blocking.push("Make at least one page required.");
  const blocks = allBlocks(doc);
  if (mode === "assessed" && !blocks.some((b) => b.type === "quiz")) blocking.push("An assessed guide needs a quiz block.");
  if (mode === "decision" && !blocks.some((b) => b.type === "decision")) blocking.push("A decision activity guide needs at least one decision question.");
  if (!blocks.some((b) => b.type === "checklist" || b.type === "callout"))
    suggestions.push("Consider ending with key points or a checklist people can use at work.");
  // Self-review: approved questions for every reading page, none left behind by a page that changed.
  const practice = reviewChecks(doc);
  blocking.push(...practice.blocking);
  suggestions.push(...practice.suggestions);
  // Ava Relay: a page she's on needs its reason and its test answers reviewed.
  const relay = relayChecks(doc.relay, doc.pages);
  blocking.push(...relay.blocking);
  suggestions.push(...relay.suggestions);
  // Emphasised text: short phrases, a few to a page, in story text, never pointing at an answer (lib/emphasis).
  suggestions.push(...emphasisChecks(doc, (b) => BLOCK_LABELS[b.type].toLowerCase()));
  if (doc.audio?.intro) {
    const n = doc.audio.intro;
    if (n.status === "approved" && n.audio && narrationState({ ...n, basis: undefined }, { hash: "", key: "", sig: [] }, doc.audio) === "rerecord")
      blocking.push("The course introduction’s narration: the script or voice has changed since it was recorded. Record it again.");
  }
  return { blocking, suggestions, unverified, located };
}

/** The whole course: the pages' times added up. */
export const readingMinutes = (doc: GuideDoc) => doc.pages.reduce((n, p) => n + pageMinutes(p), 0) || 1;

/** About 200 words a minute, plus time to look at pictures and answer questions; at least one minute. */
export function pageMinutes(page: Page) {
  const words = (s?: string) => (s ? s.split(/\s+/).filter(Boolean).length : 0);
  let n = words(page.purpose);
  let extra = 0;
  for (const b of pageBlocks(page)) {
    if (b.type === "text" || b.type === "textMedia" || b.type === "callout") n += words(b.body) + words("heading" in b ? b.heading : undefined);
    if (b.type === "image" || b.type === "textMedia") extra += 0.2;
    if (b.type === "decision") {
      n += words(b.prompt) + words(b.context) + b.choices.reduce((a, c) => a + words(c.text), 0);
      extra += 0.75;
    }
    if (b.type === "checklist") n += b.items.reduce((a, c) => a + words(c), 0);
    if (b.type === "accordion") {
      n += words(b.heading) + b.items.reduce((a, it) => a + words(it.title) + words(it.body), 0);
      extra += 0.2 * b.items.filter((it) => it.media).length;
    }
    if (b.type === "carousel") extra += 0.2 * b.slides.length;
    if (b.type === "quiz") extra += 5;
    if (b.type === "flashcards") {
      n += b.cards.reduce((a, c) => a + words(c.front) + words(c.back), 0);
      extra += 0.2 * b.cards.length;
    }
    if (b.type === "tabs") n += b.tabs.reduce((a, t) => a + words(t.body), 0);
    if (b.type === "timeline") n += b.events.reduce((a, e) => a + words(e.title) + words(e.body), 0);
    if (b.type === "process") n += b.steps.reduce((a, st) => a + words(st.title) + words(st.body), 0);
    if (b.type === "branching") {
      n += b.scenes.reduce((a, sc) => a + words(sc.text) + sc.choices.reduce((x, c) => x + words(c.text), 0), 0) / 2;
      extra += 1.5;
    }
    if (b.type === "conversation") {
      n += b.turns.reduce((a, t) => a + words(t.line) + t.responses.reduce((x, r) => x + words(r.text), 0), 0);
      extra += 0.5 * b.turns.length;
    }
    if (b.type === "spot") extra += 2;
    if (b.type === "hotspots") n += b.spots.reduce((a, p) => a + words(p.title) + words(p.body), 0);
    if (b.type === "sorting") extra += 0.2 * b.items.length + 0.5;
    if (b.type === "sequencing") extra += 0.2 * b.steps.length + 0.5;
    if (b.type === "matching") extra += 0.2 * b.pairs.length + 0.5;
    if (b.type === "fillblank") n += words(b.text);
    if (b.type === "confidence") extra += 0.25;
    if (b.type === "journal") extra += b.minutes ?? 2;
    if (b.type === "guide") n += words(b.script);
    if (b.type === "perspectives")
      n += words(b.prompt) + b.views.reduce((a, v) => a + words(v.title) + words(v.reasoning) + words(v.misses), 0) + words(b.guidance?.body);
    if (b.type === "pulse") extra += 0.25;
    if (b.type === "action") extra += 1;
    if (b.type === "reflection") extra += 3;
    if (b.type === "budget") extra += 3;
    if (b.type === "signal") extra += 12;
    if (b.type === "mission") extra += 15;
    if (b.type === "balance") extra += 10;
    if (b.type === "xray") extra += 10;
    if (b.type === "reset") extra += 6;
    if (b.type === "line") extra += 10;
    if (b.type === "bridge") extra += 10;
    if (b.type === "journey") extra += 15;
    if (b.type === "benchmark") extra += 4;
    if (b.type === "myths") extra += b.tileIds.length;
    if (b.type === "baton") extra += 12;
    if (b.type === "redpen") extra += 8;
    if (b.type === "mentor") extra += b.count;
    if (b.type === "playbook") extra += 1;
    if (b.type === "auditor") extra += 10;
    if (b.type === "phonecall") extra += 6;
    if (b.type === "sandbox") extra += 12;
    if (b.type === "hiring") extra += 15;
    if (b.type === "onedaymap") extra += 20;
    if (b.type === "intake") extra += 20;
    if (b.type === "workload") extra += 20;
    if (b.type === "coverage") extra += 20;
    if (b.type === "referral") extra += 20;
    if (b.type === "reliability") extra += 20;
    if (b.type === "cashbridge") extra += 25;
    if (b.type === "casethread") extra += 12;
    if (b.type === "budgetlab") extra += 15;
    if (b.type === "hazardscan") extra += 5;
    if (b.type === "discharge") extra += 20;
    if (b.type === "network") extra += 20;
    if (b.type === "trustcheck") extra += 20;
    if (b.type === "referralstudio") extra += 10;
    if (b.type === "shadowcoach") extra += 25;
    if (b.type === "hubvisual") extra += b.visual === "client-journey" ? 5 : 2;
    if (b.type === "wall") extra += 2;
    if (b.type === "poll") extra += 0.5;
  }
  return Math.max(1, Math.round(n / 200 + extra));
}

/**
  A new page laid out for its teaching pattern: the sections in that pattern's order, each with the
  blocks it usually needs, ready to fill in. `id` makes ids unique within the course.
*/
export function templatePage(template: PageTemplate | "assessment", id: (prefix: string) => string): Page {
  const text = (): Block => ({ id: id("text"), type: "text", body: "" });
  const picture = (wide = false): Block => ({
    id: id("image"),
    type: "image",
    media: { src: "", alt: "" },
    width: wide ? "wide" : "column",
    ...(wide && { enlarge: true }),
  });
  const decision = (): Block => ({
    id: id("decision"),
    type: "decision",
    prompt: "",
    choices: [
      { id: id("c"), text: "", verdict: "best", feedback: "" },
      { id: id("c"), text: "", verdict: "risky", feedback: "" },
    ],
  });
  const callout = (style: CalloutBlock["style"], label?: string): Block => ({ id: id("callout"), type: "callout", style, ...(label && { label }), body: "" });
  const sec = (title: string, ...blocks: Block[]): Section => ({ id: id("s"), title, blocks });
  const outlines: Record<PageTemplate | "assessment", Section[]> = {
    decide: [
      sec("The situation", text()),
      sec("Who’s involved", { id: id("textmedia"), type: "textMedia", body: "", media: { src: "", alt: "" }, layout: "media-right" }),
      sec("What would you do?", decision()),
      sec("What happened next", callout("example", "What happened")),
      sec("The principle", callout("important", "The principle")),
      sec("Apply it elsewhere", text()),
    ],
    do: [
      sec("When you’ll do this", text()),
      sec("Step by step", text()),
      sec("A worked example", picture(true), text()),
      sec("A common mistake", callout("important", "Watch for")),
      sec("Quick practice", decision()),
      sec("Your job aid", { id: id("checklist"), type: "checklist", title: "", items: [""] }),
    ],
    notice: [
      sec("The example", picture(true)),
      sec("What to notice", text()),
      sec("Why it matters", text()),
      sec("Your turn", picture(true), decision()),
      sec("What you should have spotted", callout("tip", "What to look for")),
    ],
    adapt: [
      sec("What changed, and when", callout("important", "From"), text()),
      sec("Before and now", text()),
      sec("Who it affects", text()),
      sec("In a typical case", decision()),
      sec("Source and next step", callout("tip", "Next step")),
    ],
    say: [
      sec("What you’ll practise", text()),
      sec("The scene", text()),
      sec("The conversation", {
        id: id("conversation"),
        type: "conversation",
        person: "",
        role: "",
        setting: "",
        turns: [
          {
            id: id("turn"),
            line: "",
            responses: [
              { id: id("r"), text: "", verdict: "best", feedback: "", reply: "" },
              { id: id("r"), text: "", verdict: "risky", feedback: "", reply: "" },
            ],
          },
        ],
      }),
      sec("What worked", callout("tip", "Coaching")),
      sec("Phrases to take away", { id: id("checklist"), type: "checklist", title: "", items: [""] }),
    ],
    blank: [sec("Introduction", text())],
    assessment: [sec("Check your judgement", { id: id("quiz"), type: "quiz", pathId: "" })],
  };
  return {
    id: id("page"),
    title: template === "assessment" ? "Check your judgement" : "",
    purpose: "",
    template: template === "assessment" ? "blank" : template,
    kind: template === "assessment" ? "assessment" : "content",
    required: true,
    sections: outlines[template],
  };
}

/** The documents AI drafting reads a course from (the file picker's accept list). */
/** The working title of a course started from documents with no title yet: the AI outline proposes its real one. */
export const UNTITLED_COURSE = "Untitled course";

export const SOURCE_FILE_TYPES = ".pdf,.docx,.pptx,.txt,.md,.zip,application/pdf,text/plain,application/zip";
