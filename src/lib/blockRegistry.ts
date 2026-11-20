import type { BlockType } from "./magazine";

/*
  The block capability registry (docs/learning-designer.md): what each implemented Magazine block is for, in terms
  an author can search by purpose, and the versioned activity contract behind it: what the learner does, which
  barriers it can plausibly address, what it needs, what evidence it produces and how, and who has to sign it off.

  It is the only place a recommendation can draw from, so nothing unimplemented can be suggested. A test holds it
  to the real block list: every block type has exactly one contract.

  Recommendations here are rules, not a model: filter by what can actually be built, rank by the diagnosed barrier
  and the action to practise, and say why in a structure a person can read and change. Practice can't fix a barrier
  of access or workflow, and the recommender says so rather than papering over it.
*/

export const LEARNER_ACTIONS = {
  explain: "Read or watch an explanation",
  explore: "Explore the detail",
  notice: "Spot a signal",
  decide: "Make a decision",
  converse: "Practise a conversation",
  task: "Work through a task",
  recall: "Check recall",
  reflect: "Reflect and apply",
  share: "Compare with peers",
} as const;
export type LearnerAction = keyof typeof LEARNER_ACTIONS;

/** A simple diagnostic lens (capability, opportunity, motivation). Prompts for investigation, never a diagnosis by themselves. */
export const LENSES = { capability: "Capability", opportunity: "Opportunity", motivation: "Motivation" } as const;
export type Lens = keyof typeof LENSES;
export const BARRIERS = {
  knowledge: { lens: "capability", label: "Doesn’t know the rule, fact or process", learnable: true },
  skill: { lens: "capability", label: "Knows it, but can’t yet do it reliably", learnable: true },
  judgement: { lens: "capability", label: "Unsure how to apply it to a real case", learnable: true },
  attention: { lens: "capability", label: "Overlooks the detail at the moment of work", learnable: true },
  confidence: { lens: "motivation", label: "Lacks the confidence to act or speak up", learnable: true },
  priorities: { lens: "motivation", label: "Doesn’t see why it matters, or other priorities win", learnable: true },
  habit: { lens: "motivation", label: "An old habit or local workaround", learnable: true },
  cue: { lens: "opportunity", label: "No prompt or reference at the point of work", learnable: true },
  access: { lens: "opportunity", label: "Can’t get to the record, tool, time or permission", learnable: false },
  workflow: { lens: "opportunity", label: "The process or system gets in the way", learnable: false },
} as const satisfies Record<string, { lens: Lens; label: string; learnable: boolean }>;
export type Barrier = keyof typeof BARRIERS;

/** The evidence a block can produce. None is inferred from the one below it, and none is proof of work improving. */
export const EVIDENCE = {
  accessed: "Accessed",
  completed: "Completed",
  practised: "Practised with feedback",
  assessed: "Met an approved assessment criterion",
} as const;
export type EvidenceLevel = keyof typeof EVIDENCE;

export type ActivityContract = {
  type: BlockType;
  version: number;
  action: LearnerAction;
  /** What the learner does, in plain words. */
  purpose: string;
  /** Phrases an author might search by. */
  goodFor: string[];
  barriers: Barrier[];
  poorFit: string;
  /** The closest Topic card, where one exists. Topics can't hold Magazine blocks. */
  topicCard: string | null;
  /** What the author must supply. An artefact or a reviewed source can't be generated. */
  inputs: string[];
  evidence: EvidenceLevel;
  completion: string;
  scoring: "none" | "feedback" | "self" | "rubric" | "question pool";
  retry: string;
  events: string[];
  accessible: string;
  visibility: "nothing stored" | "private to the learner" | "authors see totals only" | "shared with peers, moderated";
  /** Who signs it off before it can be published. Empty for none. */
  signoff: string;
  minutes: number;
};

type Short = Omit<ActivityContract, "type" | "version" | "topicCard" | "retry" | "accessible" | "signoff" | "events" | "visibility"> &
  Partial<Pick<ActivityContract, "topicCard" | "retry" | "accessible" | "signoff" | "events" | "visibility">>;
const c = (type: BlockType, s: Short): ActivityContract => ({
  version: 1,
  topicCard: null,
  retry: s.scoring === "none" ? "Nothing to retry" : "Can be done again; each try is kept separately",
  accessible: "Keyboard and screen reader, with every choice and result in text",
  signoff: "",
  events: s.evidence === "accessed" ? ["page.opened"] : [`${type}.done`],
  visibility: s.evidence === "accessed" ? "nothing stored" : "authors see totals only",
  ...s,
  type,
});
const read = (type: BlockType, purpose: string, goodFor: string[], minutes: number, more: Partial<Short> = {}): ActivityContract =>
  c(type, {
    action: "explain",
    purpose,
    goodFor,
    barriers: ["knowledge"],
    poorFit: "When people already know it but don’t do it: more explanation won’t change that.",
    inputs: ["An approved source for any rule or fact it states"],
    evidence: "accessed",
    completion: "Read-only: opening the page is all that’s recorded",
    scoring: "none",
    minutes,
    ...more,
  });

export const BLOCK_REGISTRY: ActivityContract[] = [
  // Content
  read("text", "Reads an explanation", ["explain a rule", "background", "what changed", "reference"], 2),
  read("image", "Looks at a picture or diagram", ["show what it looks like", "diagram"], 1, { inputs: ["A picture with a description"] }),
  read("textMedia", "Reads an explanation beside a picture or video", ["explain with an example", "show and tell"], 2),
  read("video", "Watches a short video", ["demonstrate a task", "hear it from a person", "walkthrough"], 3, {
    inputs: ["A video with captions"],
    completion: "Watched to the end, when the video is hosted on the Hub",
    evidence: "completed",
    events: ["video.started", "video.half", "video.finished"],
    visibility: "authors see totals only",
  }),
  read("callout", "Reads one thing that must not be missed", ["key warning", "must know", "confirm you’ve read it"], 1, {
    completion: "Ticked to confirm, when the author asks for it",
    events: ["callout.confirmed"],
  }),
  read("guide", "Listens to a short narrated introduction to the page", ["set the scene", "orient new starters"], 1, {
    inputs: ["An approved script"],
    signoff: "A person approves the script before it plays",
    events: ["guide.started", "guide.completed"],
  }),
  c("playbook", {
    action: "task",
    purpose: "Follows the current approved steps of a procedure, with a route to urgent help",
    goodFor: ["job aid", "steps at the point of work", "procedure", "what to do first", "escalation route", "checklist in the workflow"],
    barriers: ["cue", "knowledge"],
    poorFit: "When the procedure itself is disputed or not yet approved.",
    inputs: ["An approved SOP section, its owner, and the contact routes"],
    evidence: "accessed",
    completion: "Reference: reading it finishes nothing. An owner can ask for an acknowledgement.",
    scoring: "none",
    signoff: "Policy owner; Clinical and Quality for safety-critical procedures",
    events: ["playbook viewed", "playbook acknowledged"],
    visibility: "authors see totals only",
    minutes: 2,
  }),
  // Explore
  read("accordion", "Opens sections to read the detail they need", ["lots of detail", "FAQ", "look things up"], 3, {
    action: "explore",
    topicCard: "resources",
  }),
  read("tabs", "Switches between a few views of the same thing", ["compare options", "by role", "before and after"], 2, { action: "explore" }),
  read("carousel", "Steps through a short series of pictures", ["a sequence of screens", "visual walkthrough"], 2, {
    action: "explore",
    inputs: ["Two or more pictures"],
  }),
  read("timeline", "Follows events in order", ["what happens when", "key dates", "a process over time"], 2, { action: "explore" }),
  c("process", {
    action: "task",
    purpose: "Works through the steps of a task in order",
    goodFor: ["step by step", "how to do a task", "procedure walkthrough"],
    barriers: ["knowledge", "skill"],
    poorFit: "When the steps vary case by case: use a scenario instead.",
    inputs: ["The approved steps"],
    evidence: "completed",
    completion: "Every step opened",
    scoring: "none",
    minutes: 3,
  }),
  c("hotspots", {
    action: "explore",
    purpose: "Explores the parts of a picture, form or screen",
    goodFor: ["parts of a form", "where to find it on screen", "label a document"],
    barriers: ["knowledge", "attention"],
    poorFit: "When there’s no real artefact to look at.",
    inputs: ["A picture of the form, document or screen"],
    evidence: "completed",
    completion: "Every hotspot opened",
    scoring: "none",
    topicCard: "hotspot",
    accessible: "Each hotspot is also a labelled button in a list",
    minutes: 3,
  }),
  c("journey", {
    action: "explore",
    purpose: "Follows one person’s Support at Home journey through each role’s eyes, with decisions along the way",
    goodFor: ["the whole pathway", "who does what", "see it from the family’s side"],
    barriers: ["knowledge", "judgement", "priorities"],
    poorFit: "For a single narrow rule: it’s a long activity.",
    inputs: ["A reviewed story with its decisions and consent facts"],
    evidence: "practised",
    completion: "Every milestone explored and decided",
    scoring: "feedback",
    signoff: "Clinical, Care Operations, Finance and Quality",
    minutes: 15,
  }),
  c("reset", {
    action: "converse",
    purpose: "Rewrites what to say when a family’s expectation and the timeline don’t match",
    goodFor: ["manage expectations", "waiting times", "what to tell a family"],
    barriers: ["skill", "confidence"],
    poorFit: "When the delay itself is the problem to fix.",
    inputs: ["A reviewed timeline and scripts"],
    evidence: "practised",
    completion: "Every moment worked through",
    scoring: "feedback",
    signoff: "Care Operations, Quality, Privacy and Communications",
    minutes: 6,
  }),
  c("myths", {
    action: "recall",
    purpose: "Flips common client questions to see a short, approved answer",
    goodFor: ["common misconceptions", "questions clients ask", "quick answers to say"],
    barriers: ["knowledge", "confidence"],
    poorFit: "When the answer depends on the person’s circumstances.",
    inputs: ["Reviewed tiles from the Myth vs Reality library"],
    evidence: "completed",
    completion: "The tiles shown have been flipped",
    scoring: "none",
    signoff: "Tiles are reviewed in the library",
    minutes: 3,
  }),
  // Practise
  c("flashcards", {
    action: "recall",
    purpose: "Recalls terms or facts from memory",
    goodFor: ["remember terms", "definitions", "acronyms"],
    barriers: ["knowledge"],
    poorFit: "For judgement: recalling a definition doesn’t show someone can apply it.",
    inputs: ["Terms and approved definitions"],
    evidence: "completed",
    completion: "Every card turned",
    scoring: "self",
    minutes: 2,
  }),
  c("sorting", {
    action: "decide",
    purpose: "Sorts items into the right groups",
    goodFor: ["which category", "included or not", "in scope or out of scope", "classify"],
    barriers: ["knowledge", "judgement"],
    poorFit: "When items genuinely depend on context the card can’t show.",
    inputs: ["Items with an approved right group and a reason for each"],
    evidence: "practised",
    completion: "Every item placed and checked",
    scoring: "feedback",
    accessible: "Each item also has a menu to choose its group",
    minutes: 3,
  }),
  c("matching", {
    action: "recall",
    purpose: "Matches pairs, such as a term to its meaning",
    goodFor: ["match terms", "who does what", "pair a form to its use"],
    barriers: ["knowledge"],
    poorFit: "For decisions with consequences.",
    inputs: ["Pairs with an approved match"],
    evidence: "practised",
    completion: "Every pair matched",
    scoring: "feedback",
    accessible: "Each item also has a menu to choose its match",
    minutes: 2,
  }),
  c("sequencing", {
    action: "task",
    purpose: "Puts the steps of a task in order",
    goodFor: ["order of steps", "what comes first", "sequence a process"],
    barriers: ["knowledge", "skill"],
    poorFit: "When the order doesn’t matter in practice.",
    inputs: ["The approved order"],
    evidence: "practised",
    completion: "Order checked",
    scoring: "feedback",
    accessible: "Move up and move down buttons on every step",
    minutes: 2,
  }),
  c("spot", {
    action: "notice",
    purpose: "Finds the mistakes in a document or picture",
    goodFor: ["find the error", "check a document", "what’s wrong with this invoice"],
    barriers: ["attention", "skill"],
    poorFit: "When there’s no realistic artefact, or the errors are matters of opinion.",
    inputs: ["A fictional document or picture with known mistakes"],
    evidence: "practised",
    completion: "Every mistake found or revealed",
    scoring: "feedback",
    accessible: "Each mistake is also a labelled button in a list",
    minutes: 3,
  }),
  c("fillblank", {
    action: "recall",
    purpose: "Completes a sentence with the missing words",
    goodFor: ["recall a phrase", "key wording", "complete the rule"],
    barriers: ["knowledge"],
    poorFit: "For anything beyond exact wording.",
    inputs: ["A sentence with approved answers"],
    evidence: "practised",
    completion: "Every blank answered and checked",
    scoring: "feedback",
    minutes: 2,
  }),
  c("decision", {
    action: "decide",
    purpose: "Chooses what to do in a short situation, and sees why each choice is or isn’t right",
    goodFor: ["what would you do", "choose a response", "decide when to escalate", "apply a rule to a case"],
    barriers: ["judgement", "knowledge"],
    poorFit: "When the real barrier is finding the information, not deciding.",
    inputs: ["A realistic situation", "Choices with feedback for each, checked against approved guidance"],
    evidence: "practised",
    completion: "Answered",
    scoring: "question pool",
    retry: "The first answer is kept; later tries are recorded separately",
    topicCard: "decision",
    events: ["decision.answered"],
    minutes: 2,
  }),
  c("line", {
    action: "decide",
    purpose: "Decides, request by request, whether something is within the role’s scope",
    goodFor: ["scope of practice", "can I do this", "boundaries", "where is the line"],
    barriers: ["judgement", "confidence"],
    poorFit: "For roles whose scope isn’t yet agreed.",
    inputs: ["Reviewed cases with approved answers"],
    evidence: "practised",
    completion: "Every card answered",
    scoring: "feedback",
    signoff: "Clinical and policy owners, card by card",
    minutes: 8,
  }),
  c("redpen", {
    action: "task",
    purpose: "Marks up a care plan or progress note, then rewrites it",
    goodFor: ["write a better note", "documentation quality", "critique a care plan"],
    barriers: ["skill", "attention"],
    poorFit: "When the note template itself is the problem.",
    inputs: ["A fictional document and a reviewed rewrite"],
    evidence: "practised",
    completion: "Marked, rewritten and compared",
    scoring: "rubric",
    signoff: "Clinical, Quality and Privacy",
    minutes: 10,
  }),
  c("checklist", {
    action: "task",
    purpose: "Ticks off the checks for a task",
    goodFor: ["checklist", "before you approve", "things to check", "job aid"],
    barriers: ["cue", "habit", "attention"],
    poorFit: "As the only response when people can’t reach what they need to check.",
    inputs: ["The approved checks"],
    evidence: "completed",
    completion: "Every item ticked",
    scoring: "none",
    topicCard: "checklist",
    minutes: 2,
  }),
  c("quiz", {
    action: "recall",
    purpose: "Answers governed questions against a pass mark",
    goodFor: ["assessed", "prove they know the rule", "pass mark", "compliance check"],
    barriers: ["knowledge"],
    poorFit: "As a stand-in for a better conversation or decision at work.",
    inputs: ["Approved Question Pool questions, pinned to a version"],
    evidence: "assessed",
    completion: "Passed",
    scoring: "question pool",
    retry: "Attempts are recorded separately; first and latest results are kept apart",
    topicCard: "quiz",
    signoff: "Question Pool approval for every question",
    events: ["assessment attempted", "assessment passed"],
    minutes: 5,
  }),
  // Simulate
  c("branching", {
    action: "decide",
    purpose: "Makes a run of decisions in a scenario, each changing what happens next",
    goodFor: ["consequences of choices", "a scenario that unfolds", "decide under pressure"],
    barriers: ["judgement", "priorities"],
    poorFit: "For a single decision: a decision question is quicker.",
    inputs: ["A scenario with scenes, choices and at least one ending"],
    evidence: "practised",
    completion: "An ending reached",
    scoring: "feedback",
    minutes: 6,
  }),
  c("conversation", {
    action: "converse",
    purpose: "Practises what to say to a person, by choosing responses or in their own words",
    goodFor: ["difficult conversation", "respond respectfully", "what to say to a client", "de-escalate"],
    barriers: ["skill", "confidence"],
    poorFit: "When what to say depends on a policy that isn’t settled.",
    inputs: ["A person, a setting and turns with coaching; a reviewed scene for free conversation"],
    evidence: "practised",
    completion: "The conversation reached an end and the debrief was read",
    scoring: "feedback",
    topicCard: "response",
    accessible: "Typing is always equivalent to speaking; every line is on the page as text",
    visibility: "private to the learner",
    minutes: 6,
  }),
  c("phonecall", {
    action: "converse",
    purpose: "Takes a difficult call, using simulated case tools, and gets a debrief in their own words",
    goodFor: ["phone call", "complaint call", "angry family member", "privacy on the phone", "missed visit call"],
    barriers: ["skill", "judgement", "confidence"],
    poorFit: "When the internal workflow the call depends on isn’t approved yet.",
    inputs: ["A reviewed scene, a case file, restricted details and a dated policy pack"],
    evidence: "practised",
    completion: "The call ended and the debrief was read",
    scoring: "rubric",
    signoff: "Care Operations, Quality and Privacy; Finance for a billing call",
    accessible: "Typed or spoken; case tools are buttons with text results",
    visibility: "private to the learner",
    minutes: 7,
  }),
  c("signal", {
    action: "notice",
    purpose: "Reads ordinary updates about one client, spots what matters and makes the first safe decision",
    goodFor: ["spot a change", "recognise a reportable incident", "notice a risk", "what needs attention"],
    barriers: ["attention", "judgement"],
    poorFit: "For teaching a rule people simply haven’t been told.",
    inputs: ["A reviewed case with its signals and regulatory answer"],
    evidence: "practised",
    completion: "The case worked through to its debrief",
    scoring: "rubric",
    signoff: "Clinical and Quality, with the source version",
    minutes: 12,
  }),
  c("mission", {
    action: "task",
    purpose: "Runs a participant’s first 30 days: what to do, in what order, and what to tell them",
    goodFor: ["onboarding a client", "first 30 days", "plan the work", "prioritise tasks"],
    barriers: ["skill", "judgement", "priorities"],
    poorFit: "For a single step of onboarding.",
    inputs: ["A reviewed case, dates and statement rules"],
    evidence: "practised",
    completion: "Day 30 closed with everything owned",
    scoring: "rubric",
    signoff: "Compliance and the teams that own the dates",
    minutes: 15,
  }),
  c("balance", {
    action: "decide",
    purpose: "Weighs a person’s choice against the risks, and agrees a plan with them",
    goodFor: ["dignity of risk", "respect a choice", "balance safety and independence"],
    barriers: ["judgement", "confidence"],
    poorFit: "Where the person’s decision-making is itself in question.",
    inputs: ["A reviewed situation, cards and criteria"],
    evidence: "practised",
    completion: "A plan agreed and explained",
    scoring: "rubric",
    signoff: "Clinical, Quality and Care Operations",
    minutes: 10,
  }),
  c("xray", {
    action: "notice",
    purpose: "Reads a quote or receipt line by line and decides what each line is for this participant",
    goodFor: ["check an invoice", "eligible or excluded", "what can be claimed", "grey-area items"],
    barriers: ["judgement", "attention", "knowledge"],
    poorFit: "When the question is whether the invoice matches an agreement: use the Document Auditor.",
    inputs: ["A fictional quote or receipt and a reviewed answer for each line"],
    evidence: "practised",
    completion: "Lines sorted, the split checked and the explanation written",
    scoring: "rubric",
    signoff: "Finance, Care Operations and Quality",
    minutes: 10,
  }),
  c("auditor", {
    action: "notice",
    purpose: "Inspects a contractor pack or invoice against trusted records, marks the evidence, and decides Approve, Query or Reject",
    goodFor: ["rate mismatch", "compare an invoice with the agreement", "vet a contractor", "expired insurance", "line-level check"],
    barriers: ["attention", "skill", "judgement"],
    poorFit: "When people can’t find the agreement to compare against: that’s an access problem.",
    inputs: ["Fictional documents, comparison records, dated rules and an answer key"],
    evidence: "practised",
    completion: "A reasoned decision submitted and the debrief read",
    scoring: "rubric",
    signoff: "Compliance or Finance, Care Operations and Quality",
    accessible: "A table of every field does the same job as the document view",
    minutes: 10,
  }),
  c("bridge", {
    action: "task",
    purpose: "Works out what interim support costs while someone waits, and writes the family a summary",
    goodFor: ["waiting for funding", "interim support", "explain private costs"],
    barriers: ["knowledge", "skill"],
    poorFit: "When figures or status language aren’t signed off.",
    inputs: ["Reviewed figures and status wording"],
    evidence: "practised",
    completion: "Checked and summarised",
    scoring: "feedback",
    signoff: "Operations, Finance, Quality, Privacy and Communications",
    minutes: 10,
  }),
  c("baton", {
    action: "task",
    purpose: "Hands a case from role to role, passing on what the next person needs",
    goodFor: ["handover", "who follows up", "pass on the right facts", "role clarity"],
    barriers: ["skill", "judgement", "habit"],
    poorFit: "When the roles themselves are unclear in policy.",
    inputs: ["A reviewed relay with roles, rules and consequences"],
    evidence: "practised",
    completion: "Every leg sent",
    scoring: "rubric",
    signoff: "Clinical, Care Operations, Finance, Quality and Privacy",
    minutes: 12,
  }),
  c("budget", {
    action: "task",
    purpose: "Balances a simple budget of services",
    goodFor: ["simple budgeting", "fit services to an amount"],
    barriers: ["knowledge"],
    poorFit: "For contributions or carryover: use the Budget Sandbox.",
    inputs: ["Services and prices"],
    evidence: "completed",
    completion: "A balanced budget",
    scoring: "none",
    topicCard: "calculator",
    minutes: 3,
  }),
  c("sandbox", {
    action: "task",
    purpose: "Builds a Support at Home care plan with a participant, sees who pays which part, and explains it to them",
    goodFor: ["budget and contributions", "explain costs to a client", "care plan trade-offs", "carryover"],
    barriers: ["knowledge", "skill", "judgement"],
    poorFit: "For quoting a real participant’s fees.",
    inputs: ["A fictional participant, assessed rates, prices and a reviewed plan"],
    evidence: "practised",
    completion: "Plan submitted, explained and the debrief read",
    scoring: "rubric",
    signoff: "Support at Home operations, Finance, Quality and accessibility",
    minutes: 12,
  }),
  // Reflect and apply
  c("journal", {
    action: "reflect",
    purpose: "Writes a private note in response to a prompt",
    goodFor: ["reflect on practice", "what would you do differently", "private note"],
    barriers: ["priorities", "habit"],
    poorFit: "As evidence of competence: it’s private and unscored.",
    inputs: ["A prompt"],
    evidence: "completed",
    completion: "Written, or “prefer not to write”, when the author asks for a response",
    scoring: "none",
    topicCard: "written",
    visibility: "private to the learner",
    events: ["journal saved"],
    minutes: 3,
  }),
  c("perspectives", {
    action: "reflect",
    purpose: "Compares defensible ways of seeing a case",
    goodFor: ["no single right answer", "see other views", "ethical tension"],
    barriers: ["judgement", "priorities"],
    poorFit: "Where there is an approved right answer.",
    inputs: ["Two or more views with reasoning and what each misses"],
    evidence: "accessed",
    completion: "Read-only",
    scoring: "none",
    minutes: 3,
  }),
  c("pulse", {
    action: "reflect",
    purpose: "Says privately how they feel about something",
    goodFor: ["check confidence privately", "how do you feel about this"],
    barriers: ["confidence"],
    poorFit: "As a measure of anything.",
    inputs: ["A question and choices"],
    evidence: "accessed",
    completion: "Never required",
    scoring: "none",
    visibility: "private to the learner",
    minutes: 1,
  }),
  c("action", {
    action: "reflect",
    purpose: "Commits to one thing to do at work",
    goodFor: ["apply at work", "one change to make", "next shift", "carry it into practice"],
    barriers: ["habit", "priorities"],
    poorFit: "As a claim that behaviour changed.",
    inputs: ["A prompt"],
    evidence: "completed",
    completion: "Written or skipped, when the author asks for a response",
    scoring: "none",
    visibility: "private to the learner",
    events: ["action saved"],
    minutes: 2,
  }),
  // Reflect and share
  c("reflection", {
    action: "reflect",
    purpose: "Answers a question and can share the answer with peers",
    goodFor: ["share experience", "learn from peers", "discussion"],
    barriers: ["priorities", "confidence"],
    poorFit: "For anything that could identify a client.",
    inputs: ["A question"],
    evidence: "completed",
    completion: "Answered",
    scoring: "none",
    topicCard: "wall",
    visibility: "shared with peers, moderated",
    events: ["reflection.answered"],
    minutes: 3,
  }),
  c("wall", {
    action: "share",
    purpose: "Reads and adds to a wall of peers’ insights",
    goodFor: ["tips from peers", "collect ideas", "what works for others"],
    barriers: ["confidence", "habit"],
    poorFit: "Where peer advice could contradict policy.",
    inputs: ["A prompt"],
    evidence: "completed",
    completion: "Opened",
    scoring: "none",
    topicCard: "wall",
    visibility: "shared with peers, moderated",
    minutes: 3,
  }),
  c("poll", {
    action: "share",
    purpose: "Votes and sees how others voted",
    goodFor: ["quick poll", "what do others do", "icebreaker"],
    barriers: ["priorities"],
    poorFit: "For a question with a right answer.",
    inputs: ["A question and options"],
    evidence: "completed",
    completion: "Voted",
    scoring: "none",
    topicCard: "poll",
    minutes: 1,
  }),
  c("benchmark", {
    action: "share",
    purpose: "Commits to a judgement call, then sees how peers chose and a reviewed perspective",
    goodFor: ["peer benchmark", "grey-area judgement", "how others would handle it"],
    barriers: ["judgement", "confidence"],
    poorFit: "Where the majority view could be unsafe without the reviewed perspective.",
    inputs: ["A case, options and a reviewed next step"],
    evidence: "practised",
    completion: "Locked in and the perspective read",
    scoring: "feedback",
    signoff: "Clinical and Quality, with a review date",
    minutes: 4,
  }),
  c("mentor", {
    action: "reflect",
    purpose: "Reads experienced colleagues’ notes to their younger selves, with a phrase to adapt",
    goodFor: ["peer wisdom", "what experienced staff wish they’d known", "phrases to use"],
    barriers: ["confidence", "priorities"],
    poorFit: "As a source of policy.",
    inputs: ["Reviewed notes from the mentor note library"],
    evidence: "completed",
    completion: "The dealt cards read",
    scoring: "none",
    signoff: "Notes are reviewed in the library",
    minutes: 4,
  }),
  c("confidence", {
    action: "reflect",
    purpose: "Rates how confident they feel",
    goodFor: ["confidence before and after", "self-rating"],
    barriers: ["confidence"],
    poorFit: "As evidence of ability.",
    inputs: ["A statement to rate"],
    evidence: "completed",
    completion: "Rated",
    scoring: "self",
    topicCard: "rating",
    events: ["confidence.rated"],
    minutes: 1,
  }),
];

const BY_TYPE = new Map(BLOCK_REGISTRY.map((b) => [b.type, b]));
export const contractFor = (type: string) => BY_TYPE.get(type as BlockType);
/** Formative unless it's assessed: an unscored exercise never counts as a pass. */
export const isAssessed = (b: Pick<ActivityContract, "evidence">) => b.evidence === "assessed";

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "their",
  "they",
  "what",
  "when",
  "into",
  "each",
  "before",
  "after",
  "against",
  "are",
  "not",
  "can",
  "how",
]);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

/** How well a block's purpose and phrases match free text: shared word stems, phrases counting more. */
export function textMatch(b: ActivityContract, text: string) {
  const want = new Set(words(text).map(stem));
  if (!want.size) return 0;
  let score = 0;
  for (const phrase of b.goodFor) {
    const hit = words(phrase)
      .map(stem)
      .filter((w) => want.has(w)).length;
    if (hit) score += hit * 2;
  }
  score += words(b.purpose)
    .map(stem)
    .filter((w) => want.has(w)).length;
  return score;
}

/** Search the registry in plain words: "practise a complaint conversation", "recognise a change in a care plan". */
export function searchBlocks(q: string, labels: Record<string, string>) {
  const text = q.trim();
  if (!text) return BLOCK_REGISTRY;
  return BLOCK_REGISTRY.map((b) => ({ b, score: textMatch(b, `${text}`) + (labels[b.type]?.toLowerCase().includes(text.toLowerCase()) ? 6 : 0) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.b);
}

// ---------------------------------------------------------------------------------------------
// Recommendations: rules a person can read
// ---------------------------------------------------------------------------------------------

export type Brief = {
  /** The verified pattern, in a sentence. */
  signal: string;
  /** The specific action people should take. */
  behaviour: string;
  /** The diagnosed barriers, with how sure anyone is. */
  barriers: { barrier: Barrier; confidence: "known" | "suspected" | "unknown" }[];
  /** How much learner time is reasonable. */
  minutes: number;
  /** A realistic artefact (document, invoice, form) is available to build from. */
  hasArtefact: boolean;
  /** An approved source for the rule or procedure exists. */
  hasSource: boolean;
  /** Whether evidence against a criterion is needed. Otherwise practice is enough. */
  assessed: boolean;
};

export type Rationale = {
  signal: string;
  behaviour: string;
  barrier: string;
  mechanism: string;
  evidence: string;
  needs: string;
  proportionate: string;
  uncertain: string;
};
export type Recommendation = {
  type: BlockType;
  step: "see" | "practise" | "apply" | "assess";
  score: number;
  /** Something the author must supply before it can be built. */
  needsInput: string[];
  rationale: Rationale;
  alternatives: BlockType[];
};
export const PLAN_STEPS = {
  see: "See the situation",
  practise: "Inspect or decide, with feedback",
  apply: "Apply at work",
  assess: "Show it against a criterion",
} as const;

const needsArtefact = (b: ActivityContract) => /document|invoice|quote|receipt|picture|form|artefact/i.test(b.inputs.join(" "));
const needsSource = (b: ActivityContract) => /approved|reviewed|source|sop|question pool/i.test(b.inputs.join(" "));

function score(b: ActivityContract, brief: Brief) {
  const learnable = brief.barriers.filter((x) => BARRIERS[x.barrier].learnable);
  let s = 0;
  for (const x of learnable) if (b.barriers.includes(x.barrier)) s += x.confidence === "known" ? 6 : x.confidence === "suspected" ? 3 : 1;
  s += Math.min(8, textMatch(b, `${brief.behaviour} ${brief.signal}`));
  // A heavyweight, signed-off simulation has to earn its place within the time there is.
  if (b.minutes > brief.minutes) s -= 4;
  if (b.signoff && brief.minutes <= 5) s -= 2;
  return s;
}

function rationaleFor(b: ActivityContract, brief: Brief, labels: Record<string, string>): Rationale {
  const hit = brief.barriers.filter((x) => b.barriers.includes(x.barrier));
  const blocked = brief.barriers.filter((x) => !BARRIERS[x.barrier].learnable);
  const unsure = brief.barriers.filter((x) => x.confidence !== "known");
  return {
    signal: brief.signal,
    behaviour: brief.behaviour,
    barrier: hit.length
      ? hit.map((x) => `${BARRIERS[x.barrier].label.toLowerCase()} (${x.confidence})`).join("; ")
      : "No diagnosed barrier matches this block directly: it’s here for what it lets people practise.",
    mechanism: `${labels[b.type] ?? b.type}: the learner ${b.purpose.charAt(0).toLowerCase()}${b.purpose.slice(1)}.`,
    evidence: `${EVIDENCE[b.evidence]}. ${b.completion}. ${isAssessed(b) ? "" : "It shows practice, not a pass, and not that work has improved."}`.trim(),
    needs: [...b.inputs, b.signoff ? `Sign-off: ${b.signoff}` : ""].filter(Boolean).join(". "),
    proportionate:
      b.minutes <= brief.minutes
        ? `About ${b.minutes} ${b.minutes === 1 ? "minute" : "minutes"}, within the ${brief.minutes} minutes that’s reasonable here.`
        : `About ${b.minutes} minutes, more than the ${brief.minutes} planned: only worth it if the stakes justify it.`,
    uncertain: [
      ...unsure.map(
        (x) =>
          `“${BARRIERS[x.barrier].label}” is ${x.confidence === "suspected" ? "only suspected" : "not yet known to be a barrier"}: check before building for it.`,
      ),
      ...blocked.map((x) => `“${BARRIERS[x.barrier].label}” can’t be fixed by practice: it needs its own action and owner.`),
    ].join(" "),
  };
}

/**
  A short, justified sequence for a brief, from implemented blocks only. Each step is the best-scoring block for
  that kind of learner action, with one or two alternatives. If no learnable barrier has been diagnosed, it says
  so and recommends nothing: a course can't close an access or workflow problem.
*/
export function recommend(brief: Brief, labels: Record<string, string>): { steps: Recommendation[]; note: string } {
  const learnable = brief.barriers.filter((x) => BARRIERS[x.barrier].learnable);
  if (!learnable.length)
    return {
      steps: [],
      note: brief.barriers.length
        ? "The barriers recorded are about access or workflow. Practice won’t fix those: record the process or product action and its owner. Add a learning step only if a capability or motivation barrier is found."
        : "No barrier has been diagnosed yet. Find out what happens at the moment of work before choosing an activity.",
    };
  const eligible = BLOCK_REGISTRY.filter((b) => (brief.assessed ? true : !isAssessed(b)));
  const best = (actions: LearnerAction[], taken: Set<BlockType>) =>
    eligible
      .filter((b) => actions.includes(b.action) && !taken.has(b.type))
      .map((b) => ({ b, s: score(b, brief) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || x.b.minutes - y.b.minutes);
  const taken = new Set<BlockType>();
  const steps: Recommendation[] = [];
  const add = (step: Recommendation["step"], actions: LearnerAction[]) => {
    const ranked = best(actions, taken);
    const top = ranked[0];
    if (!top) return;
    taken.add(top.b.type);
    steps.push({
      type: top.b.type,
      step,
      score: top.s,
      needsInput: [
        ...(needsArtefact(top.b) && !brief.hasArtefact ? ["A realistic fictional artefact"] : []),
        ...(needsSource(top.b) && !brief.hasSource ? ["An approved source"] : []),
      ],
      rationale: rationaleFor(top.b, brief, labels),
      alternatives: ranked.slice(1, 3).map((x) => x.b.type),
    });
  };
  const attention = learnable.some((x) => x.barrier === "attention" || x.barrier === "knowledge");
  if (attention && brief.minutes >= 4) add("see", ["notice", "explore", "explain"]);
  add("practise", ["decide", "converse", "task", "notice"]);
  if (learnable.some((x) => ["cue", "habit", "priorities"].includes(x.barrier)) || brief.minutes >= 8) add("apply", ["reflect", "task"]);
  if (brief.assessed) add("assess", ["recall"]);
  // Keep it within the time: drop from the end until it fits, but always keep the practice step.
  const total = () => steps.reduce((n, s) => n + (contractFor(s.type)?.minutes ?? 0), 0);
  while (steps.length > 1 && total() > brief.minutes * 1.5) {
    const i = steps.findLastIndex((s) => s.step !== "practise");
    if (i < 0) break;
    steps.splice(i, 1);
  }
  const blocked = brief.barriers.filter((x) => !BARRIERS[x.barrier].learnable);
  return {
    steps,
    note: blocked.length
      ? `Also recorded: ${blocked.map((x) => BARRIERS[x.barrier].label.toLowerCase()).join("; ")}. Learning alone won’t close this: it needs its own action and owner.`
      : "",
  };
}

/** What a plan covers, in words, never a score. */
export function coverage(steps: { type: string; step: string }[], brief: Pick<Brief, "barriers" | "hasSource">) {
  const blocks = steps.map((s) => contractFor(s.type)).filter((b): b is ActivityContract => Boolean(b));
  const practised = brief.barriers.filter(
    (x) => BARRIERS[x.barrier].learnable && blocks.some((b) => b.evidence !== "accessed" && b.barriers.includes(x.barrier)),
  );
  const explained = brief.barriers.filter((x) => BARRIERS[x.barrier].learnable && !practised.includes(x) && blocks.some((b) => b.barriers.includes(x.barrier)));
  const untouched = brief.barriers.filter((x) => BARRIERS[x.barrier].learnable && !practised.includes(x) && !explained.includes(x));
  const seen = new Map<string, number>();
  for (const b of blocks) seen.set(b.action, (seen.get(b.action) ?? 0) + 1);
  return {
    practised: practised.map((x) => BARRIERS[x.barrier].label),
    explainedOnly: explained.map((x) => BARRIERS[x.barrier].label),
    untouched: untouched.map((x) => BARRIERS[x.barrier].label),
    notLearnable: brief.barriers.filter((x) => !BARRIERS[x.barrier].learnable).map((x) => BARRIERS[x.barrier].label),
    repeated: [...seen.entries()].filter(([, n]) => n > 2).map(([a]) => LEARNER_ACTIONS[a as LearnerAction]),
    missingSource: !brief.hasSource && blocks.some(needsSource),
    noFeedback: blocks.length > 0 && !blocks.some((b) => b.scoring !== "none"),
    minutes: blocks.reduce((n, b) => n + b.minutes, 0),
  };
}
