import type { GoldenScriptVersion, IncidentPathVersion, PocketTool } from "@/lib/pocketPlaybook";

/*
  The Live Call Pocket Playbook's pilot content (docs/pocket-playbook.md). Everything here is a DRAFT, awaiting the
  owners named on each tool. Fictional and editorial: nothing is operational instruction until the owner approves a
  version. The pilot shows these with "Draft: awaiting approval" on every surface.

  - Tool A's numbers are in content/quickCalcRules.ts.
  - Tool B builds on the existing Job Aid "Suspected SIRS Priority 1: first steps" (sirs-first-steps) and links it;
    it doesn't copy it. Its contact is the same directory entry ("incident-responder"), which stays empty until
    Quality enters the real route.
  - Tool C's four scripts are the PRD's pilot set, unapproved.
*/

export const POCKET_TOOLS: PocketTool[] = [
  {
    id: "contribution-quick-calc",
    family: "calculator",
    title: "Contribution Quick-Calc",
    task: "A participant asks why they’re paying for a service, or what a service will cost them.",
    purpose:
      "Work out an estimated participant contribution for one service from the agreed price and the notified rate, and say what to check before quoting it.",
    audiences: ["coordinator", "staff"],
    owner: "Finance (Support at Home contributions)",
    reviewer: "Finance contributions owner",
    version: 1,
    status: "draft",
    effectiveOn: "",
    reviewedOn: "",
    nextReview: "2027-04-01",
    awaiting:
      "Finance: the participant-rate and agreed-price sources, rounding, the dated category map, grandfathered and interim treatment, the funding view, wording and the escalation contact.",
    sources: [
      {
        label: "Support at Home participant contributions (Department)",
        href: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/support-at-home-participant-contributions",
        section: "Service categories and individual rates",
        kind: "programme",
      },
    ],
    tags: [
      "contribution",
      "cost",
      "gardening",
      "price",
      "rate",
      "statement",
      "pending",
      "interim",
      "everyday living",
      "independence",
      "clinical",
      "personal care",
    ],
    fallback: {
      text: "The Quick-Calc isn’t available. Don’t estimate: tell the participant you’ll check, and ask Finance support.",
      contactKey: "finance-support",
    },
    relatedAids: ["invoice-rate-check", "quarterly-budget-check"],
    themeId: "",
  },
  {
    id: "incident-first-steps",
    family: "escalation",
    title: "Incident first steps",
    task: "Someone tells you about a fall, a bruise, rough handling, or anything else that might be an incident.",
    purpose: "What to do now: safety first, then the internal route and the incident system, then the SIRS prompts and sources for the authorised reviewer.",
    audiences: ["partner", "coordinator", "staff"],
    owner: "Quality and Clinical Governance",
    reviewer: "Quality, incident and SIRS owner",
    version: 1,
    status: "draft",
    effectiveOn: "",
    reviewedOn: "",
    nextReview: "2027-02-01",
    awaiting:
      "Quality: the immediate and after-hours contacts, the Incident Management System link, the internal recording and escalation steps, who decides reportability and priority, the review cadence and the withdrawal trigger.",
    sources: [
      {
        label: "Incident management and SIRS (Commission provider handbook)",
        href: "https://www.agedcarequality.gov.au/provider-handbook/provider-requirements/3g-incident-management-and-serious-incident-response-scheme",
        section: "3G Incident management and the Serious Incident Response Scheme",
        kind: "commission",
      },
    ],
    tags: ["incident", "injury", "sirs", "bruise", "fall", "abuse", "neglect", "safety", "escalate", "rough handling", "harm"],
    fallback: { text: "In an emergency, call 000. Otherwise tell the designated incident responder now.", contactKey: "incident-responder" },
    relatedAids: ["sirs-first-steps"],
    themeId: "",
  },
  {
    id: "golden-scripts",
    family: "script",
    title: "Golden Scripts: Notes to a Younger Me",
    task: "You need good first words for a hard moment on a call.",
    purpose: "Short, reviewed openings for common difficult moments, with the facts to fill in, what to check first and what not to promise.",
    audiences: ["coordinator", "staff"],
    owner: "Care Operations",
    reviewer: "Operations, with Quality and Finance for their topics",
    version: 1,
    status: "draft",
    effectiveOn: "",
    reviewedOn: "",
    nextReview: "2027-02-01",
    awaiting: "Operations: the first script set, permitted wording, callback ownership, and how coordinators use the drawer during calls.",
    sources: [
      { label: "Pilot scripts (Partner Hub PRD, 21 November 2026)", href: "", section: "Illustrative wording, awaiting Operations review", kind: "example" },
    ],
    tags: ["script", "what to say", "words", "family", "daughter", "missed visit", "no-show", "contractor", "contribution", "incident", "consent", "budget"],
    fallback: { text: "Scripts aren’t available. Listen, say you’ll check, and agree when you’ll call back.", contactKey: "" },
    relatedAids: ["ask-before-changing-the-plan"],
    themeId: "",
  },
];

export const INCIDENT_PATH: IncidentPathVersion = {
  id: "incident-first-steps",
  version: 1,
  status: "draft",
  serviceSetting: "Support at Home: services in the person’s home and community",
  safety: {
    question: "Is the person in immediate danger, or do they need emergency or clinical help now? Are they still exposed to harm?",
    emergency: [
      "Call 000 for an emergency.",
      "Make the person as safe as you can, without putting yourself at risk.",
      "Stay with them, or arrange for someone to, until help arrives.",
      "Then tell the incident responder (step 2) as soon as it’s safe.",
    ],
    notNow: ["Check the person is safe and supported now.", "Go straight to step 2: telling the responder can’t wait until you know more."],
  },
  internal: {
    contactKey: "incident-responder",
    // Supplied by Quality before release. The page says it's missing rather than guessing an address.
    imsUrl: "",
    afterHours: "",
    steps: [
      "Tell the designated incident responder now, using the route shown here.",
      "Record the facts in the Incident Management System: what happened or was alleged, and when and how you became aware. Not here: this tool keeps nothing you type.",
      "Follow the responder’s direction. Every incident is managed, whether or not it turns out to be reportable.",
    ],
  },
  sirs: {
    intro: "Reviewed prompts for the authorised reviewer’s assessment. They are not a checklist for deciding it yourself.",
    types: [
      { id: "force", label: "Unreasonable use of force", prompt: "Was force used on the person that wasn’t reasonable, such as rough handling?" },
      {
        id: "sexual",
        label: "Unlawful sexual contact or inappropriate sexual conduct",
        prompt: "Was there any sexual contact or conduct that wasn’t appropriate?",
      },
      { id: "psychological", label: "Psychological or emotional abuse", prompt: "Was the person threatened, intimidated, humiliated or yelled at?" },
      { id: "death", label: "Unexpected death", prompt: "Did the person die unexpectedly, in connection with their care?" },
      {
        id: "stealing",
        label: "Stealing or financial coercion by a staff member",
        prompt: "Did a worker take money or belongings, or pressure the person about money?",
      },
      { id: "neglect", label: "Neglect", prompt: "Did the person miss care they needed, in a way that harmed or could harm them?" },
      {
        id: "restrictive",
        label: "Inappropriate use of restrictive practices",
        prompt: "Was the person restrained or restricted in a way that wasn’t appropriate?",
      },
      { id: "absence", label: "Unexplained absence from care", prompt: "Was the person missing while they were receiving care?" },
    ],
    homeServices:
      "In home services, the scheme covers incidents that happen, or are alleged or suspected to have happened, in connection with the care and services the provider delivers.",
    alleged: "Alleged or suspected counts. Don’t wait for proof, and don’t investigate first: escalate.",
  },
  priority: {
    p1: "Priority 1: generally, an incident that caused, or could reasonably have caused, injury or discomfort needing medical or psychological treatment, and some types regardless (such as unexpected death). The provider notifies the Commission within 24 hours of becoming aware.",
    p2: "Priority 2: other reportable incidents. The provider notifies the Commission within 30 days of becoming aware.",
    awareness:
      "The clock runs from when the provider became aware: that can be the moment you were told. It’s why the internal step can’t wait for the assessment.",
    decider: "The authorised Trilogy Care reviewer decides reportability and priority and makes any notification. Not you, and not this tool.",
    notInternal: "These timeframes are the provider’s notification duty. They are never a reason to delay telling the responder.",
  },
  followThrough: [
    "Protect the person, and support their wishes.",
    "Keep relevant information safe: don’t tidy up, alter or discuss the details more widely than needed.",
    "Follow the approved investigation, communication and open-disclosure process the responder directs.",
  ],
  links: [
    {
      label: "Incident management and SIRS (Commission provider handbook)",
      href: "https://www.agedcarequality.gov.au/provider-handbook/provider-requirements/3g-incident-management-and-serious-incident-response-scheme",
      section: "3G",
      kind: "commission",
    },
    {
      label: "SIRS in residential and home services (Commission)",
      href: "https://www.agedcarequality.gov.au/for-providers/serious-incident-response-scheme/sirs-residential-home-services",
      section: "Home services scope",
      kind: "commission",
    },
    {
      label: "SIRS decision support tool (Commission)",
      href: "https://www.agedcarequality.gov.au/for-providers/serious-incident-response-scheme/reportable-incidents/support-tool-new",
      section:
        "Supplementary only: the Commission says this page is being updated for the Aged Care Act 2024 and Rules 2025, and the provider stays responsible for its assessment.",
      kind: "commission",
    },
    { label: "Trilogy Care notification workflow", href: "", section: "Awaiting Quality: not supplied yet", kind: "trilogy" },
  ],
  relatedAid: "sirs-first-steps",
};

const PILOT = "Partner Hub PRD pilot set (21 November 2026): illustrative wording, awaiting review";
const script = (s: Omit<GoldenScriptVersion, "version" | "status" | "owner" | "source" | "audiences" | "reviewOn" | "origin">): GoldenScriptVersion => ({
  version: 1,
  status: "draft",
  owner: "Care Operations",
  source: PILOT,
  audiences: ["coordinator", "staff"],
  reviewOn: "",
  origin: "PRD pilot script",
  ...s,
});

export const GOLDEN_SCRIPTS: GoldenScriptVersion[] = [
  script({
    id: "contractor-no-show",
    trigger: "A contractor didn’t arrive.",
    tags: ["missed visit", "no-show", "contractor", "worker", "late", "didn’t turn up", "callback"],
    intent: "Acknowledge the disruption, and commit only to what you can do: check and call back.",
    opening: "I can hear this has disrupted your day. I’ll check the booking and what happened, then call you back by [agreed time].",
    slots: [{ key: "time", label: "agreed time", hint: "A time you can keep, agreed with the person now." }],
    check: "Check who owns the callback, and that you can keep the time you give.",
    guardrail: "Don’t give an unverified reason or promise a replacement before scheduling confirms it.",
    next: "Check the booking with scheduling, call back by the agreed time, and record the missed visit the approved way.",
    related: [],
    reviewer: "Operations",
  }),
  script({
    id: "contribution-question",
    trigger: "A participant asks why they’re paying for something.",
    tags: ["contribution", "cost", "paying", "statement", "gardening", "free", "bill", "price not confirmed"],
    intent: "Explain the amount from the real figures, not a guess.",
    opening: "Let’s check the service price and the contribution rate you’ve been given, so I can explain the amount on your statement.",
    slots: [],
    check: "Have the agreed price and the participant’s notified rate in front of you, from their record.",
    guardrail: "Don’t estimate from income, and don’t promise an exemption, without the confirmed record.",
    next: "Use the Contribution Quick-Calc; if the rate is pending or unclear, say so and route it to Finance.",
    related: [{ kind: "tool", id: "contribution-quick-calc", label: "Contribution Quick-Calc" }],
    reviewer: "Finance",
  }),
  script({
    id: "family-asks-to-decide",
    trigger: "A family member wants to make the decision, or wants the budget details.",
    tags: ["family", "daughter", "son", "budget", "decide", "consent", "information", "supporter", "decision-maker"],
    intent: "Take the concern seriously, and keep the older person at the centre of the decision.",
    opening: "I want to understand your concern and also check what [older person] wants and who they’ve asked us to involve.",
    slots: [{ key: "person", label: "older person", hint: "How the participant likes to be named. Not their full name in anything you copy." }],
    check: "Check consent, any supporter or appointed decision-maker status, and the exact decision being asked about.",
    guardrail: "Don’t share the participant’s information, or agree a change, until you’ve checked who they’ve asked us to involve.",
    next: "Follow “Ask before changing the plan”, and record who was involved.",
    related: [{ kind: "aid", id: "ask-before-changing-the-plan", label: "Ask before changing the plan" }],
    reviewer: "Quality",
  }),
  script({
    id: "possible-incident",
    trigger: "Someone tells you something that might be an incident.",
    tags: ["incident", "bruise", "fall", "hurt", "injury", "abuse", "neglect", "rough handling", "sirs"],
    intent: "Thank them, put safety first, and take it to the right team now.",
    opening: "Thank you for telling me. I need to make sure [person] is safe and pass this to the right team now.",
    slots: [{ key: "person", label: "person", hint: "How the person is named on the call." }],
    check: "Is anyone in immediate danger? If so, the emergency route comes first.",
    guardrail: "Follow the current urgent and internal incident route. Don’t say it is or isn’t SIRS-reportable from the script alone.",
    next: "Open Incident first steps, and tell the incident responder now.",
    related: [
      { kind: "tool", id: "incident-first-steps", label: "Incident first steps" },
      { kind: "aid", id: "sirs-first-steps", label: "Suspected SIRS Priority 1: first steps" },
    ],
    reviewer: "Quality",
  }),
];
