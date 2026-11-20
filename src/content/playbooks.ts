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
    sections: [{ anchor: "rejected-invoice", heading: "Correcting a rejected supplier invoice", text: INVOICE_TEXT }],
  },
];

export const SEED_CONTACTS: Contact[] = [
  { key: "incident-responder", label: "Designated incident responder", routes: { partner: "", coordinator: "", staff: "" } },
  { key: "finance-support", label: "Finance support", routes: { partner: "", coordinator: "", staff: "" } },
];

const blankApprovals = { owner: "", clinical: "", quality: "" };

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
      fallback: { text: "This procedure is temporarily unavailable. In an emergency, call 000. Otherwise, contact the designated incident responder now.", contactKeys: ["incident-responder"] },
      contactKeys: ["incident-responder"],
      leads: [],
      tag: "incidents",
    },
    release: {
      steps: [
        { id: "safety", kind: "now", text: "Protect the person’s immediate safety.", why: "Safety comes before any record or notification.", anchor: "first-steps" },
        { id: "emergency", kind: "now", text: "In an emergency, call 000 under the approved procedure.", why: "", anchor: "first-steps" },
        {
          id: "notify",
          kind: "now",
          text: "Notify the designated Trilogy Care incident responder as soon as possible, using the contact route below.",
          why: "The provider’s 24-hour Commission notification for Priority 1 doesn’t make your internal alert something that can wait.",
          anchor: "first-steps",
        },
        { id: "record", kind: "then", text: "Record the facts in the approved incident system.", why: "Incident records belong in the incident system, with its privacy controls.", anchor: "first-steps" },
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
    },
    release: {
      steps: [
        { id: "reason", kind: "then", text: "Check the rejection reason on the invoice record.", why: "", anchor: "rejected-invoice" },
        { id: "corrected", kind: "then", text: "Ask the supplier for a corrected invoice that matches the approved service and rate.", why: "", anchor: "rejected-invoice" },
        { id: "resubmit", kind: "then", text: "Re-submit it through the invoices queue, noting what changed.", why: "A note saves the next person working out what changed.", anchor: "rejected-invoice" },
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
      approvals: blankApprovals,
    },
  },
];
