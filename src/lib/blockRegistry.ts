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
  c("hazardscan", {
    action: "notice",
    purpose:
      "Scans a drawn room in someone’s home for falls, equipment and infection risks, tells them from the person’s own belongings, says what to deal with first, and chooses what to do within their role",
    goodFor: [
      "spot the hazard",
      "home safety check",
      "falls risk at home",
      "trip hazards",
      "equipment check before a transfer",
      "infection control in the home",
      "PPE disposal",
      "environmental risk",
      "what needs attention in this room",
      "dignity of risk and the person’s belongings",
    ],
    barriers: ["attention", "judgement"],
    poorFit:
      "A real client’s home, photo or camera feed; certifying competence; a formal assessment (it needs a governed Question Pool placement, not built yet); or a procedure Quality hasn’t approved.",
    topicCard: "image (placed by reference)",
    inputs: [
      "A scene family: a drawn room, its areas, and two or more variants, each with every object’s neutral description, tap region, hazard or safe key, priority, rationale and source",
      "Role-specific actions with feedback for each priority hazard",
      "A named reviewer’s check of each variant, and Quality, policy owner and learning reviewer sign-off",
    ],
    evidence: "practised",
    completion: "Findings submitted, the action chosen and the debrief viewed (a visual practice completion, never a quiz pass)",
    scoring: "rubric",
    retry:
      "Try another room starts a fresh attempt with an approved variant the learner hasn’t seen, where there is one; every attempt keeps its variant and answer key",
    events: [
      "activity_started",
      "scene_selection_changed",
      "scene_route_switched",
      "findings_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "item_unclear_reported",
      "retry_started",
    ],
    accessible:
      "A List the room route by area with neutral descriptions, the same items and scoring; keyboard and screen reader; every object a labelled button; selection added and removed announced; zoom buttons, never pinch or drag; no timer; markers in shape and text, not colour",
    signoff:
      "A named reviewer for each variant (depicted object, location, risk, action, source); Quality, the policy owner and a learning reviewer for the release",
    minutes: 5,
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
    purpose:
      "Takes a difficult call, using simulated case tools, and gets a debrief in their own words. As a Tough Family Call: a fictional family member with a real concern, the older person’s sharing preferences, a bounded AI caller (or the reviewed script), a follow-up note and a five-dimension debrief where the caller can stay upset after a sound call",
    goodFor: [
      "phone call",
      "complaint call",
      "angry family member",
      "privacy on the phone",
      "missed visit call",
      "escalated family calls",
      "repeat enquiries after a missed visit",
      "who may decide or be told",
      "late complaint escalation",
      "inconsistent follow-up after a call",
      "family asks for the budget",
    ],
    barriers: ["skill", "judgement", "confidence"],
    poorFit:
      "When the internal workflow the call depends on isn’t approved yet, or the real problem is a contractor failure, unclear pricing, callback capacity, a Portal defect or inaccessible information: a roleplay can’t repair a service failure.",
    inputs: [
      "A reviewed scene, a case file, restricted details and a dated policy pack",
      "For a family call: versioned scenario and character facts, the older person’s sharing preferences, known and disputed facts, authored intents and replies, a rubric with human-approved critical errors, evaluation fixtures, Ava’s briefing and debrief, the Difficult Family Call Job Aid, a voice rights record and a retention setting",
    ],
    evidence: "practised",
    completion: "The call ended and the debrief was read; for a family call, a briefing, a substantive call, a follow-up note and the debrief viewed",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt; every attempt keeps its frozen scenario, rubric and versions",
    events: [
      "roleplay.started",
      "roleplay.turn",
      "roleplay.lookup",
      "roleplay.finished",
      "roleplay.debrief",
      "activity_started",
      "call_mode_selected",
      "case_file_checked",
      "call_paused",
      "call_resumed",
      "boundary_checked",
      "complaint_route_offered",
      "scenario_state_reached",
      "caller_fallback_used",
      "transcript_correction_requested",
      "follow_up_recorded",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "review_resolved",
      "source_issue_reported",
      "retry_started",
    ],
    signoff:
      "Care Operations, Quality and Privacy; Finance for a billing call. A family call also needs the story owner, Quality/complaints, the Support at Home policy owner, accessibility and the escalation-process owner, each critical error approved, and the caller voice’s rights",
    accessible:
      "Typed or spoken, the same call and result; every line is text, voices never play by themselves; pause, switch mode and correct a transcript without losing anything; case files are buttons with text results",
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
    purpose:
      "Reads a quote or receipt line by line and decides what each line is for this participant. As a Quote/Invoice X-Ray (quote review or invoice review) it separates “could this be funded?” from “is it approved for this person, through this route, at this price?”: the learner inspects each line, the evidence and the sources, asks for what’s missing, chooses one of six decisions over separate checks (list scope, need, approval, route, advice, detail, price, delivery, contribution, source), says where the document stands (pending clarification is a good result when it’s warranted), and practises explaining it",
    goodFor: [
      "check an invoice",
      "eligible or excluded",
      "what can be claimed",
      "grey-area items",
      "can this be funded",
      "quote rework",
      "disputed exclusions",
      "item on the AT–HM list treated as approved",
      "bundled pedicure or podiatry",
      "supplier admin or travel fee",
      "invoice holds",
      "unexpected contribution",
      "complaint after a refusal",
    ],
    barriers: ["judgement", "attention", "knowledge"],
    poorFit:
      "When the quote template lacks detail, the care plan or approvals can’t be found, prices are inconsistent or the Portal workflow is broken: those need a template, Job Aid or process fix as well, or instead. Never a live quote upload, funding decision, payment or message.",
    inputs: [
      "A fictional quote or receipt and a reviewed answer for each line",
      "For a quote or invoice review: the document’s role, the participant’s goal, evidence, sources with their versions and effective dates, each line’s checks, decision, route, price context and who to ask, authored answers, the overall result, a model response in the output contract’s parts, the complaints route, and the Can this be funded? Job Aid",
    ],
    evidence: "practised",
    completion:
      "Lines decided with a reason (and, in review mode, the goal and a source opened, the overall result and next action chosen), the explanation written and the debrief viewed",
    scoring: "rubric",
    retry:
      "Try again starts a new attempt; each keeps its edition and answer-key hash (and in review mode its scenario, rule set, source, rubric and engine versions), and a resent submit or finish changes nothing",
    events: [
      "activity_started",
      "document_line_opened",
      "source_checked",
      "missing_information_requested",
      "classification_selected",
      "funding_route_selected",
      "response_submitted",
      "explanation_submitted",
      "feedback_viewed",
      "activity_completed",
      "source_issue_reported",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Every document line is a button and the same lines are in a table; statuses are words, never colour alone; every control is at least 44 pixels",
    signoff:
      "Finance, Care Operations and Quality; a quote or invoice review also needs the Support at Home policy owner and the AT–HM or clinical reviewer, every source reviewed and in date, and its case check is never waived",
    minutes: 12,
  }),
  c("auditor", {
    action: "notice",
    purpose:
      "Inspects a contractor pack or invoice against trusted records and marks the evidence. As a Contractor Vetting Card it checks a participant-chosen worker apart from the business, the accepted screening route, insurance policy, scope and the supplier-versus-participant price, then recommends ready for engagement review, request evidence, escalate or cannot engage as proposed, and explains it to the participant",
    goodFor: [
      "rate mismatch",
      "compare an invoice with the agreement",
      "vet a contractor",
      "expired insurance",
      "line-level check",
      "participant-chosen worker",
      "supplier onboarding rework",
      "worker screening evidence",
      "ABN treated as approval",
      "above-median quote",
      "contractor price dispute",
      "loss of choice complaint",
    ],
    barriers: ["attention", "skill", "judgement"],
    poorFit:
      "When people can’t find the agreement to compare against, verification capacity is short, the onboarding form is unclear or the Portal workflow is broken: those need a process fix. Never a live vendor approval, screening check or price agreement.",
    inputs: [
      "Fictional documents, comparison records, dated rules with their source type and an answer key",
      "For a vetting card: the participant's request, workers, the checks behind the outcome, the supplier and participant price, evidence requests, a model explanation, a corrected pack and a renewal, and the Choosing and Checking Your Contractor Job Aid",
    ],
    evidence: "practised",
    completion: "A reasoned recommendation submitted (with the message to the participant, on a vetting card) and the debrief viewed",
    scoring: "rubric",
    retry: "Try again starts a new attempt; each keeps its edition, answer-key hash and pack, rubric and engine versions, and a resent submit changes nothing",
    events: [
      "activity_started",
      "pack_field_opened",
      "source_checked",
      "price_breakdown_checked",
      "benchmark_context_checked",
      "decision_selected",
      "screening_route_selected",
      "evidence_requested",
      "participant_explanation_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "corrected_pack_answered",
      "renewal_variant_started",
      "renewal_variant_answered",
      "source_issue_reported",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    signoff:
      "Compliance or supplier onboarding (or Finance for invoices), Care Operations and Quality; a vetting card also needs Finance or procurement pricing, and its case check is never waived",
    accessible: "A table of every field does the same job as the document view; statuses are words with an icon; every control is at least 44 pixels",
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
  c("hubvisual", {
    action: "explore",
    purpose: "Shows one of the Hub’s own diagrams, kept current: the client journey map, or a partner model’s who-does-what onboarding diagram",
    goodFor: ["client journey", "who does what", "partner model", "onboarding roles", "how the stages fit together"],
    barriers: ["knowledge"],
    poorFit: "On its own: explain what to look for in the blocks around it.",
    inputs: ["Choose a diagram"],
    evidence: "accessed",
    completion: "Nothing to complete",
    scoring: "none",
    minutes: 3,
  }),
  c("hiring", {
    action: "decide",
    purpose:
      "Works through a fictional Care Partner business’s hiring decision: compares capacity, operating result and cash across options, commits a plan, then revises it after new information",
    goodFor: ["when to hire", "recruitment timing", "caseload capacity", "coordinator workload", "margin and cash", "business growth", "partner leadership"],
    barriers: ["judgement", "knowledge"],
    poorFit:
      "When delays come from supplier shortages, unclear responsibilities, Portal friction or a broken process rather than staffing: fix those first. Not for a real business plan: that's the private Work Tool.",
    inputs: ["A reviewed fictional case: agreement, workload sample, cost and cash sheet, options, growth cases, an event, a rubric and reviewed plans"],
    evidence: "practised",
    completion: "Evidence inspected, a first decision committed, the new information read and a revised plan explained",
    scoring: "rubric",
    retry: "Try another approach starts a fresh attempt; every attempt is kept, and an assessed block records the first one",
    events: [
      "hiring_lab_started",
      "evidence_opened",
      "option_compared",
      "growth_case_changed",
      "initial_decision_submitted",
      "event_revealed",
      "revised_decision_submitted",
      "rubric_feedback_viewed",
      "retry_started",
      "hiring_lab_completed",
      "assumption_changed",
      "scenario_compared",
      "source_opened",
    ],
    accessible: "Keyboard and screen reader; every chart has a table and a sentence; risks are in words, not colour",
    signoff: "Finance, Operations/Quality, Partnerships and privacy",
    minutes: 15,
  }),
  c("onedaymap", {
    action: "decide",
    purpose:
      "Follows a fictional coordinator's working day across five lanes (clients, coordinator, Care Partner principal, suppliers, Trilogy Care staff): makes her decisions, plays other people briefly, and keeps what they know apart from what she knows",
    goodFor: [
      "prioritisation",
      "handoffs",
      "perspective taking",
      "adapting when a request changes",
      "follow-through",
      "commitments and callbacks",
      "a coordinator's day",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "A single policy fact or one procedure: use a Job Aid or a shorter specialist block. Not for urgent safety: that follows the reviewed urgent process, not a day map.",
    inputs: [
      "A reviewed fictional day: threads, a cast in five lanes, facts with who knows them, timed events with role lenses and decisions, honest end-of-day statuses",
    ],
    evidence: "practised",
    completion: "Every decision made through the day and an honest status given for each person at the close",
    scoring: "rubric",
    retry: "Retry from any event replays the day from there; Replay the day starts a fresh attempt, and every attempt is kept",
    events: [
      "journey_started",
      "event_arrived",
      "role_lens_opened",
      "lens_reply_chosen",
      "decision_made",
      "knowledge_gap_hit",
      "day_closed",
      "event_retried",
      "journey_completed",
    ],
    accessible: "Keyboard and screen reader; a chronological list on phones; client threads by name, colour and pattern; no timers",
    signoff: "Owner, story editor, Operations, Quality/clinical, Billing/Finance, supplier onboarding and privacy",
    minutes: 20,
  }),
  c("intake", {
    action: "decide",
    purpose:
      "Works out whether a fictional Care Partner can take on next month’s starts: predicts, maps coordinator hours week by week, checks confirmed service coverage, tries a change, then chooses an action and an honest message",
    goodFor: [
      "growth pressure",
      "rushed onboarding",
      "late starts",
      "supplier coverage",
      "promising a start date",
      "capacity planning",
      "taking on new clients",
      "business owners",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "Recruitment, margin and cash over months: use the Hiring Runway lab. A missing supplier network or a Portal workflow fault: fix the process, not the learner. Not for urgent safety: that follows the escalation process.",
    inputs: [
      "A reviewed fictional month: starts by week and readiness, work bands, coordinator hours and leave, service needs, supplier slots with status and dates, actions and messages with feedback",
    ],
    evidence: "practised",
    completion: "A prediction, a week and a service gap inspected, a change tried, then an action and a message chosen",
    scoring: "rubric",
    retry: "Try another route starts a fresh attempt; every attempt is kept",
    events: [
      "intake_started",
      "prediction_submitted",
      "week_inspected",
      "service_inspected",
      "change_tried",
      "decision_submitted",
      "intake_completed",
      "retry_started",
      "sheet_printed",
    ],
    accessible: "Keyboard and screen reader; every chart has a table; every slider has a number field; status in words, not colour",
    signoff: "Owner, Operations/Quality, Partnerships, policy and privacy",
    minutes: 20,
  }),
  c("workload", {
    action: "decide",
    purpose:
      "Follows a fictional coordinator’s week, tags each event with one work category and its causes, reads the week map from the principal’s and the coordinator’s side, tests a change on the reviewed rework it touches, then chooses a proportionate next step",
    goodFor: [
      "coordinator overload",
      "where the week goes",
      "overdue follow-up",
      "high rework",
      "uneven onboarding",
      "jumping to hiring",
      "process before headcount",
      "business owners",
      "time map",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "A recruitment decision with cash and margin: use the Hiring Runway lab. A broken handoff or system fault on its own: fix the process. Never for judging or ranking an individual coordinator. Not for urgent safety: that follows the escalation process.",
    inputs: [
      "A reviewed fictional week: observed tasks with one primary category, cause tags, rework status and duty owner; a comparison week; a forward plan; changes with owners and evidence; explanations and decisions with feedback",
    ],
    evidence: "practised",
    completion: "A prediction, every event tagged, part of the week map opened, a change tested, then an explanation and a decision chosen",
    scoring: "rubric",
    retry: "Map the week again starts a fresh attempt; every attempt is kept",
    events: [
      "workload_started",
      "prediction_submitted",
      "event_tagged",
      "map_inspected",
      "detail_opened",
      "change_tried",
      "decision_submitted",
      "workload_completed",
      "retry_started",
      "review_printed",
    ],
    accessible:
      "Keyboard and screen reader; the week map has a table with every value; every figure has a number field; “not measured” is shown apart from zero; no animation",
    signoff: "Owner, Care Coordination operations, Quality/clinical governance, Partnerships, privacy and a pilot group",
    minutes: 20,
  }),
  c("coverage", {
    action: "decide",
    purpose:
      "Compares what clients need, by service, capability, place and time window, with provider-approved, confirmed, uncommitted contractor capacity across local areas; tags supply cards, then chooses an immediate continuity action and a separate network-building priority",
    goodFor: [
      "supplier network",
      "local coverage",
      "service gaps by suburb",
      "contractor capacity",
      "repeated delayed starts",
      "local no-shows",
      "referrals outpacing supply",
      "recruiting the wrong service type",
      "where to recruit",
      "business owners",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "Approving a contractor, outreach or onboarding: that’s the Contractor Network Builder’s job. A missing supplier or a stale register on its own: fix the process. Never a clinical priority or a service date. Not for urgent safety: that follows the escalation process.",
    inputs: [
      "A reviewed fictional case: areas, needs by service and time window with demand tiers, supply rows with provider state and verified availability, supply cards, actions, priorities and evidence with feedback, and a story update",
    ],
    evidence: "practised",
    completion:
      "A prediction, an area and a coverage row opened, every supply card tagged, the absence looked at, two decisions and the evidence chosen, and the follow-up answered",
    scoring: "rubric",
    retry: "Look again starts a fresh attempt; every attempt is kept",
    events: [
      "coverage_started",
      "prediction_submitted",
      "area_opened",
      "filter_used",
      "card_tagged",
      "row_opened",
      "absence_viewed",
      "decision_submitted",
      "followup_answered",
      "coverage_completed",
      "retry_started",
      "brief_printed",
    ],
    accessible:
      "Keyboard and screen reader; the map is never the only source: every area and row is in a list and a table; status in words, not colour; every figure has a number field; no animation",
    signoff: "Owner, Care Partner Operations, supplier onboarding, Quality/clinical governance, Partnerships, policy owner, privacy and a pilot group",
    minutes: 20,
  }),
  c("referral", {
    action: "decide",
    purpose:
      "Follows the same arrival cohort of fictional enquiries, by referral source, from the stage at first contact through authorised introduction, provider choice, agreement and first service to whether people stay active; sorts stage cards, reads timing, effort and continuity, then chooses one relationship action and one operational fix",
    goodFor: [
      "lots of referrals but few starts",
      "referral sources",
      "which referrals become clients",
      "underperforming relationship",
      "slow handoffs",
      "referral conversion",
      "local referral relationships",
      "GP and hospital referrals",
      "business owners",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "Pitch practice, approved one-pagers or follow-up messages: that’s the Local Referral Studio’s job. A live referral or consent record belongs in the CRM or Portal, not a learning tool. A funding queue or a supply gap on its own: fix the process. Never a leaderboard of named referrers.",
    inputs: [
      "A reviewed fictional case: de-identified enquiries with dates, sources and assists, stage at first contact, funnel events, waits and exits; effort by source and month; stage cards; questions, actions and conclusions with feedback; and a return visit",
    ],
    evidence: "practised",
    completion:
      "A prediction, every stage card sorted, a funnel, the timing, effort and continuity opened, the denominator, timing and handoff questions answered, a revised reading, a data point, two actions and a conclusion chosen, and the return visit answered",
    scoring: "rubric",
    retry: "Look again starts a fresh attempt; every attempt is kept",
    events: [
      "referral_started",
      "prediction_submitted",
      "stage_classified",
      "funnel_opened",
      "view_opened",
      "filter_used",
      "denominator_answered",
      "timing_answered",
      "choice_answered",
      "decision_submitted",
      "followup_answered",
      "referral_completed",
      "retry_started",
      "review_printed",
      "review_saved",
      "review_returned",
    ],
    accessible:
      "Keyboard and screen reader; every chart has a table with numerator and denominator; one source at a time on phones; blank, unknown and zero shown apart; no animation",
    signoff: "Owner, referral pathway owner, intake owner, Partnerships, Care Partner Operations, Quality, privacy and a pilot group",
    minutes: 20,
  }),
  c("reliability", {
    action: "decide",
    purpose:
      "Follows a fictional month of missed services: classifies each by who or what started it, checks the person’s immediate need, counts unique recovery work once, measures time to the restored service, then compares a specific reliability action with a referral push on care, workload and money separately",
    goodFor: [
      "missed services",
      "supplier no-shows",
      "repeat no-shows",
      "what does a missed visit cost",
      "service reliability",
      "coordinator rework",
      "reliability before growth",
      "more referrals or fix reliability",
      "business owners",
    ],
    barriers: ["judgement", "priorities", "habit"],
    poorFit:
      "An individual person’s concern, complaint or transfer: that’s the 28-Day Trust Check’s job, and the case stays in the Operations and Quality systems. Approving or correcting a supplier: supplier management. An urgent safety concern goes straight to the escalation process. Never a lifetime client value or a churn score.",
    inputs: [
      "A reviewed fictional month: individual visits with outcome, verified reason, issue group and recovery dates; unique recovery tasks with cause tags; documented costs and who bears them; reliability actions with assumptions and evidence; a referral push; log cards, repair-work lines, questions and decisions with feedback",
    ],
    evidence: "practised",
    completion:
      "An immediate response and a first guess, every log entry classified, the repair work marked, a visit opened on the timeline, the repeat answered, an action tested, the referral push looked at, a decision and an explanation chosen, and the later check answered",
    scoring: "rubric",
    retry: "Look again starts a fresh attempt; every attempt is kept",
    events: [
      "reliability_started",
      "response_chosen",
      "prediction_submitted",
      "card_classified",
      "tasks_marked",
      "occurrence_opened",
      "view_opened",
      "intervention_tried",
      "assumption_revised",
      "repeat_answered",
      "decision_submitted",
      "later_answered",
      "reliability_completed",
      "retry_started",
      "sheet_printed",
      "sheet_saved",
      "sheet_returned",
    ],
    accessible:
      "Keyboard and screen reader; the reliability timeline has a table with every visit; status in words and shape, not colour; one story beat at a time; blank, unknown and zero shown apart; no animation",
    signoff:
      "Owner, Care Coordination Operations, Quality/complaints, clinical governance, supplier management, Finance, the policy owner, Partnerships and privacy",
    minutes: 25,
  }),
  c("cashbridge", {
    action: "decide",
    purpose:
      "Follows a fictional partner business’s next 90 days date by date: places a referral, a start, an earned fee, a remittance advice and cleared cash on a timeline, finds the dated cash low point and the opening cash needed to keep a reserve, tests a late receipt, a moved start and a moved hire with the capacity guardrail beside them, then chooses a funded, service-safe action and replaces estimates with actuals at Day 30",
    goodFor: [
      "cash flow",
      "can we fund the next 90 days",
      "cash timing",
      "payroll before remittance",
      "when partner fees are paid",
      "hiring and cash",
      "profit is not cash",
      "cash low point",
      "business owners",
    ],
    barriers: ["knowledge", "judgement", "attention"],
    poorFit:
      "A credit, hiring, pricing, claims or accounting decision for a real business: it’s a planning and learning tool. A business with a gap today needs a Finance conversation. Never public Support at Home funding or the care-management allocation as partner income.",
    inputs: [
      "A reviewed fictional 90 days: the fictional agreement (fee, earning condition, payment timing), dated receivables, planned starts with certainty, coordinators with actual pay dates and on-costs, dated outflows, statutory items, sensitivity cases and actions, Day 30 actuals; evidence cards, questions and decisions with feedback; the worked example",
    ],
    evidence: "practised",
    completion:
      "A first guess, every piece of evidence placed, the moved start answered, the low point read, a week or date opened, the delayed-receipt case and at least two cases or options tested, a decision and an explanation, the Day 30 actuals applied and the check-in answered",
    scoring: "rubric",
    retry: "Look again starts a fresh attempt; every attempt is kept",
    events: [
      "cashbridge_started",
      "prediction_submitted",
      "card_placed",
      "start_answered",
      "week_opened",
      "date_opened",
      "view_opened",
      "example_tried",
      "low_answered",
      "sensitivity_tested",
      "option_tried",
      "actuals_applied",
      "review_answered",
      "decision_submitted",
      "cashbridge_completed",
      "retry_started",
      "sheet_printed",
      "workbook_exported",
      "plan_saved",
      "plan_updated",
    ],
    accessible:
      "Keyboard and screen reader; the cash bridge has a dated table and a weekly table carrying the same figures and low date; status in words and shape, not colour; one story beat at a time; blank, unknown and zero shown apart; no animation",
    signoff:
      "Owner, Finance and the partner commercial agreement owner, Care Coordination Operations, Quality, Partnerships, privacy and partner business representatives",
    minutes: 30,
  }),
  c("budgetlab", {
    action: "decide",
    purpose:
      "Works through a fictional participant’s Support at Home quarter end: tells the current balance from the projected one, checks with the person before anything else, builds a possible plan from discrete sessions on real dates, routes AT–HM separately, then explains the plan, the contribution and what may carry over, and sees the consequences",
    goodFor: [
      "quarter end budget",
      "unspent funds",
      "projected balance",
      "current versus projected balance",
      "carryover",
      "budget forecasting",
      "unexpected contributions",
      "spending to use up a budget",
      "family asks for more services",
      "AT-HM and the ongoing budget",
      "care plan and budget mismatch",
    ],
    barriers: ["knowledge", "judgement", "habit"],
    poorFit:
      "An inaccessible statement, an incorrect Portal figure, an unclear price or a delayed supplier booking: those need a work tool or process fix as well, or instead. Never a live budget calculator, a booking or a claim.",
    topicCard: "image (placed by reference)",
    inputs: [
      "A reviewed fictional quarter: the funding basis (care management stated once), quarter and snapshot dates, current balance, booked sessions, approved services with prices, contribution categories and the scenario’s assessed rates, supplier availability and the person’s view; read, conversation, equipment, explanation and next-step choices with feedback; endings and variations; sources and a rule set version",
    ],
    evidence: "practised",
    completion: "The statement and care plan opened, the figures read, the person checked with, a plan decided, a reason submitted and the feedback viewed",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt with a meaningful variation; every attempt keeps its own rubric and rule set",
    events: [
      "activity_started",
      "budget_information_opened",
      "budget_plan_changed",
      "funding_route_chosen",
      "budget_projection_viewed",
      "participant_explanation_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Keyboard, switch and touch: every session is a button and a date choice, never a drag; current and projected labels stay visible on a phone; every change is announced in words; a table alternative for the projection; status in words and shape, not colour; reduced motion respected",
    signoff: "Owner, Operations/Finance, the Support at Home policy owner, Quality (client-facing language) and a learning reviewer (rubric and accessibility)",
    minutes: 15,
  }),
  c("discharge", {
    action: "decide",
    purpose:
      "Handles a fictional participant’s return home from hospital at a coordinator’s desk: alerts arrive over time, the handover shows what’s missing and unverified, and the learner verifies, arranges, escalates and follows up, then records an honest handover with named owners, confirmed versus pending, and the first check after the return home",
    goodFor: [
      "hospital discharge",
      "hospital to home handover",
      "discharge handover gaps",
      "missed first visit after discharge",
      "first nursing visit not confirmed",
      "equipment delay after hospital",
      "changed care plan after admission",
      "family expectations at discharge",
      "late escalation of a clinical gap",
      "recommendation treated as arranged",
      "transition care or restorative care assumed",
    ],
    barriers: ["judgement", "skill", "confidence"],
    poorFit:
      "A missing clinical capacity, an unavailable supplier, a broken referral route or a defective handover form: those need a process or capacity fix as well, or instead. Never a live discharge tracker, a booking or a message to a hospital or family.",
    topicCard: "image (placed by reference)",
    inputs: [
      "A reviewed fictional case: the participant, who decides and the supporter's status; the handover record; alerts with source, reliability, access and release conditions; action cards with owner, dependency, time cost, effects and feedback; readiness gates; handover questions; a rubric of conditions and critical errors; endings and a retry variation; authored paths that play to at least two defensible endings",
      "Approved sources for every clinical, funding and process claim (Trilogy Care's internal procedures replacing the placeholders), and the Hospital-to-Home Handover Check Job Aid",
    ],
    evidence: "practised",
    completion:
      "The handover record inspected, decisions made on the board, a handover submitted and the debrief viewed (an open page, a moved card or the clock reaching discharge never completes it)",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt with a retry variation; every attempt keeps its frozen scenario, rubric and versions",
    events: [
      "activity_started",
      "handover_field_checked",
      "action_taken",
      "clinical_gap_identified",
      "escalation_selected",
      "funding_route_selected",
      "service_confirmation_received",
      "readiness_status_viewed",
      "activity_paused",
      "activity_resumed",
      "handover_submitted",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Keyboard, switch, screen reader and touch: every decision is a labelled button, never a drag; new alerts are announced politely without moving focus; statuses are words (“Requested, not confirmed”), not colour; an untimed mode with the clock hidden; pause, resume and a step-by-step replay; no motion, flashing or sound",
    signoff:
      "Owner, clinical governance/Quality, Care Partner operations, the Support at Home policy owner, the owner of the discharge and escalation processes, and a learning reviewer (rubric and accessibility)",
    minutes: 20,
  }),
  c("network", {
    action: "decide",
    purpose:
      "Works through a fictional early-morning service gap: opens contractor cards behind a misleading “five nearby” count, measures the gap by approved service hours, place and time, keeps the participant’s chosen worker in view, drafts a role-specific outreach brief from a reviewed template, plans the rest after a second reveal, and reads a quality scorecard with no single score",
    goodFor: [
      "contractor capacity",
      "local service gap",
      "early morning cover",
      "supplier onboarding",
      "unverified worker counted as cover",
      "interest treated as approval",
      "approval treated as availability",
      "start date promised before checks",
      "participant-chosen worker",
      "contractor recruitment outreach",
      "contractor quality scorecard",
      "repeated service start delays",
    ],
    barriers: ["judgement", "knowledge", "attention"],
    poorFit:
      "A slow central verification queue, an unclear supplier agreement or a real shortage of workers: those need a process or supply fix as well, or instead. Never a contractor approval, worker-screening check, rostering tool or outreach sender.",
    inputs: [
      "A reviewed fictional case as Local Coverage inputs (need slots, supply rows, areas), contractor cards with Contractor Vetting Card evidence states, decisions with rubric levels and critical codes, a second reveal, branches (chosen worker approved or declined, stale availability, no supplier, a quality concern), role requirement profiles, an approved outreach template and a quality scorecard",
      "The Choosing and Checking Your Contractor Job Aid, and current Trilogy Care onboarding, screening, insurance and price policies for the profiles",
    ],
    evidence: "practised",
    completion:
      "A diagnosis recorded, every decision made, a brief drafted, the reveal and the scorecard reviewed, and the debrief viewed (an open page or a copied draft never completes it)",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt on the next branch; every attempt keeps its frozen case, rubric and versions",
    events: [
      "network_builder_opened",
      "candidate_card_opened",
      "gap_reviewed",
      "decision_made",
      "participant_choice_branch_selected",
      "contingency_selected",
      "outreach_draft_generated",
      "outreach_draft_edited",
      "outreach_draft_copied",
      "onboarding_checklist_opened",
      "readiness_status_viewed",
      "quality_evidence_reviewed",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Keyboard, switch, screen reader and touch: the map has an equivalent table, every decision is a labelled field or button, never a drag; statuses are words with icons, not colour alone; one pane at a time on a phone; no motion or sound",
    signoff:
      "Owner, Operations, the supplier/contractor onboarding owner, Quality and worker screening (with clinical governance for regulated roles), Partnerships, Finance/procurement, privacy/security and a learning reviewer",
    minutes: 20,
  }),
  c("trustcheck", {
    action: "decide",
    purpose:
      "Works through a fictional service-recovery case over 28 days: reads signal cards with their sources and alternatives, triages without a churn score, hears the person before planning, keeps a relative to what the person agreed, builds an owned action plan with a contingency, handles a supplier that can’t deliver and a complaint, checks Day 7 and Day 28 with delivery evidence, and supports a choice to move",
    goodFor: [
      "repeated early cancellations",
      "missed services",
      "confusion after first statements",
      "unexplained statement line",
      "unanswered calls",
      "unresolved invoice queries",
      "budget underspend read as churn",
      "retention pressure",
      "family member asking for budget details",
      "participant choosing to change provider",
      "complaint discouraged",
      "fix closed without checking with the person",
    ],
    barriers: ["judgement", "knowledge", "priorities"],
    poorFit:
      "A missing worker, a failing supplier roster or a billing feed that lags: those need an Operations, supplier or Finance fix as well, or instead. Never a complaints, incident or exit system, a churn predictor, or a live participant record. Not for urgent safety: that follows the escalation process now.",
    inputs: [
      "A reviewed fictional case: signal cards (with source, update time, reliability, alternatives and what to verify), the person’s sharing preferences, decisions with rubric levels and critical codes, a plan builder, Day 7 and Day 28 records, retry variations (a chosen move, a known pause, a safety disclosure) and authored paths",
      "The 28-Day Trust Check Job Aid, the Quarterly Budget Decision Lab’s rule set, and Trilogy Care’s complaints, exit and transfer, booking escalation and clinical escalation procedures",
    ],
    evidence: "practised",
    completion:
      "Signal cards opened, every decision made, a plan proposed, the checkpoints judged from chosen evidence, and the debrief viewed (an open page or a saved Job Aid never completes it)",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt on the next variation; every attempt keeps its frozen case, rubric and versions",
    events: [
      "trust_check_opened",
      "simulation_started",
      "signal_viewed",
      "evidence_selected",
      "alternative_explanation_selected",
      "triage_selected",
      "participant_question_asked",
      "plan_proposed",
      "critical_rule_flagged",
      "followup_checkpoint_viewed",
      "outcome_recorded",
      "transfer_branch_completed",
      "improvement_issue_raised",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Keyboard, switch, screen reader and touch: every signal is a button that opens its card, every decision a labelled field; statuses and reliability are words, never colour alone; one pane at a time on a phone with the evidence a tap away; no timer, motion or sound",
    signoff:
      "Owner (Partner Enablement), Care Coordination operations, Quality/complaints, the Support at Home policy and budgets owner, Finance/billing, clinical governance, Partnerships, privacy/security and a learning reviewer",
    minutes: 20,
  }),
  c("referralstudio", {
    action: "converse",
    purpose:
      "Practises a short, truthful explanation with a fictional local referrer (a GP practice manager or hospital social worker): chooses the older person’s stage, answers an objection, keeps to the approved claim register, and agrees a realistic next step, then reads a five-dimension scorecard with critical claim flags and the approved correction",
    goodFor: [
      "gp referral pitch",
      "hospital referral",
      "objection practice",
      "local referrers",
      "same-day sign-on misunderstood",
      "promised start dates",
      "unapproved marketing claims",
      "assessment versus provider choice",
      "discharge handoff complaints",
      "partner onboarding confusion about referrals",
      "business owners",
    ],
    barriers: ["skill", "knowledge", "confidence"],
    poorFit:
      "A shortage of local service capacity, a broken intake process or an unclear escalation contact: training partners to pitch more often doesn’t fix those. Never a live referral, a patient intake form, a CRM or an email sender.",
    inputs: [
      "Reviewed fictional referrer scenarios on the Tough Family Call engine (persona, stage variants, intents, a rubric with human-approved critical flags, endings and fixtures), the central claim register with owners and dates, Ava’s briefing, the Local Referral Conversation Job Aid and a retention setting",
    ],
    evidence: "practised",
    completion: "A stage chosen, a substantive conversation, a next step recorded and the debrief viewed (an open page or a copied draft never completes it)",
    scoring: "rubric",
    retry: "Try again starts a fresh attempt; every attempt keeps its frozen scenario, claim versions and rubric",
    events: [
      "referral_studio_opened",
      "roleplay_started",
      "stage_selected",
      "pitch_submitted",
      "objection_answered",
      "critical_claim_flagged",
      "details_refused",
      "caller_fallback_used",
      "feedback_viewed",
      "roleplay_completed",
      "roleplay_retried",
    ],
    accessible:
      "Keyboard, screen reader and touch: text and voice use the same scenario states and scoring; the 60-second timer is a coaching aid that can be paused or switched off; statuses are words, not colour; one pane at a time on a phone; no motion or sound",
    visibility: "private to the learner",
    signoff: "Owner, the referral pathway owner, Partnerships/Marketing (claims and co-branding), Quality/clinical governance and Privacy",
    minutes: 10,
  }),
  c("shadowcoach", {
    action: "decide",
    purpose:
      "A manager reviews a fictional new coordinator’s call, note or QA sample: marks the words and omissions that matter, protects the participant first, tells a skill gap from a workflow defect, coaches in their own words (Notice, Ask, Agree, Verify), assigns a two-week plan from existing approved content with a practice and an observation, and checks a second, different sample before a scoped readiness decision",
    goodFor: [
      "new coordinator onboarding",
      "first 100 days",
      "manager coaching",
      "managers skip the follow-up observation",
      "repeat corrections in new-hire QA",
      "contribution advice errors",
      "incident notes minimised or closed as resolved",
      "delayed incident escalation by new hires",
      "every mistake answered with another course",
      "readiness signed off from attendance",
      "business owners hiring coordinators",
    ],
    barriers: ["judgement", "skill", "priorities"],
    poorFit:
      "Not every coordinator mistake means the manager needs training: an out-of-date script or sheet, a fall-first form, unclear category labels or workload pressure need a process change instead. Never a performance-management, disciplinary or HR record, an incident report, a billing correction or a ranking of real people.",
    inputs: [
      "A reviewed fictional case: work samples with line ids, findings with accepted classes and causes, first actions with critical codes, coaching replies and a pushback, plan suggestions that point at existing Topics, Magazine pages and Job Aids, and a second, different sample with its evidence and defined tasks",
      "The Hub’s contribution rule set, Trilogy Care’s incident, contribution-correction and delegation procedures, and the coaching conversation Job Aid",
    ],
    evidence: "practised",
    completion:
      "Each scenario’s sample inspected, first actions settled with nothing critical left out, a coaching conversation, a plan shared, the second sample reviewed, a readiness decision and the debrief viewed (a saved Job Aid or an opened page never completes it)",
    scoring: "rubric",
    retry:
      "Try again starts a fresh attempt on the same scenario; each keeps its frozen case, rubric and versions, and an earlier episode’s decision travels with the next as history",
    events: [
      "shadow_coach_started",
      "artefact_viewed",
      "passage_highlighted",
      "concern_classified",
      "immediate_action_selected",
      "critical_rule_flagged",
      "escalation_branch_completed",
      "coaching_response_submitted",
      "reviewer_requested",
      "plan_suggested",
      "plan_edited",
      "plan_assigned",
      "process_issue_raised",
      "followup_sample_reviewed",
      "defined_task_signed_off",
      "response_submitted",
      "feedback_viewed",
      "activity_completed",
      "assessment_attempted",
      "assessment_passed",
      "retry_started",
    ],
    accessible:
      "Keyboard, screen reader and touch: every line is a button that opens a labelled form (no drag or mouse-only highlight), statuses are words, never colour alone; one step at a time on a phone with View source a tap away; no timer, motion or sound",
    signoff:
      "Owner (Partner Enablement), Care Coordination operations, Quality/incident management, clinical governance, the Support at Home policy/contributions owner, Partnerships, People/HR and privacy/security",
    minutes: 25,
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
  c("casethread", {
    action: "share",
    purpose:
      "Writes a private first take on a fictional care coordination dilemma (what they’d say, do next and who needs to know), then reads a pinned Quality-reviewed case note and verified coordinators’ responses in one canonical moderated thread shared with the Community, and reflects on what they’d keep or change",
    goodFor: [
      "what would you do",
      "community case thread",
      "peer responses from experienced coordinators",
      "difficult client conversation",
      "client choice and duty of care",
      "a refusal after a fall",
      "family friend as a worker",
      "compare approaches with peers",
      "save a script",
      "reflective practice",
    ],
    barriers: ["judgement", "confidence", "skill"],
    poorFit:
      "A live client matter, an incident, clinical triage or a policy approval: those go through the approved pathway, never a community thread. Not a scored assessment: link the Question Pool for that. Never real client stories.",
    inputs: [
      "A reviewed fictional case: the scene, role, facts and deliberate unknowns, an immediate-safety cue; the first-take and reflection prompts and self-review questions; a source-linked case note with its policy version, owner and review date; three to five varied seed responses; the Community thread id and audience",
    ],
    evidence: "completed",
    completion: "A private first take, the case note viewed, at least one peer approach viewed and a reflection. Never votes, posting or comments",
    scoring: "self",
    retry: "The first take is kept as written; a revised answer and reflection can be saved again at any time",
    events: [
      "draft_saved",
      "first_take_submitted",
      "note_viewed",
      "peer_viewed",
      "vote_added",
      "comment_submitted",
      "script_saved",
      "reflection_saved",
      "revised_saved",
      "share_submitted",
      "report_made",
      "live_interrupt",
      "completed",
    ],
    accessible:
      "Keyboard and screen reader; sorting, helpful votes and discussion status in words, not colour or icons alone; a text-only view; no animation, so reduced motion changes nothing; the case note is a labelled region apart from the feed",
    visibility: "shared with peers, moderated",
    signoff: "Content owner, Clinical, Quality and the Community owner, with the policy version and a review date",
    minutes: 15,
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
