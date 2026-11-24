import type { Contact, ReleaseData, SnippetData, SourceDoc } from "@/lib/playbook";

/*
  The seed playbooks (docs/live-playbooks.md): two placeholder Hub policy records, two snippets bound to them,
  and the two directory contacts they need. Nothing here is approved:

  - The source records are placeholders until Trilogy Care designates its canonical policy repository and supplies
    the current incident and supplier-invoice SOPs.
  - Both releases wait for review. The incident one is safety-critical, so it needs the policy owner's, Clinical's
    and Quality's approval.
  - The contacts are empty: no route is shown until someone enters the real, role-specific route in the directory.
    A release can't be approved while a contact it uses is empty.

  The incident wording follows the PRD's illustrative snippet: a worker notifies the designated responder as soon as
  possible; the authorised provider team assesses category and priority, and makes any Commission notification
  (within 24 hours for Priority 1). Asking a lead doesn't report an incident.
*/

const INCIDENT_TEXT = [
  "If a reportable incident may have occurred:",
  "Protect the person’s immediate safety.",
  "In an emergency, call 000 under the approved procedure.",
  "Notify the designated Trilogy Care incident responder as soon as possible.",
  "Record the facts in the approved incident system.",
  "Follow the responder’s direction.",
  "The authorised provider team assesses the SIRS category and priority and, if applicable, notifies the Commission within the required timeframe (within 24 hours of becoming aware, for Priority 1).",
].join("\n");

const INVOICE_TEXT = [
  "When a supplier invoice is rejected:",
  "Check the rejection reason on the invoice record.",
  "Ask the supplier for a corrected invoice that matches the approved service and rate.",
  "Re-submit it through the invoices queue, noting what changed.",
  "If the rate doesn’t match the approved price list, raise a Finance query before re-submitting.",
].join("\n");

const RATE_TEXT = [
  "Before approving a supplier invoice:",
  "Open the client’s current service agreement.",
  "For each invoice line, compare the service, the date, the unit and the rate with the agreement.",
  "If every line matches, continue with approval.",
  "If a line differs, pause the approval and raise a query through the approved query process. Do not adjust the invoice yourself.",
].join("\n");

const ASK_TEXT = [
  "Before proposing a change to how a person manages something that matters to them:",
  "Ask what the activity means to them and how they manage it now.",
  "Ask what they would want to keep doing.",
  "Name any concern raised by a family member or supporter, and ask how they see it.",
  "Agree what to try together, and when you will check how it is going.",
].join("\n");

const QUARTER_TEXT = [
  "When you plan or review a participant’s services near the end of a quarter:",
  "Open the current authorised budget, care plan and statement.",
  "Separate the current balance from the projected balance: booked services are an estimate until delivered.",
  "Ask the participant what matters to them and what they want to change, before suggesting anything.",
  "Check each change is approved, agreed, deliverable before quarter end, and explain any contribution first.",
  "Route equipment or home modifications through AT–HM, never the ongoing budget.",
  "Record what was agreed and the next check. If needs have changed, or a projected overspend appears, follow the approved escalation route.",
].join("\n");

const HANDOVER_TEXT = [
  "When a participant is coming home from hospital:",
  "Confirm the proposed discharge time, and who at the hospital owns the discharge decision.",
  "Get the signed discharge summary: clinical instructions, medicine changes, equipment and the responsible practitioner. A ward note or a recommendation isn’t an arrangement.",
  "Ask the participant what they want and who they want involved. Check whether a supporter is registered, and share only what the participant agrees to.",
  "Confirm the first essential service in writing with the provider, and who is accountable for it.",
  "If an essential service can’t be covered, tell the clinical lead and the hospital discharge planner straight away. Don’t arrange family or support-worker clinical care, and don’t present the handover as ready.",
  "Route equipment through AT–HM and ask the practitioner for a safe interim plan. If needs have changed, request a Support Plan Review with reasons and evidence: a request isn’t an approval.",
  "Record what’s confirmed, pending and unresolved, with an owner for each, and book the first check after the return home.",
].join("\n");

// The Choosing and Checking Your Contractor Job Aid (docs/document-auditor.md): an editorial example until supplier
// onboarding, Quality, Finance and the Support at Home policy owner supply the approved procedure.
const CONTRACTOR_TEXT = [
  "When a participant asks to use a worker they’ve chosen:",
  "Start with the person: the worker they want, the service and goal, and when they’d like it to start.",
  "Check the service is in their approved care plan and agree what they’ll self-manage. A task outside the plan goes to the care-plan process.",
  "Check the business: an active ABN, and any trading name registered to the same entity. An active ABN doesn’t verify the worker.",
  "Check each worker who will deliver the service: identity, and a current accepted screening route (a police certificate under three years old, or a current NDIS worker screening clearance), verified by the approved method. Don’t ask for both by default.",
  "Check any licence the task needs, and insurance under Trilogy Care’s current policy and contract.",
  "Ask for an itemised quote. Keep the supplier cost and the participant’s price apart: any self-managed overhead is at most 10% of the actual third-party cost, and there are no separate admin or travel fees to the participant.",
  "Use a benchmark as a question, not a cap. Send an unexplained or above-benchmark price to the Finance or contract owner.",
  "Agree the final price with the participant in writing before confirming the start. Record what’s checked, what’s outstanding, each owner, and the renewal dates.",
  "If a check can’t be met, tell the participant what the obstacle is, who can resolve it and what choices remain.",
].join("\n");

export const SEED_SOURCES: SourceDoc[] = [
  {
    id: "incident-procedure",
    title: "Incident response procedure (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Quality and Clinical Governance",
    audiences: ["partner", "coordinator", "staff"],
    sections: [{ anchor: "first-steps", heading: "First steps when a reportable incident may have occurred", text: INCIDENT_TEXT }],
  },
  {
    id: "supplier-invoices",
    title: "Supplier invoices procedure (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Finance",
    audiences: ["partner", "coordinator", "staff"],
    sections: [
      { anchor: "rejected-invoice", heading: "Correcting a rejected supplier invoice", text: INVOICE_TEXT },
      { anchor: "rate-check", heading: "Checking the agreed rate before approving an invoice (editorial example)", text: RATE_TEXT },
    ],
  },
  {
    id: "choice-and-risk",
    title: "Choice and risk conversations (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Quality and Clinical Governance",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "ask-first", heading: "Asking before proposing a change (editorial example)", text: ASK_TEXT }],
  },
  {
    id: "quarter-budget",
    title: "Quarter-end budget planning (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Care Operations and Finance",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "quarter-end", heading: "Planning and reviewing services near quarter end (editorial example)", text: QUARTER_TEXT }],
  },
  {
    id: "hospital-handover",
    title: "Hospital-to-home handover (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Care Partner Operations and Clinical Governance",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "handover-check", heading: "Checking a hospital-to-home handover (editorial example)", text: HANDOVER_TEXT }],
  },
  {
    id: "contractor-onboarding",
    title: "Participant-chosen contractors (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Supplier onboarding, Quality and Finance",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "choosing-checking", heading: "Choosing and checking a participant’s contractor (editorial example)", text: CONTRACTOR_TEXT }],
  },
];

export const SEED_CONTACTS: Contact[] = [
  { key: "incident-responder", label: "Designated incident responder", routes: { partner: "", coordinator: "", staff: "" } },
  { key: "finance-support", label: "Finance support", routes: { partner: "", coordinator: "", staff: "" } },
  // The Hospital-to-Home Handover Check (docs/discharge-pivot.md): placeholders until Trilogy Care supplies the real routes.
  { key: "discharge-clinical-lead", label: "Clinical lead for hospital discharges", routes: { partner: "", coordinator: "", staff: "" } },
  { key: "after-hours-clinical", label: "After-hours clinical escalation", routes: { partner: "", coordinator: "", staff: "" } },
];

const blankApprovals = { owner: "", clinical: "", quality: "" };
/** What every seed shares until it says otherwise. */
const aid = { template: "checklist" as const, trigger: "", minutes: 0, links: [], themeId: "" };
const draft = { quick: "", example: "" };

export const SEED_SNIPPETS: { id: string; data: SnippetData; release: Omit<ReleaseData, "sourceVersion" | "sourceChecksum" | "sourceText"> }[] = [
  {
    id: "sirs-first-steps",
    data: {
      title: "Suspected SIRS Priority 1: first steps",
      purpose: "What a Care Partner or coordinator does first when a reportable incident may have occurred.",
      roleLabel: "Care Partners and coordinators, in the home or on the phone",
      risk: "safety_critical",
      ownerTeam: "Quality and Clinical Governance",
      audiences: ["partner", "coordinator", "staff"],
      source: { docId: "incident-procedure", anchor: "first-steps" },
      fallback: {
        text: "This procedure is temporarily unavailable. In an emergency, call 000. Otherwise, contact the designated incident responder now.",
        contactKeys: ["incident-responder"],
      },
      contactKeys: ["incident-responder"],
      leads: [],
      tag: "incidents",
      ...aid,
      template: "escalation",
      trigger: "You think a reportable incident may have happened.",
      minutes: 2,
    },
    release: {
      steps: [
        {
          id: "safety",
          kind: "now",
          text: "Protect the person’s immediate safety.",
          why: "Safety comes before any record or notification.",
          anchor: "first-steps",
        },
        { id: "emergency", kind: "now", text: "In an emergency, call 000 under the approved procedure.", why: "", anchor: "first-steps" },
        {
          id: "notify",
          kind: "now",
          text: "Notify the designated Trilogy Care incident responder as soon as possible, using the contact route below.",
          why: "The provider’s 24-hour Commission notification for Priority 1 doesn’t make your internal alert something that can wait.",
          anchor: "first-steps",
        },
        {
          id: "record",
          kind: "then",
          text: "Record the facts in the approved incident system.",
          why: "Incident records belong in the incident system, with its privacy controls.",
          anchor: "first-steps",
        },
        { id: "follow", kind: "then", text: "Follow the responder’s direction.", why: "", anchor: "first-steps" },
        {
          id: "unsure",
          kind: "exception",
          text: "Not sure whether it’s reportable? Notify the responder anyway. The authorised provider team decides the SIRS category and priority, and makes any Commission notification within the required timeframe.",
          why: "You don’t have to decide the classification yourself, and a Community answer can’t decide it either.",
          anchor: "first-steps",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: true,
      ...draft,
      approvals: blankApprovals,
    },
  },
  {
    id: "rejected-supplier-invoice",
    data: {
      title: "Correcting a rejected supplier invoice",
      purpose: "Get a rejected invoice fixed and back through, without guessing at the rate.",
      roleLabel: "Care Partners and Finance support",
      risk: "operational",
      ownerTeam: "Finance",
      audiences: ["partner", "coordinator", "staff"],
      source: { docId: "supplier-invoices", anchor: "rejected-invoice" },
      fallback: { text: "This procedure is being updated. Contact Finance support for the current steps.", contactKeys: ["finance-support"] },
      contactKeys: ["finance-support"],
      leads: [],
      tag: "invoices",
      ...aid,
      trigger: "A supplier invoice has come back rejected.",
      minutes: 3,
    },
    release: {
      steps: [
        { id: "reason", kind: "then", text: "Check the rejection reason on the invoice record.", why: "", anchor: "rejected-invoice" },
        {
          id: "corrected",
          kind: "then",
          text: "Ask the supplier for a corrected invoice that matches the approved service and rate.",
          why: "",
          anchor: "rejected-invoice",
        },
        {
          id: "resubmit",
          kind: "then",
          text: "Re-submit it through the invoices queue, noting what changed.",
          why: "A note saves the next person working out what changed.",
          anchor: "rejected-invoice",
        },
        {
          id: "rate",
          kind: "exception",
          text: "If the rate doesn’t match the approved price list, raise a Finance query before re-submitting.",
          why: "",
          anchor: "rejected-invoice",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      ...draft,
      approvals: blankApprovals,
    },
  },
  // The Job Aids pilot (docs/job-aids.md). Editorial examples on placeholder records: fictional, and unapproved until
  // Operations, Finance and Quality supply and sign off the real steps.
  {
    id: "invoice-rate-check",
    data: {
      title: "Invoice rate check",
      purpose: "Compare each invoice line with the current agreement before you approve it, and query a mismatch the approved way.",
      roleLabel: "Care coordinators reviewing supplier invoices",
      risk: "operational",
      ownerTeam: "Finance",
      audiences: ["coordinator", "staff"],
      source: { docId: "supplier-invoices", anchor: "rate-check" },
      fallback: {
        text: "This check is being updated. Contact Finance support before approving an invoice you’re unsure of.",
        contactKeys: ["finance-support"],
      },
      contactKeys: ["finance-support"],
      leads: [],
      tag: "invoices",
      ...aid,
      trigger: "You are about to approve a supplier invoice.",
      minutes: 2,
    },
    release: {
      steps: [
        {
          id: "open",
          kind: "now",
          text: "Open the client’s current service agreement.",
          why: "The agreement is what was agreed. A past invoice isn’t.",
          anchor: "rate-check",
        },
        {
          id: "compare",
          kind: "now",
          text: "For each line, compare the service, the date, the unit and the rate with the agreement.",
          why: "A mismatch is usually in one line, not the total.",
          anchor: "rate-check",
        },
        { id: "match", kind: "then", text: "If every line matches, continue with approval.", why: "", anchor: "rate-check" },
        {
          id: "differs",
          kind: "exception",
          text: "If a line differs, pause the approval and raise a query through the approved query process. Don’t adjust the invoice yourself.",
          why: "",
          anchor: "rate-check",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick:
        "Open the current agreement. Compare the service, date, unit and rate on each invoice line. If something differs, pause and follow the approved query process.",
      example:
        "A made-up invoice has three lines. Two match the agreement. The third shows a weekend rate for a visit the agreement lists on a Tuesday. The coordinator pauses the approval and raises a query about that one line.",
      approvals: blankApprovals,
    },
  },
  {
    id: "ask-before-changing-the-plan",
    data: {
      title: "Ask before changing the plan",
      purpose: "Find out what matters to the person before you suggest a change, so the plan is one they helped make.",
      roleLabel: "Care coordinators, before proposing a change with a client",
      risk: "operational",
      ownerTeam: "Quality and Clinical Governance",
      audiences: ["coordinator", "staff"],
      source: { docId: "choice-and-risk", anchor: "ask-first" },
      fallback: { text: "This prompt is being updated. Talk to your team lead before proposing a change to a client’s plan.", contactKeys: [] },
      contactKeys: [],
      leads: [],
      tag: "conversations",
      ...aid,
      template: "conversation",
      trigger: "A family member has raised a worry, and you’re about to talk to the client.",
      minutes: 3,
    },
    release: {
      steps: [
        {
          id: "means",
          kind: "now",
          text: "What does this mean to you, and how do you manage it now?",
          why: "You learn what any change has to fit around.",
          anchor: "ask-first",
        },
        { id: "keep", kind: "now", text: "What would you want to keep doing?", why: "", anchor: "ask-first" },
        {
          id: "concern",
          kind: "then",
          text: "Name the concern that was raised, and ask how they see it.",
          why: "The worry is real. So is their view of it.",
          anchor: "ask-first",
        },
        { id: "agree", kind: "exception", text: "Agree what to try together, and when you’ll check how it’s going.", why: "", anchor: "ask-first" },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Before you suggest anything, ask what this means to them, how they manage it now, and what they’d want to keep doing.",
      example: "",
      approvals: blankApprovals,
    },
  },
  // The Quarterly Budget Check (docs/budget-decision-lab.md): the Job Aid the Quarterly Budget Decision Lab links to
  // from its feedback. An editorial example on a placeholder record, unapproved until Trilogy Care Operations, Finance
  // and the policy owner supply and sign off the real steps and escalation route.
  {
    id: "quarterly-budget-check",
    data: {
      title: "Quarterly Budget Check",
      purpose: "Plan or review a participant’s services near quarter end from the real figures: current versus projected, their choice, and the right route.",
      roleLabel: "Care coordinators planning or reviewing services near quarter end",
      risk: "operational",
      ownerTeam: "Care Operations and Finance",
      audiences: ["coordinator", "staff"],
      source: { docId: "quarter-budget", anchor: "quarter-end" },
      fallback: { text: "This check is being updated. Talk to your team lead before changing a participant’s services near quarter end.", contactKeys: [] },
      contactKeys: [],
      leads: [],
      tag: "budgets",
      ...aid,
      trigger: "You’re planning or reviewing a participant’s services near the end of their quarter.",
      minutes: 4,
    },
    release: {
      steps: [
        {
          id: "open",
          kind: "now",
          text: "Open the current authorised budget, care plan and statement.",
          why: "Work from the real figures, not a remembered balance.",
          anchor: "quarter-end",
        },
        {
          id: "separate",
          kind: "now",
          text: "Separate the current balance from the projected balance: booked services are an estimate until delivered.",
          why: "A booking isn’t spent or claimed.",
          anchor: "quarter-end",
        },
        {
          id: "ask",
          kind: "then",
          text: "Ask the participant what matters to them and what they want to change, before suggesting anything.",
          why: "",
          anchor: "quarter-end",
        },
        {
          id: "check",
          kind: "then",
          text: "Check each change is approved, agreed and deliverable before quarter end, and explain any contribution first.",
          why: "",
          anchor: "quarter-end",
        },
        { id: "athm", kind: "then", text: "Route equipment or home modifications through AT–HM, never the ongoing budget.", why: "", anchor: "quarter-end" },
        {
          id: "record",
          kind: "exception",
          text: "Record what was agreed and the next check. If needs have changed, or a projected overspend appears, follow the approved escalation route.",
          why: "",
          anchor: "quarter-end",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Open the real budget, care plan and statement. Tell current from projected. Ask what the person wants before suggesting anything.",
      example: "",
      approvals: blankApprovals,
    },
  },
  // The Hospital-to-Home Handover Check (docs/discharge-pivot.md): the canonical Job Aid the 72-Hour Discharge Pivot links
  // to from its debrief. An editorial example on a placeholder record, safety-critical, with blank approvals and empty
  // contacts: unapproved until Care Partner Operations, Clinical Governance and the discharge process owner supply and
  // sign off the real steps, contacts and escalation route. Learners don't see it until its first release is approved.
  {
    id: "hospital-to-home-handover-check",
    data: {
      title: "Hospital-to-Home Handover Check",
      purpose: "Assemble a safe, honest handover when a participant comes home from hospital: what to confirm, who owns it, and what to escalate.",
      roleLabel: "Care coordinators and Trilogy Care staff arranging a return home from hospital",
      risk: "safety_critical",
      ownerTeam: "Care Partner Operations and Clinical Governance",
      audiences: ["coordinator", "staff"],
      source: { docId: "hospital-handover", anchor: "handover-check" },
      fallback: {
        text: "This check is being updated. If an essential service after a hospital discharge can’t be covered, contact the clinical lead now, and tell the hospital discharge planner.",
        contactKeys: ["discharge-clinical-lead", "after-hours-clinical"],
      },
      contactKeys: ["discharge-clinical-lead", "after-hours-clinical"],
      leads: [],
      tag: "discharge",
      ...aid,
      trigger: "A participant is due home from hospital, or a hospital has sent a discharge plan.",
      minutes: 5,
    },
    release: {
      steps: [
        {
          id: "proposed",
          kind: "now",
          text: "Confirm the proposed discharge time, and who at the hospital owns the discharge decision.",
          why: "The hospital decides about discharge; your part is the handover.",
          anchor: "handover-check",
        },
        {
          id: "signed",
          kind: "now",
          text: "Get the signed discharge summary: clinical instructions, medicine changes, equipment and the responsible practitioner.",
          why: "A ward note or a recommendation isn’t an arrangement.",
          anchor: "handover-check",
        },
        {
          id: "participant",
          kind: "now",
          text: "Ask the participant what they want and who they want involved. Share only what they agree to.",
          why: "A family member who’s involved isn’t automatically a registered supporter.",
          anchor: "handover-check",
        },
        {
          id: "first-service",
          kind: "then",
          text: "Confirm the first essential service in writing with the provider, and who is accountable for it.",
          why: "A request stays a request until the provider confirms it.",
          anchor: "handover-check",
        },
        {
          id: "equipment",
          kind: "then",
          text: "Route equipment through AT–HM and ask the practitioner for a safe interim plan. If needs have changed, request a Support Plan Review with reasons and evidence.",
          why: "A review request isn’t an approval, and AT–HM isn’t paid from ongoing services.",
          anchor: "handover-check",
        },
        {
          id: "record",
          kind: "then",
          text: "Record what’s confirmed, pending and unresolved, with an owner for each, and book the first check after the return home.",
          why: "",
          anchor: "handover-check",
        },
        {
          id: "gap",
          kind: "exception",
          text: "If an essential service can’t be covered, tell the clinical lead and the hospital discharge planner straight away, using the contact routes below. Don’t arrange family or support-worker clinical care, and don’t present the handover as ready.",
          why: "A gap surfaced early can still be solved by the people who own it.",
          anchor: "handover-check",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick:
        "Get the signed summary, ask the participant, confirm the first essential service in writing, and escalate a gap to the clinical lead and the hospital straight away.",
      example: "",
      approvals: blankApprovals,
    },
  },
  // Choosing and Checking Your Contractor (docs/document-auditor.md): the canonical Job Aid the Contractor Vetting Card
  // links to from its debrief. An editorial example on a placeholder record, with blank approvals: unapproved until
  // supplier onboarding, Quality and worker screening, Finance and the Support at Home policy owner supply and sign off
  // the real steps, owners and thresholds. Learners don't see it until its first release is approved. Saving it to
  // Favourites is use, never a pass or a vendor clearance.
  {
    id: "choosing-and-checking-your-contractor",
    data: {
      title: "Choosing and Checking Your Contractor",
      purpose:
        "Help a participant keep the worker they’ve chosen, safely: check the business and the worker apart, the screening route, insurance, scope and price, and agree the price before the start.",
      roleLabel: "Care coordinators and Trilogy Care staff, when a participant asks to use a worker they’ve chosen",
      risk: "sensitive",
      ownerTeam: "Supplier onboarding, Quality and Finance",
      audiences: ["coordinator", "staff"],
      source: { docId: "contractor-onboarding", anchor: "choosing-checking" },
      fallback: {
        text: "This check is being updated. Don’t confirm a start yet: tell the participant what you’re checking, and ask supplier onboarding for the current procedure.",
        contactKeys: [],
      },
      contactKeys: [],
      leads: [],
      tag: "suppliers",
      ...aid,
      trigger: "A participant wants to use a worker or business they’ve chosen, or a contractor’s documents or price are up for renewal.",
      minutes: 5,
    },
    release: {
      steps: [
        {
          id: "person",
          kind: "now",
          text: "Start with the person: the worker they want, the service and goal, and when they’d like it to start.",
          why: "The aim is a safe, workable way to keep their choice.",
          anchor: "choosing-checking",
        },
        {
          id: "plan",
          kind: "now",
          text: "Check the service is in their approved care plan, and agree what they’ll self-manage.",
          why: "A task outside the plan goes to the care-plan process, not into the engagement.",
          anchor: "choosing-checking",
        },
        {
          id: "business-worker",
          kind: "now",
          text: "Check the business and each worker separately: an active ABN and its names, then each worker’s identity and current screening route, verified by the approved method.",
          why: "An active ABN doesn’t verify a worker. A police certificate under three years old or a current NDIS clearance is accepted: don’t ask for both by default.",
          anchor: "choosing-checking",
        },
        {
          id: "insurance",
          kind: "then",
          text: "Check any licence the task needs, and insurance under Trilogy Care’s current policy and contract.",
          why: "Insurance limits and wording are Trilogy Care policy, not Support at Home law.",
          anchor: "choosing-checking",
        },
        {
          id: "price",
          kind: "then",
          text: "Get an itemised quote. Keep the supplier cost and the participant’s price apart, and send an unexplained or above-benchmark price to the Finance or contract owner.",
          why: "A benchmark is a question, not a cap. Any self-managed overhead is at most 10% of the actual third-party cost, with no separate admin or travel fee to the participant.",
          anchor: "choosing-checking",
        },
        {
          id: "agree",
          kind: "then",
          text: "Agree the final price with the participant in writing before confirming the start. Record what’s checked, what’s outstanding, each owner and the renewal dates.",
          why: "",
          anchor: "choosing-checking",
        },
        {
          id: "cannot",
          kind: "exception",
          text: "If a check can’t be met, tell the participant what the obstacle is, who can resolve it and what choices they have.",
          why: "Never “computer says no”: a specific reason and a next step.",
          anchor: "choosing-checking",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick:
        "Keep their choice in view. Check the business and the worker apart, the screening route, insurance and scope; keep the supplier cost and their price apart; agree the price before the start.",
      example: "",
      approvals: blankApprovals,
    },
  },
];
