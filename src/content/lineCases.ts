import type { Lane, LineBlockData, LineCase } from "@/lib/line";

/*
  The first deck for "Where Is the Line?" (docs/line-drawer.md): ten self-managed requests, drafted from the
  PRD's table. These are DRAFT teaching keys. Every card is marked draft, so none can be served or published
  until Trilogy Care Clinical and Quality have signed off its answer against current policy and marked it approved.
*/

const DEPT = "Department of Health, Disability and Ageing: self-management by Support at Home participants";
const TC = "Trilogy Care: self-managed Support at Home";
const RIGHTS = "Aged Care Quality and Safety Commission: Statement of Rights";
const CLINICAL = "Aged Care Quality and Safety Commission: clinical care, including falls and dignity of risk";
const LIST = "Department of Health, Disability and Ageing: Support at Home service list";
const ATHM = "Department of Health, Disability and Ageing: AT-HM scheme";

type Draft = Omit<
  LineCase,
  "reasons" | "actions" | "accepted" | "acceptedActions" | "primary" | "source" | "status" | "secondary" | "critical" | "twist" | "know" | "funding"
> & {
  reasons: [string, string][];
  actions: [string, string][];
  primary: string;
  accepted?: string[];
  acceptedActions: string[];
  secondary?: string[];
  critical?: LineCase["critical"];
  twist?: LineCase["twist"];
  know?: string;
  funding?: string;
  refs: string[];
};
const card = (d: Draft): LineCase => ({
  id: d.id,
  request: d.request,
  facts: d.facts,
  know: d.know ?? "",
  funding: d.funding ?? "",
  lane: d.lane,
  reasons: d.reasons.map(([id, text]) => ({ id, text })),
  primary: d.primary,
  accepted: [d.primary, ...(d.accepted ?? [])],
  actions: d.actions.map(([id, text]) => ({ id, text })),
  acceptedActions: d.acceptedActions,
  choice: d.choice,
  next: d.next,
  why: d.why,
  secondary: d.secondary ?? [],
  critical: d.critical ?? null,
  twist: d.twist ?? null,
  source: { refs: d.refs, sop: "", approver: "", effectiveOn: "", reviewOn: "", escalation: "" },
  status: "draft",
});
const lanes = (...l: Lane[]) => l;

const cases: LineCase[] = [
  card({
    id: "ln-01",
    request: "Can my approved cleaner come on Thursday instead of Tuesday?",
    facts: ["Same cleaner, same task, same length of visit.", "Same agreed price. The cleaner is free on Thursday."],
    lane: "choice",
    reasons: [
      ["ln-01-r1", "A scheduling preference within the agreed service is the participant’s to make"],
      ["ln-01-r2", "Any change to a service needs a new quote"],
      ["ln-01-r3", "Only Trilogy Care can set the visit day"],
    ],
    primary: "ln-01-r1",
    actions: [
      ["ln-01-a1", "Confirm with the cleaner and update the schedule, and the care plan record if needed"],
      ["ln-01-a2", "Ask for a new quote before agreeing"],
      ["ln-01-a3", "Tell them the day can’t change once it’s set"],
    ],
    acceptedActions: ["ln-01-a1"],
    choice: "Choosing when an agreed service happens is the person’s call.",
    next: "Confirm with the worker and update the schedule or care plan record.",
    why: "Self-management gives participants choice over workers, schedules and services. Nothing about the service, worker or price is changing here, so there’s nothing new to check.",
    refs: [TC, DEPT],
  }),
  card({
    id: "ln-02",
    request: "I don’t want a nursing review.",
    facts: ["Two falls in the last month.", "She can discuss the choice and understands it.", "No urgent injury or red flag described."],
    know: "This version has no urgent red flags. An emergency version needs its own approved answer and escalation path.",
    lane: "choice",
    reasons: [
      ["ln-02-r1", "Her informed refusal stands; Trilogy Care still has an assessment, risk management and escalation duty"],
      ["ln-02-r2", "Clinical risk always removes consent"],
      ["ln-02-r3", "No review means the falls can be left alone"],
      ["ln-02-r4", "A refusal has to be overruled after two falls"],
    ],
    primary: "ln-02-r1",
    actions: [
      ["ln-02-a1", "Explain your concerns and the options, record the conversation, and follow the approved falls risk and clinical escalation process"],
      ["ln-02-a2", "Book the review anyway; it’s for her safety"],
      ["ln-02-a3", "Note that she declined and close the matter"],
    ],
    acceptedActions: ["ln-02-a1"],
    choice: "She can refuse a review. Refusing doesn’t end Trilogy Care’s duty to respond to the falls.",
    next: "Talk through the concern and options, document it, and follow the falls and clinical escalation process.",
    why: "Choice and dignity of risk are participant rights, and providers are still expected to identify, monitor and escalate clinical risk. Respecting the refusal and acting on the falls are both required. Never treat a refusal as permission to ignore falls.",
    secondary: ["If an urgent injury or red flag appears, follow the emergency pathway; that’s a different case."],
    critical: {
      lanes: lanes("cannot"),
      actions: ["ln-02-a2", "ln-02-a3"],
      text: "This case needs a debrief: either her informed refusal was overruled, or the falls were left without a response. Both need to be held at once.",
    },
    refs: [RIGHTS, CLINICAL],
  }),
  card({
    id: "ln-03",
    request: "I want to keep tending my roses myself, even if there’s some risk.",
    facts: ["Gardening matters a great deal to him.", "No urgent safety concern described."],
    lane: "choice",
    reasons: [
      ["ln-03-r1", "Dignity of risk: support the goal and look for safer ways to do it"],
      ["ln-03-r2", "Any risk means the hobby should stop"],
      ["ln-03-r3", "Gardening isn’t something Trilogy Care can comment on"],
    ],
    primary: "ln-03-r1",
    actions: [
      ["ln-03-a1", "Talk through safer ways to keep gardening, and update the risk and care plan where needed"],
      ["ln-03-a2", "Ask his family to remove the garden tools"],
      ["ln-03-a3", "Say nothing; it’s his choice"],
    ],
    acceptedActions: ["ln-03-a1"],
    choice: "Keeping his hobby is his choice to make.",
    next: "Explore safer ways to support his goal, and update the risk and care plan.",
    why: "Dignity of risk means supporting a person’s choices that carry risk, with proportionate support around them. Don’t remove a hobby by default.",
    critical: { lanes: [], actions: ["ln-03-a2"], text: "Removing his tools without his agreement takes the choice away from him." },
    refs: [RIGHTS, CLINICAL],
  }),
  card({
    id: "ln-04",
    request: "My neighbour’s 19-year-old son can do my approved light gardening. Can he start?",
    facts: ["Light gardening is approved in the care plan.", "He hasn’t been engaged by Trilogy Care."],
    lane: "check",
    reasons: [
      ["ln-04-r1", "A participant may nominate a worker; Trilogy Care must engage and check them before funded work starts"],
      ["ln-04-r2", "Nobody under 21 can provide care"],
      ["ln-04-r3", "Self-managed clients can hire anyone without a provider check"],
    ],
    primary: "ln-04-r1",
    actions: [
      ["ln-04-a1", "Start the engagement: screening, insurance, onboarding, scope, quote, budget and agreement, before booking"],
      ["ln-04-a2", "Let him start; the paperwork can follow"],
      ["ln-04-a3", "Tell her he’s too young"],
    ],
    acceptedActions: ["ln-04-a1"],
    choice: "She can nominate him. Funded work waits until he’s engaged and checked.",
    next: "Check suitability, screening, insurance and onboarding, the service scope, quote, budget and agreement.",
    why: "Self-management doesn’t move responsibility for funded care away from the registered provider. A nominated worker needs the agreement and screening and compliance checks before funded work starts. His age alone isn’t the decision.",
    critical: { lanes: lanes("choice"), actions: ["ln-04-a2"], text: "This case needs a debrief: an unchecked worker would start funded work." },
    twist: {
      fact: "Two weeks later: he’s been engaged by Trilogy Care, his screening and insurance are in place, and the price is agreed in her plan. Can he start?",
      lane: "choice",
      why: "With the checks done and the arrangement agreed, when he starts is her call.",
    },
    refs: [DEPT, TC],
  }),
  card({
    id: "ln-05",
    request: "Can I buy this $1,200 lift chair from Temple & Webster with my aged care funding?",
    facts: ["No AT-HM approval shown.", "No assessment of the item, and no purchase agreement."],
    funding: "Equipment like this has its own AT-HM pathway, separate from the quarterly services budget.",
    lane: "check",
    reasons: [
      ["ln-05-r1", "Eligibility, assessed need and the separate AT-HM pathway need checking"],
      ["ln-05-r2", "A high price automatically disqualifies it"],
      ["ln-05-r3", "Any retailer receipt can be charged to quarterly services"],
    ],
    primary: "ln-05-r1",
    actions: [
      ["ln-05-a1", "Check assessed need, AT-HM eligibility, suitability, any prescription and a quote, without promising the quarterly budget"],
      ["ln-05-a2", "Approve it from the quarterly budget"],
      ["ln-05-a3", "Say chairs aren’t funded"],
    ],
    acceptedActions: ["ln-05-a1"],
    choice: "Wanting a lift chair is a fair request to look into.",
    next: "Check assessed need, AT-HM eligibility and funding, suitability, any prescription and a quote.",
    why: "AT-HM equipment has a separate funding pathway with its own requirements. The retailer and price alone neither approve nor exclude it.",
    twist: {
      fact: "She adds: “Please charge it to my ordinary quarterly services budget.”",
      lane: "cannot",
      why: "AT-HM equipment has its own pathway. Trilogy Care can’t put it through the quarterly services budget as asked; explain why and look at the AT-HM route.",
    },
    refs: [ATHM, LIST],
  }),
  card({
    id: "ln-06",
    request: "I now need two more personal care visits a week.",
    facts: ["The current care plan and remaining funding haven’t been checked.", "No urgent need described."],
    lane: "check",
    reasons: [
      ["ln-06-r1", "Changed needs mean reviewing the care plan, budget and any assessment with the person"],
      ["ln-06-r2", "Extra visits can always be added straight away"],
      ["ln-06-r3", "Personal care can’t be increased"],
    ],
    primary: "ln-06-r1",
    actions: [
      ["ln-06-a1", "Review the changed needs, care plan and budget with her, and arrange an interim safe response if anything is urgent"],
      ["ln-06-a2", "Book two more visits now"],
      ["ln-06-a3", "Tell her to wait for her next annual review"],
    ],
    acceptedActions: ["ln-06-a1"],
    choice: "Her needs have changed, and she’s said so: that matters.",
    next: "Review the needs, care plan, budget and any reassessment with her; respond safely in the meantime if it’s urgent.",
    why: "A change in needs may need a plan or budget change, or a reassessment, before more funded visits are agreed. If the need is urgent, there’s an interim safe response; it doesn’t wait for paperwork.",
    refs: [DEPT],
  }),
  card({
    id: "ln-07",
    request: "My preferred physiotherapist has raised their rate. Can we keep the weekly visits?",
    facts: ["The plan includes physiotherapy.", "The new rate hasn’t been agreed."],
    lane: "check",
    reasons: [
      ["ln-07-r1", "The new price, its funding impact and an updated agreement need checking before the changed rate is authorised"],
      ["ln-07-r2", "A price rise means the physio has to be replaced"],
      ["ln-07-r3", "The physio is already approved, so any rate is fine"],
    ],
    primary: "ln-07-r1",
    actions: [
      ["ln-07-a1", "Verify the new price and funding impact, and update the agreement before authorising it"],
      ["ln-07-a2", "Keep paying whatever they invoice"],
      ["ln-07-a3", "Find a cheaper physio"],
    ],
    acceptedActions: ["ln-07-a1"],
    choice: "Keeping her preferred physio is her choice.",
    next: "Verify the price, the funding impact and the arrangement, and update the agreement.",
    why: "A changed price changes the funded arrangement. Check it and agree it before the new rate is authorised; her choice of physio stands.",
    refs: [DEPT, TC],
  }),
  card({
    id: "ln-08",
    request: "My favourite gardener’s insurance expired yesterday. Let them work tomorrow and send the renewal next week.",
    facts: ["The gardener’s required insurance has lapsed.", "A funded visit is booked for tomorrow."],
    lane: "cannot",
    reasons: [
      ["ln-08-r1", "The worker doesn’t currently pass Trilogy Care’s compliance check, so the funded booking can’t go ahead"],
      ["ln-08-r2", "A day’s lapse doesn’t matter"],
      ["ln-08-r3", "The gardener can never work for her again"],
    ],
    primary: "ln-08-r1",
    actions: [
      ["ln-08-a1", "Explain why tomorrow’s funded visit is paused, ask for valid evidence, and offer an approved alternative"],
      ["ln-08-a2", "Just say no"],
      ["ln-08-a3", "Let them work and chase the renewal"],
    ],
    acceptedActions: ["ln-08-a1"],
    choice: "She can keep the gardener she likes once the insurance is current.",
    next: "Pause that funded booking, request valid evidence, and offer an approved alternative.",
    why: "Third-party workers have to meet the required compliance checks while they deliver funded services. A lapse means pausing the booking, not ending the relationship.",
    critical: { lanes: lanes("choice"), actions: ["ln-08-a3"], text: "This case needs a debrief: a worker without current insurance would do funded work." },
    refs: [DEPT, TC],
  }),
  card({
    id: "ln-09",
    request: "While the cleaner is here, ask her to climb a ladder and clear the gutters.",
    facts: ["The booked worker provides domestic cleaning.", "Gutter clearing isn’t part of that arrangement."],
    lane: "cannot",
    reasons: [
      ["ln-09-r1", "The requested cleaner and task haven’t been approved together"],
      ["ln-09-r2", "Gutter cleaning is never a Support at Home service"],
      ["ln-09-r3", "The cleaner can do anything the client asks"],
    ],
    primary: "ln-09-r1",
    actions: [
      ["ln-09-a1", "Explain the cleaner can’t take on the ladder task, and offer to assess gutter clearing separately with a suitable provider"],
      ["ln-09-a2", "Just say no"],
      ["ln-09-a3", "Tell her gutters are never covered"],
    ],
    acceptedActions: ["ln-09-a1"],
    choice: "Wanting the gutters done is reasonable.",
    next: "Don’t extend the cleaning visit; assess gutter clearing separately and arrange a suitable provider.",
    why: "Gutter cleaning can be eligible essential home maintenance in some circumstances. The issue here is the worker and the task: a domestic cleaning visit isn’t an assessed ladder task.",
    refs: [LIST, DEPT],
  }),
  card({
    id: "ln-10",
    request: "I’ll pay my neighbour cash for visits and send you the receipts later; you needn’t register them.",
    facts: ["The neighbour hasn’t been engaged or checked.", "No price or plan for the visits."],
    lane: "cannot",
    reasons: [
      ["ln-10-r1", "An unengaged worker arrangement can’t be reimbursed as funded care"],
      ["ln-10-r2", "Cash payments are against the law"],
      ["ln-10-r3", "Receipts make any arrangement claimable"],
    ],
    primary: "ln-10-r1",
    actions: [
      ["ln-10-a1", "Explain it can’t be funded this way, and offer the normal engagement, screening, price and care plan process for the neighbour"],
      ["ln-10-a2", "Just say no"],
      ["ln-10-a3", "Accept the receipts this once"],
    ],
    acceptedActions: ["ln-10-a1"],
    choice: "She can choose her neighbour, through the normal process.",
    next: "Offer the third-party engagement, screening, price and care plan process.",
    why: "Third-party workers need an agreement with the registered provider and the applicable checks. Receipts after the fact don’t turn an unengaged arrangement into funded care.",
    critical: {
      lanes: lanes("choice"),
      actions: ["ln-10-a3"],
      text: "This case needs a debrief: an unchecked, unengaged worker would be paid as funded care.",
    },
    refs: [DEPT, TC],
  }),
];

const deck: LineBlockData = {
  title: "Where Is the Line?",
  intro: "Your client is in the driver’s seat. Trilogy Care is still responsible for the care it funds. Where would you draw the line?",
  learnerRole: "You’re a Care Partner for self-managed Support at Home clients.",
  shuffle: true,
  cases,
  source: { title: "", version: "" },
  approval: { owner: "", sme: "", clinical: "", quality: "", approvedOn: "" },
};

export const LINE_CASES = [
  { id: "self-managed", name: "Ten self-managed requests", teaches: "Choice, checks and what can’t be authorised as asked", data: deck },
] as const;
