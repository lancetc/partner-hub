import type { Anchor, Category, MythTileData } from "@/lib/myths";

/*
  The fifteen Myth vs Reality demonstration entries (docs/myth-vs-reality.md, "The demonstration entries"), from the
  owner's brief, word for word: the question, myth, reality, 30-second script, checks, source and email reply.

  - They go in as drafts with scripts/seed-myth-demo.ts, which only adds an id that isn't there yet, so an entry an
    author has edited is never overwritten. None is approved: learners never see them. Authors see them in the
    Resources page's labelled preview, "Demo content · Pending compliance approval".
  - What the brief didn't give is left for the library to fill in before approval: an email subject, which programs
    each applies to, each source's section and the date it was checked, a review date and the sign-off.
  - A public source keeps its link exactly; its document name is the page's name, as on the owner's reference card.
    The two internal-policy sources keep "pending internal verification" and are marked unverified.
*/

export const DEMO_REVIEWED = "2026-11-25";
export const DEMO_OWNER = "Quality and Compliance";

const HEALTH = "Australian Government Department of Health, Disability and Ageing";
const COMMISSION = "Aged Care Quality and Safety Commission";
const web = (document: string, publisher: string, url: string): Anchor => ({
  type: "guidance",
  document,
  section: "",
  publisher,
  url,
  internalId: "",
  effective: "",
  verifiedOn: "",
  unverified: false,
});
/** An internal policy the brief cites as "pending internal verification": kept word for word, and marked unverified. */
const pending = (document: string): Anchor => ({
  type: "internal",
  document,
  section: "",
  publisher: "Trilogy Care",
  url: "",
  internalId: "",
  effective: "",
  verifiedOn: "",
  unverified: true,
});

const BUDGETS = web(
  "Individualised budgets for Support at Home participants",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/individualised-budgets-for-support-at-home-participants",
);
const CONTRIBUTIONS = web(
  "Support at Home participant contributions",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/support-at-home-participant-contributions",
);
const RIGHTS = web("Statement of Rights", COMMISSION, "https://www.agedcarequality.gov.au/older-people/your-rights/statement-rights");
const AT_HM = web(
  "Assistive Technology and Home Modifications (AT-HM) scheme",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/assistive-technology-and-home-modifications-at-hm-scheme",
);
const SUPPORTERS = web("Supporters", COMMISSION, "https://www.agedcarequality.gov.au/contact-us/complaints-feedback/make-complaint/supporters");
const SERVICES = web(
  "Services under Support at Home",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/services-under-support-at-home",
);
const CLASSIFICATIONS = web(
  "Funding classifications for Support at Home",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home",
);
const CHARGING = web(
  "Charging for Support at Home services",
  HEALTH,
  "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services",
);

type Entry = {
  question: string;
  category: Category;
  myth: string;
  reality: string;
  say: string;
  check: string;
  source: Anchor;
  email: string;
  phrases: string[];
  funding?: boolean;
  clinical?: boolean;
};

const tile = (e: Entry): MythTileData => ({
  quote: e.question,
  category: e.category,
  audiences: ["partner", "coordinator", "staff"],
  applicability: [],
  answer: e.say,
  exception: "",
  checks: [e.check],
  familyWording: "",
  anchors: [{ ...e.source }],
  message: { subject: "", body: e.email },
  placeholders: [],
  copyNote: "",
  funding: Boolean(e.funding),
  clinical: Boolean(e.clinical),
  aiDraft: false,
  reviewDue: "",
  approval: { owner: "", quality: "", operations: "", finance: "", clinical: "", communications: "", approvedOn: "" },
  myth: e.myth,
  reality: e.reality,
  searchPhrases: e.phrases,
  lastReviewed: DEMO_REVIEWED,
  contentOwner: DEMO_OWNER,
  demo: true,
});

/** Stable ids, so the seed can tell what is already there. */
export const DEMO_TILES: { id: string; data: MythTileData }[] = (
  [
    [
      "demo-myth-01-unspent-funds",
      {
        question: "Will I lose all my unspent funds?",
        category: "budget",
        myth: "I need to spend everything before the quarter ends.",
        reality: "Limited unused quarterly funding can carry forward. Retained Home Care Package funds are subject to different arrangements.",
        say: "You don't necessarily need to spend everything. You can carry forward up to $1,000 or 10% of your quarterly Support at Home budget, whichever is greater. Let's review your upcoming services and outstanding invoices before deciding whether you need anything else.",
        check: "Quarterly allocation, outstanding invoices, committed services and retained Home Care Package funds.",
        source: BUDGETS,
        email:
          "Thank you for asking about your remaining quarterly budget. We can review your available funding, outstanding invoices and upcoming services together to help you understand what can carry forward and whether any additional support is needed.",
        phrases: [
          "lose my money",
          "lose my funds",
          "leftover funds",
          "left over money",
          "use it or lose it",
          "quarter end",
          "end of the quarter",
          "unspent",
          "carry over",
          "carryover",
          "roll over",
          "rollover",
        ],
        funding: true,
      },
    ],
    [
      "demo-myth-02-home-care-free",
      {
        question: "Isn't home care supposed to be free?",
        category: "contributions",
        myth: "Government-funded aged care means I don't have to pay anything.",
        reality: "Contributions depend on the service category, individual financial circumstances and applicable contribution arrangements.",
        say: "The government helps fund your care, but some services may require a personal contribution. The amount depends on the type of service and your individual circumstances. Let's look at which services you're receiving and what contribution arrangements apply to you.",
        check: "Services Australia assessment, service category, transitional protections and applicable contribution rates.",
        source: CONTRIBUTIONS,
        email:
          "Thank you for your question about service costs. Your personal contributions depend on the services you receive and your individual contribution arrangements. We can review these together and explain what costs, if any, apply.",
        phrases: ["free", "pay anything", "how much do I pay", "what do I pay", "cost", "out of pocket", "fees", "contribution", "co-payment", "means test"],
        funding: true,
      },
    ],
    [
      "demo-myth-03-own-gardener",
      {
        question: "Can I choose my own gardener?",
        category: "provider-choice",
        myth: "I can only use the gardener my care provider recommends.",
        reality: "Participants can express their provider preferences, subject to appropriate suitability, safety and provider requirements.",
        say: "Absolutely, you can tell us who you'd prefer to use. Before arranging services, we need to complete the appropriate checks and make sure the gardening work can be funded. We'll work with you and your preferred gardener to see what's possible.",
        check: "Approved services, contractor suitability, insurance, applicable screening, rates and Trilogy Care onboarding requirements.",
        source: RIGHTS,
        email:
          "We welcome your preference to use your own gardener. Please provide their contact details so we can review their suitability and the proposed services before confirming the arrangement.",
        phrases: [
          "my own gardener",
          "own worker",
          "my own provider",
          "choose my provider",
          "pick my own",
          "someone I know",
          "lawn mowing",
          "tradie",
          "contractor",
        ],
      },
    ],
    [
      "demo-myth-04-bathroom-renovation",
      {
        question: "Can I use my funding to renovate my bathroom?",
        category: "equipment-modifications",
        myth: "My aged care funding can pay for a complete bathroom renovation.",
        reality: "Eligible home modifications must address assessed care needs and meet applicable funding and approval requirements.",
        say: "We may be able to arrange modifications that make your bathroom safer and more accessible. However, a general renovation isn't automatically covered. We'll need to understand your assessed needs and identify which modifications are eligible.",
        check: "Support plan, AT-HM approval, clinical recommendations, funding availability and itemised quotes.",
        source: AT_HM,
        email:
          "Thank you for discussing your proposed bathroom modifications. We can review the changes you need, arrange an appropriate assessment where required and confirm which items may be eligible for funding before any work begins.",
        phrases: ["renovate", "renovation", "new bathroom", "grab rails", "shower rail", "home modifications", "make my house safer", "ramp", "AT-HM"],
        funding: true,
      },
    ],
    [
      "demo-myth-05-daughter-budget-access",
      {
        question: "Can my daughter access my budget?",
        category: "privacy",
        myth: "Immediate family members automatically have access to my aged care information.",
        reality: "Family relationships alone do not establish unrestricted access to personal or financial information.",
        say: "We're happy to involve your daughter if that's what you'd like. We need to respect your privacy and confirm what information you're comfortable sharing, or whether another appropriate authority applies.",
        check: "Participant consent, registered supporter arrangements, legal authority and information-sharing permissions.",
        source: SUPPORTERS,
        email:
          "We understand that family members often help with care arrangements. Before sharing personal budget information, we need to confirm the participant's consent or another appropriate authority. We can help clarify the arrangements currently in place.",
        phrases: ["my daughter", "my son", "family access", "see my budget", "see my statement", "share my information", "privacy", "consent", "next of kin"],
      },
    ],
    [
      "demo-myth-06-spend-on-anything",
      {
        question: "Can I spend my funding on anything that helps me at home?",
        category: "services",
        myth: "If something helps me remain at home, my funding should cover it.",
        reality: "Funded services and purchases must meet program eligibility requirements and address assessed care needs.",
        say: "Your funding is intended to support your assessed aged care needs. While many things might make life at home easier, not everything can be funded through Support at Home. Let's look at what you're requesting and whether it fits the eligible service arrangements.",
        check: "Support at Home service list, assessed needs, support plan, exclusions and available funding.",
        source: SERVICES,
        email:
          "Thank you for your request. We will review the proposed purchase against your assessed care needs and the applicable Support at Home funding requirements before confirming whether it can be included.",
        phrases: [
          "anything I want",
          "pay for anything",
          "what can I buy",
          "what's covered",
          "is it covered",
          "groceries",
          "spend on",
          "excluded",
          "not allowed",
        ],
        funding: true,
      },
    ],
    [
      "demo-myth-07-cleaner-shower",
      {
        question: "Can my cleaner help me shower?",
        category: "worker-roles",
        myth: "If my cleaner is already here, they can help with personal care.",
        reality: "Workers must operate within their authorised role, capability and agreed service arrangements.",
        say: "We understand why it would be convenient, but your cleaner may not be authorised or appropriately trained to provide personal care. We want to make sure you receive that assistance safely. Let's arrange the right support for you.",
        check: "Approved personal care services, worker competence, service agreement, care plan and immediate safety concerns.",
        source: pending("Support at Home service guidance and Trilogy Care scope-of-practice policy, pending internal verification."),
        email:
          "Thank you for letting us know you need assistance with showering. We can review your care needs and arrange appropriate personal care support through a suitably qualified or competent worker.",
        phrases: ["cleaner", "help me shower", "showering", "help me wash", "personal care", "while they're here", "scope of practice", "not trained"],
        clinical: true,
      },
    ],
    [
      "demo-myth-08-buy-equipment",
      {
        question: "Can I buy my own equipment and claim it back?",
        category: "equipment-reimbursement",
        myth: "I can purchase equipment myself and automatically be reimbursed.",
        reality: "Equipment purchases must meet eligibility, assessment and applicable approval requirements. Reimbursement should not be assumed.",
        say: "Before buying anything, please check with us. Some equipment requires an assessment, recommendation or approval. Checking first helps avoid a situation where you've paid for something that cannot be funded.",
        check: "AT-HM eligibility, clinical recommendation, funding approval, purchase arrangements and internal reimbursement policy.",
        source: AT_HM,
        email:
          "Before proceeding with your purchase, please send us the equipment details and estimated cost. We can review its eligibility and confirm the appropriate purchasing arrangements.",
        phrases: ["buy it myself", "claim it back", "reimburse", "reimbursement", "pay me back", "refund", "receipt", "walker", "equipment", "mobility aid"],
        funding: true,
      },
    ],
    [
      "demo-myth-09-complaints",
      {
        question: "If I complain, will my services be affected?",
        category: "complaints",
        myth: "Complaining might result in losing my care services.",
        reality: "Participants have the right to raise concerns and receive a fair response without reprisal.",
        say: "You have every right to tell us when something isn't working. Raising a concern should not result in unfair treatment or retaliation. We want to understand what happened and work with you to resolve it.",
        check: "Immediate safety concerns, participant preferences, complaint details, escalation requirements and follow-up arrangements.",
        source: RIGHTS,
        email:
          "Thank you for raising your concern. Your feedback is important, and we will review the matter respectfully and fairly. We will explain the next steps and keep you informed as we work towards a resolution.",
        phrases: ["complain", "complaint", "get in trouble", "lose my services", "speak up", "unhappy", "not happy", "feedback", "retaliation", "reprisal"],
      },
    ],
    [
      "demo-myth-10-refuse-service",
      {
        question: "Can I refuse a scheduled service?",
        category: "choice",
        myth: "Once a service is in my care plan, I have to accept it.",
        reality: "Participants retain choice and control over their care, including declining services.",
        say: "You have the right to make decisions about your care. If a service isn't working for you, we can discuss changing it. We'll also explain any safety considerations or applicable cancellation arrangements so you can make an informed choice.",
        check: "Participant preferences, cancellation terms, safety concerns and alternative arrangements.",
        source: RIGHTS,
        email:
          "We respect your decision regarding the scheduled service. Please let us know what you would prefer, and we can discuss alternative arrangements and any applicable cancellation conditions.",
        phrases: ["say no", "don't want it", "do I have to", "cancel a visit", "refuse", "skip a service", "decline", "turn it down", "choice and control"],
      },
    ],
    [
      "demo-myth-11-daughter-decisions",
      {
        question: "Does my daughter get to make all my care decisions?",
        category: "supported-decisions",
        myth: "A family member or registered supporter automatically takes over decision-making.",
        reality:
          "Supporters assist participants to understand, communicate and make their own decisions. Separate lawful decision-making authority may apply in particular circumstances.",
        say: "Your daughter can help you understand information and communicate your wishes, but that doesn't automatically mean she makes decisions for you. Your preferences remain central. We'll work with you to understand what support you want.",
        check: "Participant wishes, registered supporter arrangements and any relevant substitute decision-making authority.",
        source: SUPPORTERS,
        email:
          "We recognise the important role family members can play in supporting care decisions. Our approach is to keep the participant's wishes central while respecting any formally established decision-making arrangements.",
        phrases: [
          "my daughter decides",
          "who decides",
          "make decisions for me",
          "power of attorney",
          "guardian",
          "supporter",
          "registered supporter",
          "take over",
        ],
      },
    ],
    [
      "demo-myth-12-increase-funding",
      {
        question: "Can I increase my funding if my needs change?",
        category: "assessments",
        myth: "My funding classification can never change.",
        reality: "Changes in care needs may warrant a review or reassessment, although increased funding is not guaranteed.",
        say: "If your needs have changed, we can help identify whether a review or reassessment is appropriate. We'll look at your current services, what's changed and what additional support may be required.",
        check: "Current classification, changed circumstances, clinical evidence, support plan and immediate care needs.",
        source: CLASSIFICATIONS,
        email:
          "Thank you for letting us know about your changed circumstances. We can review your current care arrangements and discuss whether a support plan review or reassessment may be appropriate.",
        phrases: [
          "more money",
          "more funding",
          "needs changed",
          "getting worse",
          "not enough",
          "higher level",
          "reassessment",
          "reassess",
          "upgrade",
          "classification",
        ],
        funding: true,
      },
    ],
    [
      "demo-myth-13-gardener-no-show",
      {
        question: "My gardener didn't arrive. Do I still have to pay?",
        category: "invoices",
        myth: "Every scheduled service must be paid for, even when the provider does not attend.",
        reality: "Charges should reflect applicable service delivery and cancellation arrangements. An unexpected provider absence requires investigation.",
        say: "Let's check what happened before making any assumptions about the charge. We'll review the appointment, speak with the provider and confirm whether an invoice has been submitted. If something has been charged incorrectly, we'll work through the appropriate correction process.",
        check: "Service booking, provider attendance, invoice status, cancellation terms and payment records.",
        source: pending("Support at Home charging guidance and Trilogy Care invoice dispute policy, pending internal verification."),
        email:
          "Thank you for advising us that your scheduled service did not take place. We will review the booking and any associated charges, contact the provider and update you on the outcome.",
        phrases: ["didn't turn up", "didn't show up", "no show", "didn't come", "charged anyway", "wrong invoice", "wrong charge", "missed visit", "dispute"],
        funding: true,
      },
    ],
    [
      "demo-myth-14-dashboard-balance",
      {
        question: "My dashboard shows money left. Can I spend it all?",
        category: "budget",
        myth: "The displayed balance is always the amount available for new purchases.",
        reality: "Outstanding invoices, future commitments and applicable funding restrictions may affect the amount available.",
        say: "The balance is a useful starting point, but it may not tell the whole story. We need to account for services already delivered, invoices still being processed and upcoming commitments before deciding how much is genuinely available.",
        check: "Unprocessed invoices, scheduled services, funding category, existing commitments and quarter-end timing.",
        source: BUDGETS,
        email:
          "We can help you understand your current available funding by reviewing your displayed balance alongside outstanding invoices and planned services. This will help ensure any additional spending does not compromise your existing care arrangements.",
        phrases: [
          "money left",
          "leftover funds",
          "left over money",
          "what I have left",
          "spend it all",
          "my balance",
          "available funds",
          "quarter end",
          "end of the quarter",
          "lose my money",
        ],
        funding: true,
      },
    ],
    [
      "demo-myth-15-personal-care-contribution",
      {
        question: "Do I still pay a contribution for personal care?",
        category: "contributions",
        myth: "Showering and dressing assistance always attract a personal contribution.",
        reality: "From 1 October 2026, personal care moved into the Clinical Supports contribution category under Support at Home.",
        say: "The contribution arrangements for personal care changed on 1 October 2026. Eligible personal care services are now fully government-funded within the program arrangements. Let's check your approved services and the date of the service to confirm what applies to you.",
        check: "Service delivery date, approved personal care service type, invoice classification and applicable funding arrangements.",
        source: CHARGING,
        email:
          "Thank you for asking about personal care contributions. The contribution arrangements changed on 1 October 2026. We can review your approved services and recent charges to confirm that the correct arrangements have been applied.",
        phrases: [
          "pay for showering",
          "pay for personal care",
          "personal care cost",
          "dressing",
          "showering",
          "clinical supports",
          "contribution",
          "1 October",
          "fee changed",
        ],
        funding: true,
      },
    ],
  ] as [string, Entry][]
).map(([id, e]) => ({ id, data: tile(e) }));
