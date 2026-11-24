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

// The Difficult Family Call Job Aid (docs/tough-phone-call.md, "Tough Family Call"): an editorial example until Care
// Coordinator operations, Quality/complaints and the Support at Home policy owner supply the approved scripts and route.
const FAMILY_CALL_TEXT = [
  "When a family member or supporter calls with a concern:",
  "What happened? Acknowledge the concern in your own words, and ask what happened and what they hope for. Check whether the older person needs anything urgently today.",
  "What is the older person’s view? Bring their wishes into it, and plan to ask them directly.",
  "Who may receive information or decide? Check the older person’s recorded sharing preferences and the caller’s authority for this specific request. Family status alone isn’t authority; a registered supporter doesn’t decide for the person. Share what’s allowed, and explain the rest with a route.",
  "What can I verify? Separate what was booked from what happened. Say what isn’t known yet instead of guessing a reason or promising a booking, refund or change.",
  "What action, owner and follow-up have we agreed? Name who does what, and when you’ll call back. Record the concern, the older person’s wishes, the verified facts, the open questions, the owner and the next contact.",
  "Is a complaint or escalation needed? Offer the complaint route whenever it’s wanted (Trilogy Care, and the Aged Care Quality and Safety Commission), without discouraging it. A possible safety issue goes to the approved escalation pathway straight away.",
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

// The Can this be funded? Job Aid (docs/invoice-xray.md): an editorial example until the Support at Home policy owner,
// Operations/Finance, the AT–HM or clinical reviewer and Quality supply the approved steps, contacts and route.
// The Local Referral Conversation Job Aid (docs/local-referral-studio.md): an editorial example until the referral pathway
// owner, Partnerships/Marketing and Quality supply the approved steps, claims and intake route.
const REFERRAL_TEXT = [
  "Before you meet a GP practice, hospital team or other local referrer:",
  "Hear their concern first: their time, their workload, the patient’s safety. Answer that before anything about your business.",
  "Find out the older person’s stage before proposing a step: assessed, approved, allocated funding, already receiving care, or an urgent discharge. If nobody knows, say so and ask.",
  "Match the step to the stage. Needs assessment: the My Aged Care route, with the person’s consent. Approved and waiting: explain the wait honestly; no provider moves anyone up the queue. Allocated and choosing: describe the current intake process and offer an introduction with their consent.",
  "Use only approved wording from the claim register. Never “free”, “same-day care”, “fastest”, a guaranteed start date or worker, or anything about speeding up government funding.",
  "Keep the older person’s choice first. The referrer and family don’t decide for them, and patient details go only through consent and the approved referral process.",
  "Close with a real next step: who does what, and when. Nothing is promised until intake confirms it.",
].join("\n");

const FUNDING_TEXT = [
  "When a participant or family asks whether a quote, item or service can be funded:",
  "Start with the person’s goal: what they want the item or service to do for them.",
  "Check the right list: the Support at Home service list for services, the AT–HM list for products, equipment and home modifications. Being on a list means it could be funded, not that it’s approved for this person.",
  "Check their assessed need and individual approval: the support plan, care plan and any AT–HM approval.",
  "Check the funding route. AT–HM is never paid from the quarterly budget for ongoing services.",
  "Check any advice or prescription the list entry needs, and ask the right clinician or AT–HM adviser.",
  "Check the price and contribution: an agreed, all-inclusive price with no separate admin or travel fees for ordinary services, the self-managed overhead cap, and the participant’s contribution from their notice. Keep a supplier’s cost apart from the participant’s price.",
  "If a line is vague or bundled, ask for an itemised quote. On an invoice, compare the date, units, rate and evidence of delivery with what was agreed, and query a difference through the approved process. A quote isn’t delivery, and an invoice isn’t agreement to a new price.",
  "If the source doesn’t settle it, say “we need to check”, name the owner, and escalate to the policy, clinical or Finance owner. Tell the participant what’s confirmed, what isn’t, the next step, and how to raise a concern.",
].join("\n");

// The 28-Day Trust Check Job Aid (docs/trust-check.md): an editorial example until Care Coordination operations,
// Quality/complaints and the Support at Home policy owner supply the approved check-in, escalation and transfer steps.
const TRUST_CHECK_TEXT = [
  "When a signal suggests a service problem (missed visits, a statement query, an unreturned call, a large balance):",
  "Notice: write down what the record shows, its source and date, what else could explain it, and what you still need to verify. A balance or a missed call isn’t a prediction that someone will leave.",
  "Ask the person: what’s working, what they want changed, and who they want involved. Follow their recorded sharing preferences; a relative’s worry doesn’t speak for them.",
  "Act: name the problem in their words, the action, its operational owner, when they’ll next hear from you, and what happens if the first fix fails. Never promise a worker or date that isn’t confirmed, and never suggest spending a balance or paying for equipment from the ongoing budget.",
  "Check: around Day 7 and by Day 28, look at the delivery record and ask the person whether it helped. A booking or a message isn’t resolution.",
  "Learn: raise a repeat supplier, billing or process problem with its owner, with the evidence.",
  "A possible safety concern goes to the clinical and incident process now, never into a 28-day check. Offer the complaint route whenever it’s wanted, without discouraging it. If the person chooses to move, support it through the approved exit and transfer process.",
].join("\n");

// The coaching conversation card (docs/shadow-and-coach.md): an editorial example until People/HR, Care Coordination
// operations and Quality supply the approved coaching guidance for Care Partner managers.
const COACHING_TEXT = [
  "Before you coach a new coordinator about a piece of their work:",
  "First, protect the person: if the work may have put a participant at risk or given them wrong information, act on that now, through the approved route.",
  "Notice: quote an observable action, not a judgement about character.",
  "Ask: what information they had, where they checked it, and what got in the way.",
  "Agree: the better action, who corrects what, and what they’ll practise.",
  "Verify: when and how you’ll see the change in a new piece of work.",
  "If the source, form or workload is the problem, raise it with its owner. Coaching isn’t an HR process: anything for HR goes through the business’s HR process separately.",
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
    id: "family-calls",
    title: "Calls from family members and supporters (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Care Coordinator operations and Quality/complaints",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "difficult-family-call", heading: "A difficult call from a family member (editorial example)", text: FAMILY_CALL_TEXT }],
  },
  {
    id: "contractor-onboarding",
    title: "Participant-chosen contractors (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Supplier onboarding, Quality and Finance",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "choosing-checking", heading: "Choosing and checking a participant’s contractor (editorial example)", text: CONTRACTOR_TEXT }],
  },
  {
    id: "funding-checks",
    title: "Funding questions, quotes and invoices (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Support at Home policy owner, Operations and Finance, AT–HM and clinical review, and Quality",
    audiences: ["coordinator", "staff"],
    sections: [{ anchor: "can-this-be-funded", heading: "Can this be funded? (editorial example)", text: FUNDING_TEXT }],
  },
  {
    id: "local-referrals",
    title: "Local referral conversations (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Partnerships, the referral pathway owner and Marketing",
    audiences: ["partner"],
    sections: [{ anchor: "local-referral-conversation", heading: "A local referral conversation (editorial example)", text: REFERRAL_TEXT }],
  },
  {
    id: "service-recovery",
    title: "Service recovery and follow-up (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "Care Coordination operations and Quality/complaints",
    audiences: ["partner", "coordinator", "staff"],
    sections: [{ anchor: "trust-check", heading: "The 28-Day Trust Check (editorial example)", text: TRUST_CHECK_TEXT }],
  },
  {
    id: "new-hire-coaching",
    title: "Coaching new coordinators (placeholder Hub policy record)",
    system: "Hub policy record",
    owner: "People/HR, Care Coordination operations and Quality",
    audiences: ["partner", "staff"],
    sections: [{ anchor: "coaching-conversation", heading: "A coaching conversation (editorial example)", text: COACHING_TEXT }],
  },
];

export const SEED_CONTACTS: Contact[] = [
  { key: "incident-responder", label: "Designated incident responder", routes: { partner: "", coordinator: "", staff: "" } },
  { key: "finance-support", label: "Finance support", routes: { partner: "", coordinator: "", staff: "" } },
  // The Hospital-to-Home Handover Check (docs/discharge-pivot.md): placeholders until Trilogy Care supplies the real routes.
  { key: "discharge-clinical-lead", label: "Clinical lead for hospital discharges", routes: { partner: "", coordinator: "", staff: "" } },
  { key: "after-hours-clinical", label: "After-hours clinical escalation", routes: { partner: "", coordinator: "", staff: "" } },
  // The Difficult Family Call Job Aid (docs/tough-phone-call.md): a placeholder until Quality/complaints supplies the approved route.
  { key: "complaints-route", label: "Feedback and complaints team", routes: { partner: "", coordinator: "", staff: "" } },
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
  // Difficult Family Call (docs/tough-phone-call.md, "Tough Family Call"): the canonical Job Aid the Tough Family Call
  // links to from its debrief and during the call. An editorial example on a placeholder record, with blank approvals and
  // an empty complaints contact: unapproved until Care Coordinator operations, Quality/complaints and the Support at Home
  // policy owner supply and sign off the approved scripts and complaint route. Learners don't see it until its first
  // release is approved. Opening or saving it to Favourites is tool use, never proof of a good call.
  // The 28-Day Trust Check (docs/trust-check.md): the check-in and action-plan Job Aid the simulation's debrief and the
  // Work Tool link to. An editorial example on a placeholder record, with blank approvals: unapproved until Care
  // Coordination operations, Quality/complaints and the policy owner sign off the steps. Saving it to Favourites is use,
  // never a verified outcome.
  {
    id: "trust-check-plan",
    data: {
      title: "28-Day Trust Check: check-in and action plan",
      purpose:
        "Follow up a service problem with the person: what the record shows, what they want, an owned fix with a contingency, and a check that it helped. Never a churn score, and never pressure to spend or to stay.",
      roleLabel: "Care Partners and coordinators, following up a missed service, a statement query or an unanswered call",
      risk: "sensitive",
      ownerTeam: "Care Coordination operations and Quality/complaints",
      audiences: ["partner", "coordinator", "staff"],
      source: { docId: "service-recovery", anchor: "trust-check" },
      fallback: {
        text: "This aid is being updated. Ask the person what they want, don’t promise what isn’t confirmed, offer the complaint route, and send a safety concern to the escalation process now.",
        contactKeys: ["complaints-route"],
      },
      contactKeys: ["complaints-route"],
      leads: [],
      tag: "service-recovery",
      ...aid,
      trigger: "A missed visit, a statement query, an unreturned call or a large balance makes you wonder whether a person’s services are working.",
      minutes: 4,
    },
    release: {
      steps: [
        {
          id: "notice",
          kind: "now",
          text: "Notice: what the record shows, its source and date, other explanations, and what to verify.",
          why: "A signal is a reason to look, not a prediction about the person.",
          anchor: "trust-check",
        },
        {
          id: "ask",
          kind: "now",
          text: "Ask the person what’s working, what they want changed, and who they want involved; follow their sharing preferences.",
          why: "Their goal decides what a fix has to achieve.",
          anchor: "trust-check",
        },
        {
          id: "act",
          kind: "then",
          text: "Act: the problem in their words, the action, its owner, the next update and the contingency. Promise only what’s confirmed.",
          why: "“Call client” on its own doesn’t fix anything.",
          anchor: "trust-check",
        },
        {
          id: "check",
          kind: "then",
          text: "Check around Day 7 and by Day 28: the delivery record, and the person’s own view.",
          why: "A booking or a message isn’t resolution.",
          anchor: "trust-check",
        },
        {
          id: "learn",
          kind: "then",
          text: "Learn: raise a repeat supplier, billing or process problem with its owner and the evidence.",
          why: "",
          anchor: "trust-check",
        },
        {
          id: "exceptions",
          kind: "exception",
          text: "Safety concern: the escalation process now. Complaint: offer the route, without discouraging it. Choosing to move: support it through the approved exit process.",
          why: "Leaving is the person’s right, and a supported move is a good outcome.",
          anchor: "trust-check",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Notice what the record shows, ask the person what they want, give the fix an owner and a contingency, and check with them that it helped.",
      example: "",
      approvals: blankApprovals,
    },
  },
  {
    id: "difficult-family-call",
    data: {
      title: "Difficult Family Call",
      purpose:
        "Handle a hard call from a family member or supporter: hear the concern, keep the older person’s choices in the room, share only what’s allowed, check before promising, and agree a real follow-up.",
      roleLabel: "Care coordinators and Trilogy Care staff, on a call with a family member or supporter",
      risk: "sensitive",
      ownerTeam: "Care Coordinator operations and Quality/complaints",
      audiences: ["coordinator", "staff"],
      source: { docId: "family-calls", anchor: "difficult-family-call" },
      fallback: {
        text: "This aid is being updated. Hear the concern, check what the older person has agreed can be shared, don’t promise what isn’t confirmed, and offer the complaint route.",
        contactKeys: ["complaints-route"],
      },
      contactKeys: ["complaints-route"],
      leads: [],
      tag: "communication",
      ...aid,
      trigger: "A family member or supporter calls, upset, about a service, a cost or a decision.",
      minutes: 3,
    },
    release: {
      steps: [
        {
          id: "what-happened",
          kind: "now",
          text: "What happened? Acknowledge the concern, ask what happened and what they hope for, and check whether the older person needs anything urgently today.",
          why: "Hearing it first is what makes the rest of the call possible.",
          anchor: "difficult-family-call",
        },
        {
          id: "their-view",
          kind: "now",
          text: "What is the older person’s view? Bring their wishes in, and plan to ask them directly.",
          why: "The decision is theirs, even when the caller is family.",
          anchor: "difficult-family-call",
        },
        {
          id: "who-may",
          kind: "now",
          text: "Who may receive information or decide? Check the recorded sharing preferences and the caller’s authority for this request. Share what’s allowed; explain the rest with a route.",
          why: "Neither a blanket yes nor a blanket no: family status alone isn’t authority.",
          anchor: "difficult-family-call",
        },
        {
          id: "verify",
          kind: "then",
          text: "What can I verify? Keep what’s booked apart from what happened. Say what isn’t known yet instead of a reason or a promise.",
          why: "An unsupported promise can calm a caller and still fail them.",
          anchor: "difficult-family-call",
        },
        {
          id: "agree",
          kind: "then",
          text: "What action, owner and follow-up have we agreed? Name who does what and when you’ll call back, and record it.",
          why: "",
          anchor: "difficult-family-call",
        },
        {
          id: "complaint",
          kind: "exception",
          text: "Is a complaint or escalation needed? Offer the complaint route whenever it’s wanted, without discouraging it. A possible safety issue goes to the approved escalation pathway now.",
          why: "Complaining is a right, not a sign the call went badly.",
          anchor: "difficult-family-call",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Hear it, bring the older person in, share only what’s allowed, check before promising, and agree who calls back and when.",
      example: "",
      approvals: blankApprovals,
    },
  },
  // Local Referral Conversation (docs/local-referral-studio.md): the Job Aid the Local Referral Studio links to, found in
  // Work Tools by "GP referral pitch", "hospital referral", "local one-pager" and "objection practice". An editorial
  // example on a placeholder record, with blank approvals: unapproved until the referral pathway owner, Partnerships and
  // Marketing, and Quality sign off. Learners don't see it until its first release is approved.
  {
    id: "local-referral-conversation",
    data: {
      title: "Local Referral Conversation",
      purpose:
        "GP referral pitch, hospital referral and objection practice: hear the referrer’s concern, find out the older person’s stage, match the step to it, use only approved claims, and agree a real next step. Pairs with the Local Referral Studio’s local one-pager.",
      roleLabel: "Care Partner business owners and the people they authorise, before meeting a local referrer",
      risk: "sensitive",
      ownerTeam: "Partnerships, the referral pathway owner and Marketing",
      audiences: ["partner"],
      source: { docId: "local-referrals", anchor: "local-referral-conversation" },
      fallback: {
        text: "This aid is being updated. Ask the older person’s stage first, use only approved wording, and promise nothing intake hasn’t confirmed.",
        contactKeys: [],
      },
      contactKeys: [],
      leads: [],
      tag: "growth",
      ...aid,
      trigger: "You’re about to meet a GP practice, hospital social worker or other local referrer.",
      minutes: 2,
    },
    release: {
      steps: [
        {
          id: "hear",
          kind: "now",
          text: "Hear their concern first, and answer it before anything about your business.",
          why: "A referrer with five minutes needs their question answered.",
          anchor: "local-referral-conversation",
        },
        {
          id: "stage",
          kind: "now",
          text: "Find out the older person’s stage: assessed, approved, allocated funding, already receiving care, or an urgent discharge. If nobody knows, ask.",
          why: "The right next step depends on it, and guessing it misleads everyone.",
          anchor: "local-referral-conversation",
        },
        {
          id: "match",
          kind: "then",
          text: "Match the step to the stage: My Aged Care for an assessment; an honest explanation of the wait; an introduction to intake, with consent, once funding is allocated.",
          why: "An introduction to a provider isn’t an assessment, and no provider moves anyone up the queue.",
          anchor: "local-referral-conversation",
        },
        {
          id: "claims",
          kind: "then",
          text: "Use only the approved wording. Never “free”, “same-day care”, “fastest”, or a guaranteed start date or worker.",
          why: "Unsupported claims can mislead, and they’re the part a referrer remembers.",
          anchor: "local-referral-conversation",
        },
        {
          id: "close",
          kind: "then",
          text: "Close with who does what, and when. Keep the older person’s choice and consent first, and patient details out of the conversation.",
          why: "",
          anchor: "local-referral-conversation",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Hear the concern, ask the stage, match the step, use approved words, and agree who does what.",
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
  // Can this be funded? (docs/invoice-xray.md): the canonical Job Aid the Quote/Invoice X-Ray links to from its debrief.
  // An editorial example on a placeholder record, with blank approvals and no contacts: unapproved until the Support at
  // Home policy owner, Operations/Finance, the AT–HM or clinical reviewer and Quality supply and sign off the real
  // steps, contacts and escalation route. Learners don't see it until its first release is approved. Saving it to
  // Favourites is use, never an assessment pass or proof an invoice was right.
  {
    id: "can-this-be-funded",
    data: {
      title: "Can this be funded?",
      purpose:
        "Answer a funding question with a supported, reviewable decision: the person’s goal first, then the right list, their approval, the route, any advice, the price and contribution, and what to ask for or escalate.",
      roleLabel: "Care coordinators and Trilogy Care staff, when a participant or family asks whether a quote, item, service or invoice can be funded",
      risk: "sensitive",
      ownerTeam: "Support at Home policy owner, Operations and Finance, AT–HM and clinical review, and Quality",
      audiences: ["coordinator", "staff"],
      source: { docId: "funding-checks", anchor: "can-this-be-funded" },
      fallback: {
        text: "This check is being updated. Don’t confirm a purchase or approve an invoice yet: tell the participant what you’re checking, and ask the policy owner or Finance for the current procedure.",
        contactKeys: [],
      },
      contactKeys: [],
      leads: [],
      tag: "funding",
      ...aid,
      trigger: "A participant or family asks whether something can be funded, a quote arrives, or an invoice doesn’t match what was agreed.",
      minutes: 5,
    },
    release: {
      steps: [
        {
          id: "goal",
          kind: "now",
          text: "Start with the person’s goal: what they want the item or service to do for them.",
          why: "The decision is about their need, not the item’s name or the shop’s say-so.",
          anchor: "can-this-be-funded",
        },
        {
          id: "list",
          kind: "now",
          text: "Check the right list: the service list for services, the AT–HM list for products, equipment and home modifications.",
          why: "On a list means it could be funded, not that it’s approved for this person.",
          anchor: "can-this-be-funded",
        },
        {
          id: "approval",
          kind: "now",
          text: "Check their assessed need, approval and funding route, and any advice or prescription the list entry needs.",
          why: "AT–HM is never paid from the quarterly budget for ongoing services.",
          anchor: "can-this-be-funded",
        },
        {
          id: "price",
          kind: "then",
          text: "Check the price and contribution: agreed and all-inclusive, the supplier’s cost kept apart from the participant’s price, and the contribution from their notice.",
          why: "No separate admin or travel fees to the participant for ordinary services; any self-managed overhead is capped and included in the price.",
          anchor: "can-this-be-funded",
        },
        {
          id: "detail",
          kind: "then",
          text: "Ask for an itemised quote when a line is vague or bundled. On an invoice, compare the date, units, rate and evidence of delivery with what was agreed, and query a difference.",
          why: "A quote isn’t delivery, and an invoice isn’t agreement to a new price.",
          anchor: "can-this-be-funded",
        },
        {
          id: "explain",
          kind: "then",
          text: "Tell the participant what’s confirmed, what isn’t yet, the next step and who owns it, and how to raise a concern.",
          why: "",
          anchor: "can-this-be-funded",
        },
        {
          id: "unsure",
          kind: "exception",
          text: "If the source doesn’t settle it, say “we need to check”, name the owner, and escalate to the policy, clinical or Finance owner.",
          why: "Don’t make a new rule in the conversation.",
          anchor: "can-this-be-funded",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick:
        "Goal first. Then the right list, their approval and route, any advice, the agreed price and contribution. Ask for detail or escalate when it isn’t settled.",
      example: "",
      approvals: blankApprovals,
    },
  },
  // First 100 Days: Shadow & Coach (docs/shadow-and-coach.md): the coaching card the simulation's debrief links to. An
  // editorial example on a placeholder record, with blank approvals: unapproved until People/HR, Care Coordination
  // operations and Quality sign off. Saving it to Favourites is use, never evidence that anyone was coached.
  {
    id: "coaching-conversation-card",
    data: {
      title: "Coaching conversation card: Notice, Ask, Agree, Verify",
      purpose:
        "Coach a new coordinator about a piece of their work without blame: protect the participant first, then name the action, hear their reasoning, agree the better action and check it in new work.",
      roleLabel: "Care Partner business owners and managers coaching a new coordinator",
      risk: "sensitive",
      ownerTeam: "People/HR, Care Coordination operations and Quality",
      audiences: ["partner", "staff"],
      source: { docId: "new-hire-coaching", anchor: "coaching-conversation" },
      fallback: {
        text: "This card is being updated. Protect the participant first, describe the action rather than the person, ask what they were working from, and agree how you’ll check the next piece of work.",
        contactKeys: [],
      },
      contactKeys: [],
      leads: [],
      tag: "coaching",
      ...aid,
      trigger: "A new coordinator’s call, note or plan needs feedback, and you’re about to talk to them.",
      minutes: 3,
    },
    release: {
      steps: [
        {
          id: "protect",
          kind: "now",
          text: "First, protect the person: act now, by the approved route, on any risk or wrong information in the work.",
          why: "Good coaching never stands in for a correction or an escalation.",
          anchor: "coaching-conversation",
        },
        {
          id: "notice",
          kind: "then",
          text: "Notice: quote an observable action. “In the call I heard you say…”",
          why: "An action can be changed; a judgement about character can’t.",
          anchor: "coaching-conversation",
        },
        {
          id: "ask",
          kind: "then",
          text: "Ask: “What did you have to go on, and where did you check it?”",
          why: "A confusing source or a fall-first form changes what needs fixing.",
          anchor: "coaching-conversation",
        },
        {
          id: "agree",
          kind: "then",
          text: "Agree the better action, who corrects what, and one thing to practise.",
          why: "",
          anchor: "coaching-conversation",
        },
        {
          id: "verify",
          kind: "then",
          text: "Verify: say when and how you’ll see the change in a new piece of work.",
          why: "Completion isn’t evidence; an observed second sample is.",
          anchor: "coaching-conversation",
        },
        {
          id: "exceptions",
          kind: "exception",
          text: "A source, form or workload problem goes to its owner. Anything for HR goes through the business’s HR process, never this conversation.",
          why: "",
          anchor: "coaching-conversation",
        },
      ],
      changeSummary: "First release.",
      effectiveOn: "",
      reviewBy: "",
      ackRequired: false,
      quick: "Protect the person first. Then notice the action, ask for their reasoning, agree the better action and verify it in new work.",
      example: "",
      approvals: blankApprovals,
    },
  },
];
