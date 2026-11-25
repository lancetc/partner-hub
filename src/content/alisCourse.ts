import { ALIS_PART_1 } from "./alis/part1";
import { ALIS_PART_2 } from "./alis/part2";
import { ALIS_PART_3 } from "./alis/part3";

/*
  Aged Care Learning Information Solution (ALIS): incident management and the Serious Incident Response Scheme (SIRS),
  for Trilogy Care's home-care context (docs/alis-course.md).

  The ONE source for both forms of the course, in three parts. scripts/build-alis.ts turns each part into a draft
  Discovery Path of short-form Topics (one per module, with a 5-question, 100% path quiz), and the whole course into one
  draft long-form Magazine course in three chapters (a page per module with all the content and activities, each chapter
  ending in its part's path quiz), through the builders in lib/alisBuild.ts. Edit the course here, then re-run the script: it updates the drafts and never publishes.

  The material follows the structure, facts and learning points of the Aged Care Quality and Safety Commission's Alis
  modules, written in the Hub's own words. Statutory facts (timeframes, the eight reportable incident types, the six
  IMS elements, the four IMS components, Act and Rules references) are kept exact. Anything a reviewer must confirm
  carries `verify`: a Magazine "verify" flag (which holds publishing until it's signed off) and a Topic content check.

  The people in the scenarios are fictional. Names were checked against the character library so none clashes.
*/

/** A note for Quality review: what to confirm before this is published. */
export type Verify = string;

/** How a choice in a scenario reads, as in Magazine decision blocks. */
export type AlisVerdict = "best" | "acceptable" | "risky";

/** Reading content: a heading and rich text (lib/richText: **bold**, lists, links). Not an activity. */
export type AlisText = { kind: "text"; id: string; title: string; body: string; verify?: Verify };
/** Set apart: something important, an example or a "did you know". Not an activity. */
export type AlisCallout = { kind: "callout"; id: string; style: "important" | "example" | "tip"; label: string; body: string; verify?: Verify };

/** Source flip cards: a prompt or picture on the front, the point on the back. */
export type AlisFlip = { kind: "flip"; id: string; title: string; intro: string; cards: { front: string; back: string }[]; verify?: Verify };
/** Source "select the + icon" reveals: headings to open. */
export type AlisReveal = { kind: "reveal"; id: string; title: string; intro: string; items: { title: string; body: string }[]; verify?: Verify };
/** Source numbered carousels and timelines: steps in order. */
export type AlisSteps = { kind: "steps"; id: string; title: string; intro: string; steps: { title: string; body: string }[]; verify?: Verify };
/** Source tabs: a few sections side by side. */
export type AlisTabs = { kind: "tabs"; id: string; title: string; intro: string; tabs: { label: string; body: string }[]; verify?: Verify };
/** Source sorting and "which system?" questions: put each item in its group. */
export type AlisSort = {
  kind: "sort";
  id: string;
  title: string;
  prompt: string;
  groups: { id: string; label: string }[];
  items: { id: string; text: string; group: string; feedback: string }[];
  verify?: Verify;
};
/** Source scenarios ("Is this a reportable incident?", "Your first priority?"): a decision with feedback on every choice. */
export type AlisScenario = {
  kind: "scenario";
  id: string;
  title: string;
  context: string;
  prompt: string;
  choices: { id: string; text: string; verdict: AlisVerdict; feedback: string }[];
  verify?: Verify;
};
/** A job aid to tick through. */
export type AlisChecklist = { kind: "checklist"; id: string; title: string; intro: string; items: string[]; verify?: Verify };

/** Long form only: put the steps of a process in order (listed here in the right order; the reader shuffles them). */
export type AlisSequence = { kind: "sequence"; id: string; title: string; intro: string; prompt: string; steps: string[]; feedback: string; verify?: Verify };
/** Long form only: match each item on the left to its partner on the right. */
export type AlisMatch = {
  kind: "match";
  id: string;
  title: string;
  intro: string;
  prompt: string;
  pairs: { left: string; right: string }[];
  feedback: string;
  verify?: Verify;
};
/** Long form only: one thing to do at work, chosen from suggestions or written by the learner. Private to them. */
export type AlisCommit = { kind: "commit"; id: string; title: string; intro: string; prompt: string; suggestions: string[]; timing?: string; verify?: Verify };
/** Long form only: one of the Hub's Job Aids (content/playbooks.ts), placed where it's needed. */
export type AlisJobAid = { kind: "jobaid"; id: string; title: string; intro: string; snippetId: string; why: string; verify?: Verify };
/** Long form only: a What Would You Do? case thread (content/caseThreadCases.ts), by its id there. */
export type AlisCase = { kind: "case"; id: string; title: string; intro: string; caseId: string; verify?: Verify };
/** Long form only: a Spot the Hazard scene (content/hazardScenes.ts), by its id there. */
export type AlisHazard = { kind: "hazard"; id: string; title: string; intro: string; sceneId: string; verify?: Verify };

/** What a short Topic can hold: activities that ask the learner to do something, not just read. */
export type AlisTopicActivity = AlisSort | AlisScenario | AlisChecklist;
export const TOPIC_ACTIVITY_KINDS = ["sort", "scenario", "checklist"] as const;
export type AlisActivity =
  | AlisFlip
  | AlisReveal
  | AlisSteps
  | AlisTabs
  | AlisSort
  | AlisScenario
  | AlisChecklist
  | AlisSequence
  | AlisMatch
  | AlisCommit
  | AlisJobAid
  | AlisCase
  | AlisHazard;
export type AlisBlock = AlisText | AlisCallout | AlisActivity;
export const ACTIVITY_KINDS = [
  "flip",
  "reveal",
  "steps",
  "tabs",
  "sort",
  "scenario",
  "checklist",
  "sequence",
  "match",
  "commit",
  "jobaid",
  "case",
  "hazard",
] as const;
export const isActivity = (b: AlisBlock): b is AlisActivity => (ACTIVITY_KINDS as readonly string[]).includes(b.kind);
export const isTopicActivity = (b: AlisBlock): b is AlisTopicActivity => (TOPIC_ACTIVITY_KINDS as readonly string[]).includes(b.kind);

/**
  A knowledge-check question: single best answer, with feedback on every option. `from`: adapted from the module's own
  Alis knowledge check, adapted from a question asked inside the module's activities, or written new from the module's
  content to make five. `explain` says why the answer is right.
*/
export type AlisQuestion = {
  id: string;
  from: "knowledge check" | "module activity" | "new";
  prompt: string;
  options: { id: string; text: string; correct?: true; feedback: string }[];
  explain: string;
};

export type AlisModule = {
  part: 1 | 2 | 3;
  /** Its number within the part. */
  n: number;
  /** The Topic's stable address. */
  slug: string;
  title: string;
  summary: string;
  outcome: string;
  minutes: number;
  /** What the module covers, for the opening card and page. */
  explore: string[];
  /** The content can be confronting: show the support note. */
  sensitive?: boolean;
  blocks: AlisBlock[];
  /**
    The short form's own words. `brief`: the Topic's one reading card, the module in 80 to 140 words (rich text).
    `confidence`: a first-person statement a learner rates themselves against, in the Topic and at the end of the
    Magazine page ("I can tell a Priority 1 incident from a Priority 2 one").
  */
  short?: { brief: string; confidence: string };
  keyPoints: string[];
  /** Five questions on the module, with feedback on every option: the Magazine's practice questions (Test myself). */
  quiz: AlisQuestion[];
};

/** Every path quiz: 5 questions drawn across the part's Topics, all 5 right (100%) to pass, up to 5 tries. */
export const ALIS_PASS_MARK = 100;
export const ALIS_QUESTIONS = 5;
export const ALIS_PATH_QUIZ = { questions: ALIS_QUESTIONS, passMark: ALIS_PASS_MARK, attempts: 5 };

/**
  The short-form Topic for each module: its activity (one that asks the learner to do something: a scenario, a sort or
  a checklist), and the two questions of its quick check (which also feed its part's path quiz). `text`: the reading
  card a module without a `short.brief` keeps instead. Everything else is Magazine only.
*/
export type AlisTopicCut = { text?: string; activity: string; quick: [string, string] };
export const ALIS_TOPIC_CUT: Record<string, AlisTopicCut> = {
  "alis-p1-introduction-to-the-sirs": { text: "priorities", activity: "try-priority", quick: ["q3", "q4"] },
  "alis-p1-what-is-an-ims": { activity: "try-it", quick: ["q1", "q2"] },
  "alis-p1-creating-an-ims": { activity: "try-it", quick: ["q1", "q4"] },
  "alis-p1-implementing-your-ims": { text: "culture", activity: "try-it", quick: ["q2", "q5"] },
  "alis-p1-complaints-and-your-ims": { activity: "which-system", quick: ["q3", "q5"] },
  "alis-p2-responding-to-incidents": { activity: "immediate", quick: ["q2", "q3"] },
  "alis-p2-recording-incidents": { activity: "asterisk", quick: ["q3", "q4"] },
  "alis-p2-analysing-incidents": { activity: "factors", quick: ["q1", "q2"] },
  "alis-p2-implementing-actions": { activity: "goals", quick: ["q3", "q4"] },
  "alis-p2-closing-the-loop": { activity: "janie", quick: ["q3", "q4"] },
  "alis-p3-restrictive-practice": { text: "reportable", activity: "barry", quick: ["q1", "q5"] },
  "alis-p3-unexplained-absence": { text: "definition", activity: "marleen", quick: ["q1", "q4"] },
  "alis-p3-neglect": { text: "definition", activity: "hazel", quick: ["q1", "q5"] },
  "alis-p3-psychological-abuse": { activity: "albert", quick: ["q1", "q2"] },
  "alis-p3-stealing-financial-coercion": { text: "missing", activity: "liane", quick: ["q1", "q5"] },
  "alis-p3-unexpected-death": { text: "definition", activity: "poppy", quick: ["q1", "q4"] },
  "alis-p3-sexual-contact-or-conduct": { text: "definition", activity: "lucy", quick: ["q1", "q3"] },
  "alis-p3-unreasonable-use-of-force": { text: "definition", activity: "laila", quick: ["q1", "q5"] },
  "alis-p3-sirs-in-practice": { activity: "culture", quick: ["q1", "q5"] },
};
/** A sort in a short Topic shows at most this many items (one card each). */
export const ALIS_TOPIC_SORT_ITEMS = 3;

export const ALIS_COURSE = {
  /** The programme name, and the Magazine course's title. Each part is its own Discovery Path and a chapter of the course. */
  title: "Aged Care Learning Information Solution (ALIS)",
  standfirst:
    "Incident management and the Serious Incident Response Scheme (SIRS) for Support at Home, where older people get their care in their own homes and communities, in three chapters: building your incident management system, managing an incident from start to finish, and recognising and reporting incidents in home care.",
  reviewDate: "2027-05-24",
  owner: "Quality and Compliance",
};

const HOME_COVER = {
  src: "/images/hero-notes-at-table.webp",
  width: 1914,
  height: 822,
  position: "80% 30%",
  alt: "A woman smiling as she writes notes beside her laptop at a wooden kitchen table",
};

/**
  The three parts: each one a Discovery Path of short Topics, and a chapter of the long-form Magazine course.
  `description`: a line on what the part covers: the Magazine chapter's introduction, and the Discovery Path's
  description. `intro`: the Discovery Path's Discovery Exciter (docs/discovery-exciter.md), written to be heard, 70 to
  130 words; the builder seeds it as a draft for an author to approve and record.
*/
export const ALIS_PARTS = [
  {
    n: 1 as const,
    title: "SIRS 1: Building your incident management system",
    short: "Incident management systems",
    description: "The SIRS in Support at Home, what an incident management system (IMS) is, creating and implementing one, and how complaints and feedback connect to it.",
    intro:
      "When something goes wrong in someone’s care, what happens next? Does it get noticed, dealt with and learned from, or quietly forgotten? Every incident is a chance to keep someone safer, and that’s what an incident management system is for. In this Discovery Path, you’ll find out what the Serious Incident Response Scheme is, and what a good incident management system looks like, from its four components and six elements to the leadership, culture and training that make it work. You’ll also explore when a complaint needs to be managed as an incident too. Five short topics, then a five-question quiz. You’ll need all five right, so take your time.",
    standfirst:
      "Part 1 of ALIS, the Aged Care Learning Information Solution, for Support at Home. Why incident management matters when care happens in people's own homes, the SIRS, the four components and six elements of an incident management system, and how complaints feed into it.",
    whoFor: "Everyone at Trilogy Care who supports older people at home or in the community, and the people who lead them. Start here.",
    outcomes: [
      "Explain the SIRS and when a reportable incident must be notified to the Commission",
      "Describe the four components and six essential elements of an incident management system",
      "Explain how leadership, a safety culture and training make an IMS work",
      "Decide when a complaint also needs to be managed as an incident",
    ],
    cover: HOME_COVER,
  },
  {
    n: 2 as const,
    title: "SIRS 2: Managing an incident from start to finish",
    short: "Using your incident management system",
    description: "Follow one incident in a client's home through the IMS: responding, recording, analysing, implementing actions and closing the loop.",
    intro:
      "Something has happened. What now? Looking after the person comes first, but that’s only the beginning. In this Discovery Path, you’ll follow one incident all the way through, from the first response to closing the loop. You’ll see how to look after the people affected, with open disclosure, then record what happened so patterns can be spotted, work out why it happened and whether to investigate, and choose actions that actually stick. Finally, you’ll check those actions worked and share the outcome. Five short topics, then a five-question quiz. You’ll need all five right to finish, and you can try again if you need to.",
    standfirst:
      "Part 2 of ALIS, the Aged Care Learning Information Solution, for Support at Home. Follow one incident in a client's home through the incident management system, from the first response to closing the loop.",
    whoFor: "Everyone at Trilogy Care who responds to, records or follows up incidents. Best after SIRS 1.",
    outcomes: [
      "Respond to an incident by looking after the people affected first, with open disclosure",
      "Record an incident with the details the IMS needs, and spot patterns",
      "Analyse an incident and decide whether to investigate",
      "Choose actions, evaluate them, and close the loop",
    ],
    cover: HOME_COVER,
  },
  {
    n: 3 as const,
    title: "SIRS 3: Recognising and reporting incidents in home care",
    short: "SIRS in Home Services",
    description: "The eight reportable incident types as they apply in Support at Home, in people's homes and out in the community, Priority 1 and 2, and SIRS in practice.",
    intro:
      "Would you know a reportable incident if you saw one in someone’s home? It isn’t always obvious, and it doesn’t always look the way you’d expect. This Discovery Path walks you through all eight reportable incident types under the SIRS, as they show up in home and community care, from unexplained absence to neglect. For each one, you’ll see what to look for, what to do first, and whether it’s Priority 1 or Priority 2. Then you’ll bring it all together with the SIRS in practice. Nine short topics, then a five-question quiz. You’ll need all five right, because getting this right really matters.",
    standfirst:
      "Part 3 of ALIS, the Aged Care Learning Information Solution, for Support at Home. The eight reportable incident types as they apply in people's homes and in the community: what to look for, what to do first, and how each is reported.",
    whoFor: "Everyone at Trilogy Care who supports older people at home or in the community. Best after SIRS 1 and 2.",
    outcomes: [
      "Recognise each of the eight reportable incident types in a home or community setting",
      "Put the older person's safety and wellbeing first, then escalate, record and report",
      "Decide whether an incident is Priority 1 or Priority 2, and its timeframe",
      "Apply the six elements of an IMS to an incident from start to finish",
    ],
    cover: {
      src: "/images/journey-ongoing-care.webp",
      width: 1376,
      height: 768,
      position: "50% 40%",
      alt: "A support worker wiping down a kitchen bench while chatting with an older woman in her home",
    },
  },
];

/** Where the course's facts come from. Credited on every module; links to be checked by Quality before publishing. */
export const ALIS_SOURCES = [
  {
    title: "Reportable incidents and Serious Incident Response Scheme (SIRS): provider guidelines",
    url: "https://www.agedcarequality.gov.au/sites/default/files/media/reportable_incidents_and_sirs_provider_guidelines.pdf",
    source: "Aged Care Quality and Safety Commission",
    description: "The Commission's guidelines on incident management and reportable incidents, including home and community settings.",
  },
  {
    title: "Serious Incident Response Scheme",
    url: "https://www.agedcarequality.gov.au/providers/serious-incident-response-scheme",
    source: "Aged Care Quality and Safety Commission",
    description:
      "The Commission's SIRS pages: fact sheets for each incident type, best practice guidance for incident management systems, and notifying the Commission.",
  },
  {
    title: "Alis: the Commission's learning platform",
    url: "https://www.agedcarequality.gov.au",
    source: "Aged Care Quality and Safety Commission",
    description: "This course follows the structure and learning points of the Commission's Alis modules on incident management and the SIRS.",
  },
  {
    title: "Statement of Rights",
    url: "https://www.agedcarequality.gov.au/older-people/your-rights/statement-rights",
    source: "Aged Care Quality and Safety Commission",
    description: "The rights of older people receiving funded aged care services under the Aged Care Act 2024.",
  },
];

export const ALIS_SOURCES_NOTE =
  "Based on the Aged Care Quality and Safety Commission's Alis modules on incident management and the Serious Incident Response Scheme, and its SIRS guidelines for providers. General guidance only: Trilogy Care's own incident management procedures apply, under the Aged Care Act 2024 and the Aged Care Rules 2025.";

/** Shown on modules whose content can be confronting. */
export const ALIS_SUPPORT_NOTE =
  "Some of this module may be confronting. You can stop and come back at any time. If you need support, talk to your manager, use your Employee Assistance Program, or call Lifeline on 13 11 14.";

export const ALIS_MODULES: AlisModule[] = [...ALIS_PART_1, ...ALIS_PART_2, ...ALIS_PART_3];

/** "1.3": the module's place in the course. */
export const moduleNumber = (m: Pick<AlisModule, "part" | "n">) => `${m.part}.${m.n}`;
/** "p1m3": a short key for ids. */
export const moduleKey = (m: Pick<AlisModule, "part" | "n">) => `p${m.part}m${m.n}`;
