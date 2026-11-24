import type { AuditorBlockData, AuditRule, DecisionKey } from "@/lib/auditor";
import { DOT_GARDENER } from "./vettingCases";

/*
  Starter cases for the Document Auditor (docs/document-auditor.md). Every person, business, ABN, insurer and
  document is fictional, and every ABN fails the real ABN checksum. They're drafts: no sign-off is recorded, so a
  course using one can't be published until Supply Chain or Compliance (vetting) or Finance (invoices), Care
  Operations and Quality have reviewed it and recorded their names.

  The rule wording follows the public sources named on each rule. Owners and effective dates are placeholders
  until Compliance confirms the current Trilogy Care requirements.
*/

const REVIEW_BY = "2027-05-20";
const TO_CONFIRM = "To be confirmed by Compliance";

const RULES: Record<string, AuditRule> = {
  screening: {
    id: "r-screening",
    family: "screening",
    title: "Worker screening for aged care workers",
    text: "Aged care workers and responsible persons need a police certificate no older than three years, or an accepted NDIS worker screening clearance instead. The provider assesses any relevant findings. Screening is about the worker, not the business entity, and a practice case never asks you to judge a person’s suitability.",
    source: "Australian Government: Screening requirements for the aged care workforce",
    url: "https://www.health.gov.au/topics/aged-care-workforce/screening-requirements",
    owner: TO_CONFIRM,
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW_BY,
  },
  insurance: {
    id: "r-insurance",
    family: "insurance",
    title: "Supplier insurance and documents",
    text: "Requirements depend on the service and the business structure. Public liability for suppliers delivering services; professional indemnity only for applicable professional work; workers compensation where the supplier has employees. The certificate must name the matching legal entity and ABN, be current on the dates that matter, and cover the service.",
    source: "Trilogy Care: Supplier insurance and document requirements",
    url: "https://trilogycare.com.au/supplier-resources/insurance-requirements",
    owner: TO_CONFIRM,
    effectiveFrom: "2026-11-01",
    reviewBy: REVIEW_BY,
  },
  verification: {
    id: "r-verification",
    family: "verification",
    title: "Verification is ongoing",
    text: "Active ABN and GST, relevant licences, insurance, worker screening and agreements are verified, with expiries tracked and rechecked before engagement. An uploaded document isn’t valid forever.",
    source: "Trilogy Care: November 2026 Coordinator Information Session, Contractor Verification",
    url: "https://trilogycare.com.au/uploads/november-2026-information-session.pdf",
    owner: TO_CONFIRM,
    effectiveFrom: "2026-11-01",
    reviewBy: REVIEW_BY,
  },
  claims: {
    id: "r-claims",
    family: "claims",
    title: "What a Support at Home claim needs",
    text: "A claim needs a service approved in the participant’s Notice of Decision, agreed in their care plan, delivered by a provider registered for it, and actually delivered. It uses the agreed unit price and the units delivered. Vague bundled services, mismatched names or ABN, and services outside the supplier’s approved scope are corrected at source, not edited by the reviewer.",
    source: "Australian Government: Provider payment arrangements for Support at Home; Trilogy Care: Support at Home billing changes",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/provider-payment-arrangements-for-support-at-home",
    owner: TO_CONFIRM,
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW_BY,
  },
  pricing: {
    id: "r-pricing",
    family: "pricing",
    title: "No separate administration or travel fees to participants",
    text: "A Support at Home provider can’t charge participants separate administration or travel fees for services; those costs can be reflected in the agreed all-inclusive price. A supplier-to-provider cost is read against the supplier agreement instead: it isn’t automatically a participant charge just because it says “admin”.",
    source: "Australian Government: Prices for Support at Home participants",
    url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/prices-for-support-at-home-participants",
    owner: TO_CONFIRM,
    effectiveFrom: "2025-11-01",
    reviewBy: REVIEW_BY,
  },
  serviceList: {
    id: "r-service-list",
    family: "service_list",
    title: "Support at Home service list",
    text: "Use the current service list together with what this participant and supplier are approved for. Pet care is outside domestic assistance. Some essential minor maintenance, including gutter cleaning in the specified context, is in scope, so there’s no blanket “gutters are excluded” rule.",
    source: "Australian Government: Support at Home service list (24 September 2026)",
    url: "https://www.health.gov.au/sites/default/files/2026-09/support-at-home-service-list.pdf",
    owner: TO_CONFIRM,
    effectiveFrom: "2026-09-24",
    reviewBy: REVIEW_BY,
  },
};

const unsigned = () => ({
  source: { title: "Document Auditor starter ruleset (draft)", version: "", reviewedOn: "" },
  approval: { owner: "", compliance: "", finance: "", operations: "", quality: "", approvedOn: "" },
});
const d = (credit: DecisionKey["credit"], why: string, critical = false): DecisionKey => ({ credit, critical, why });
const f = (id: string, label: string, value: string, extra: Partial<AuditorBlockData["docs"][number]["fields"][number]> = {}) => ({
  id,
  label,
  value,
  date: "",
  dateKind: "" as const,
  line: null,
  ...extra,
});

/** A: a sole trader cleaner with an expired certificate and out-of-date screening. */
const cleaner: AuditorBlockData = {
  title: "Contractor Vetting: a sole trader cleaner",
  intro:
    "A sole trader has asked to provide domestic cleaning. Check the pack against the requirements for this service and business structure, on the proposed engagement date.",
  mode: "contractor_vetting",
  context: {
    role: "Care coordinator (practice)",
    participant: "Mrs June Harlow (fictional), approved for domestic assistance.",
    supplier: "Robin Tallis trading as Tallis Tidy Homes (fictional): a sole trader with no employees.",
    task: "Is this pack enough to engage the supplier from 1 December 2026? What has to be verified or updated?",
  },
  decisionDate: "2026-11-20",
  engagementDate: "2026-12-01",
  docs: [
    {
      id: "a-reg",
      kind: "document",
      title: "Supplier registration form",
      subtitle: "Submitted 28 Oct 2026 (practice copy)",
      fields: [
        f("a-reg-name", "Legal name", "Robin Tallis"),
        f("a-reg-trading", "Trading name", "Tallis Tidy Homes"),
        f("a-reg-abn", "ABN", "12 345 678 901"),
        f("a-reg-structure", "Business structure", "Sole trader"),
        f("a-reg-employees", "Employees", "None"),
        f("a-reg-service", "Service offered", "Domestic assistance: general house cleaning"),
      ],
    },
    {
      id: "a-abn",
      kind: "document",
      title: "ABN Lookup excerpt",
      subtitle: "Practice excerpt, not a live check",
      fields: [
        f("a-abn-status", "ABN status", "Active from 3 Mar 2019"),
        f("a-abn-entity", "Entity name", "TALLIS, ROBIN"),
        f("a-abn-type", "Entity type", "Individual or sole trader"),
        f("a-abn-gst", "GST", "Registered from 1 Jul 2021"),
      ],
    },
    {
      id: "a-pl",
      kind: "document",
      title: "Certificate of currency: public liability",
      subtitle: "Example Mutual Insurance (fictional)",
      fields: [
        f("a-pl-insured", "Insured", "Robin Tallis trading as Tallis Tidy Homes"),
        f("a-pl-abn", "ABN", "12 345 678 901"),
        f("a-pl-activity", "Business activity", "Domestic cleaning"),
        f("a-pl-from", "Period from", "1 Nov 2025"),
        f("a-pl-to", "Period to", "1 Nov 2026", { date: "2026-11-01", dateKind: "expiry" }),
      ],
    },
    {
      id: "a-police",
      kind: "document",
      title: "National police certificate",
      subtitle: "Practice copy: the result isn’t shown",
      fields: [
        f("a-police-name", "Name", "Robin Tallis"),
        f("a-police-issued", "Date issued", "14 Jun 2023", { date: "2023-06-14", dateKind: "issued" }),
        f("a-police-purpose", "Purpose", "Employment in aged and home care"),
        f("a-police-result", "Result", "Provided to the provider for assessment (not shown in this practice copy)"),
      ],
    },
    {
      id: "a-agree",
      kind: "document",
      title: "Supplier agreement: signature page",
      subtitle: "Signed 28 Oct 2026",
      fields: [f("a-agree-party", "Supplier", "Robin Tallis (ABN 12 345 678 901)"), f("a-agree-services", "Services", "Domestic assistance: cleaning")],
    },
    {
      id: "a-req",
      kind: "record",
      title: "Requirements for this engagement",
      subtitle: "Domestic cleaning, sole trader, no employees",
      fields: [
        f("a-req-date", "Proposed engagement date", "1 Dec 2026"),
        f("a-req-pl", "Public liability", "A current certificate on the engagement date, naming the supplier’s legal entity and ABN, covering the service"),
        f("a-req-pi", "Professional indemnity", "Not required for task-based domestic cleaning"),
        f("a-req-wc", "Workers compensation", "Required only where the supplier has employees"),
        f(
          "a-req-screening",
          "Worker screening",
          "A police certificate no older than three years on the engagement date, or a current NDIS worker screening clearance",
        ),
      ],
    },
  ],
  missing: [
    { id: "a-miss-pi", label: "Professional indemnity certificate", note: "" },
    { id: "a-miss-wc", label: "Workers compensation certificate", note: "" },
    { id: "a-miss-ndis", label: "NDIS worker screening clearance", note: "" },
  ],
  rules: [RULES.insurance, RULES.screening, RULES.verification],
  findings: [
    {
      id: "a-e-pl",
      fieldId: "a-pl-to",
      missingId: "",
      compareWith: ["a-req-date", "a-req-pl"],
      ruleId: "r-insurance",
      status: "failed",
      severity: "block",
      categories: ["expired"],
      explain:
        "The public liability certificate expired on 1 Nov 2026, a month before the proposed engagement on 1 Dec 2026. The ABN and insured name match, but an expired certificate can’t support approval for that engagement.",
    },
    {
      id: "a-e-police",
      fieldId: "a-police-issued",
      missingId: "",
      compareWith: ["a-req-screening", "a-req-date"],
      ruleId: "r-screening",
      status: "failed",
      severity: "block",
      categories: ["expired"],
      explain:
        "Issued 14 Jun 2023: more than three years before 1 Dec 2026, and the pack has no NDIS worker screening clearance as an alternative. The screening evidence doesn’t meet the requirement for this engagement. That says nothing about the person: it means current evidence is needed.",
    },
    {
      id: "a-e-ndis",
      fieldId: "",
      missingId: "a-miss-ndis",
      compareWith: [],
      ruleId: "r-screening",
      status: "missing",
      severity: "information",
      categories: ["missing"],
      explain: "An NDIS worker screening clearance would be an accepted alternative to the police certificate. Its absence is why the old certificate matters.",
    },
    {
      id: "a-e-pi",
      fieldId: "",
      missingId: "a-miss-pi",
      compareWith: ["a-req-pi"],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Not a gap. Professional indemnity isn’t required for task-based domestic cleaning, so its absence isn’t a failure here.",
    },
    {
      id: "a-e-wc",
      fieldId: "",
      missingId: "a-miss-wc",
      compareWith: ["a-req-wc"],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Not a gap. The cleaner has no WorkCover certificate, but this sole trader has no employees, so one isn’t needed under the checklist.",
    },
    {
      id: "a-e-abn",
      fieldId: "a-abn-status",
      missingId: "",
      compareWith: [],
      ruleId: "r-verification",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "The ABN is active and the entity matches the legal name on the form and the agreement.",
    },
    {
      id: "a-e-insured",
      fieldId: "a-pl-insured",
      missingId: "",
      compareWith: [],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "The insured name and ABN match the supplier. The problem with this certificate is its date, not its name.",
    },
  ],
  decisions: {
    ready: d(
      "none",
      "Marking it ready engages a supplier whose public liability expired before the start date and whose screening is out of date: exactly what these checks exist to stop.",
      true,
    ),
    request_evidence: d(
      "full",
      "Two gaps for this engagement, both correctable: expired public liability and out-of-date screening. Hold the start, ask for a current certificate and current screening evidence (a new police certificate or an NDIS clearance), and re-verify. The supplier can still be engaged once they arrive.",
    ),
    escalate: d("none", "There’s nothing here for anyone to decide: the dates settle it. Ask the supplier for current evidence."),
    cannot_engage: d(
      "partial",
      "Holding the start is right, but nothing here is a barrier this supplier can’t fix: current evidence closes both gaps. Saying it can’t go ahead risks an unnecessary refusal.",
    ),
  },
  actions: [
    {
      id: "corrected",
      right: true,
      why: "Ask for a current certificate of currency and current screening evidence (a new police certificate or an NDIS clearance), then re-verify.",
    },
    { id: "hold", right: true, why: "Holding the engagement until current evidence arrives protects the participant from the start date onwards." },
    {
      id: "compliance",
      right: false,
      why: "There’s nothing here for Compliance to decide: the documents are clearly out of date. Ask the supplier for current ones.",
    },
    { id: "proceed", right: false, why: "Proceeding would engage a supplier without current insurance or screening." },
  ],
  hint: "Check each date against the proposed engagement date, not today’s date. And check which documents this business structure actually needs.",
  variant: {
    fact: "The supplier now sends a current NDIS worker screening clearance and a new public liability certificate for 1 Nov 2026 to 1 Nov 2027, both naming the same legal entity and ABN.",
    decision: "ready",
    why: "The NDIS clearance is an accepted alternative to the police certificate, and the new certificate covers the engagement date. It’s ready for engagement review at this simulated stage; keep tracking both expiries.",
  },
  ...unsigned(),
};

/** B: a monthly cleaning invoice with a rate and units mismatch, a participant admin charge, pet care and a possible duplicate. */
const invoice: AuditorBlockData = {
  title: "Invoice Red Flags: a monthly cleaning invoice",
  intro: "A cleaning supplier has invoiced for November. Check each line against what’s approved, agreed and delivered before anything can proceed.",
  mode: "invoice_review",
  context: {
    role: "Care coordinator (practice)",
    participant: "Mrs June Harlow (fictional). Her plan includes two hours of cleaning on 6 Nov, at the agreed rate.",
    supplier: "Brightwater Home Cleaning Pty Ltd (fictional), an approved supplier for domestic assistance.",
    task: "Which lines reconcile with approved, agreed and delivered services? Can this submission proceed, or does it have to be corrected?",
  },
  decisionDate: "2026-11-20",
  engagementDate: "2026-11-06",
  docs: [
    {
      id: "b-inv",
      kind: "document",
      title: "Tax invoice INV-0417",
      subtitle: "Issued 10 Nov 2026 (practice copy)",
      fields: [
        f("b-inv-from", "From", "Brightwater Home Cleaning Pty Ltd, ABN 98 765 432 109"),
        f("b-inv-to", "Addressed to", "Trilogy Care (provider), for Mrs June Harlow"),
        f("b-inv-l1", "Line 1: Domestic cleaning, 6 Nov 2026", "3 hours at $72.00 = $216.00", {
          date: "2026-11-06",
          dateKind: "service",
          line: { qty: 3, unit: "hours", rateCents: 7200, amountCents: 21600 },
        }),
        f("b-inv-l2", "Line 2: Administration, charge to participant", "1 at $15.00 = $15.00", {
          line: { qty: 1, unit: "item", rateCents: 1500, amountCents: 1500 },
        }),
        f("b-inv-l3", "Line 3: Pet care, feed and walk dog, 6 Nov 2026", "1 at $35.00 = $35.00", {
          line: { qty: 1, unit: "visit", rateCents: 3500, amountCents: 3500 },
        }),
        f("b-inv-total", "Total", "$266.00"),
      ],
    },
    {
      id: "b-prev",
      kind: "document",
      title: "Earlier invoice INV-0402",
      subtitle: "Received 8 Nov 2026 (practice copy)",
      fields: [
        f("b-prev-l1", "Line 1: Domestic cleaning, 6 Nov 2026", "2 hours at $62.00 = $124.00", {
          date: "2026-11-06",
          dateKind: "service",
          line: { qty: 2, unit: "hours", rateCents: 6200, amountCents: 12400 },
        }),
        f("b-prev-status", "Status", "Received, not yet processed"),
      ],
    },
    {
      id: "b-plan",
      kind: "record",
      title: "Care plan and Notice of Decision excerpt",
      subtitle: "Mrs June Harlow (fictional)",
      fields: [
        f("b-plan-service", "Approved service", "Domestic assistance: general cleaning"),
        f("b-plan-agreed", "Agreed in care plan", "2 hours of cleaning a fortnight"),
        f("b-plan-pet", "Pet care", "Not in the care plan"),
      ],
    },
    {
      id: "b-schedule",
      kind: "record",
      title: "Agreed price schedule",
      subtitle: "Brightwater Home Cleaning (fictional)",
      fields: [
        f("b-sched-rate", "Domestic cleaning", "$62.00 an hour, all-inclusive", { line: { qty: 2, unit: "hours", rateCents: 6200, amountCents: 12400 } }),
        f("b-sched-fees", "Other fees", "None agreed. The hourly price is all-inclusive."),
      ],
    },
    {
      id: "b-log",
      kind: "record",
      title: "Service log",
      subtitle: "Confirmed with the participant",
      fields: [
        f("b-log-visit", "6 Nov 2026", "Cleaning, 2 hours, confirmed by Mrs Harlow", {
          date: "2026-11-06",
          dateKind: "service",
          line: { qty: 2, unit: "hours", rateCents: 6200, amountCents: 12400 },
        }),
      ],
    },
  ],
  missing: [{ id: "b-miss-timesheet", label: "Supplier timesheet for a third hour", note: "" }],
  rules: [RULES.claims, RULES.pricing, RULES.serviceList],
  findings: [
    {
      id: "b-e-l1",
      fieldId: "b-inv-l1",
      missingId: "",
      compareWith: ["b-sched-rate", "b-log-visit"],
      ruleId: "r-claims",
      status: "failed",
      severity: "block",
      categories: ["mismatch"],
      explain:
        "Invoiced 3 hours at $72.00. The service log confirms 2 hours and the agreed price is $62.00 an hour, so both the units and the rate disagree with what was agreed and delivered. Ask for a corrected invoice: don’t reduce the hours or the rate yourself.",
    },
    {
      id: "b-e-l2",
      fieldId: "b-inv-l2",
      missingId: "",
      compareWith: ["b-sched-fees"],
      ruleId: "r-pricing",
      status: "failed",
      severity: "block",
      categories: ["out_of_scope", "mismatch"],
      explain:
        "A provider can’t charge a participant a separate administration fee: costs are reflected in the agreed all-inclusive price. This line says “charge to participant”, so it’s that kind of charge. A supplier-to-provider cost would be read against the supplier agreement instead.",
    },
    {
      id: "b-e-l3",
      fieldId: "b-inv-l3",
      missingId: "",
      compareWith: ["b-plan-pet"],
      ruleId: "r-service-list",
      status: "failed",
      severity: "block",
      categories: ["out_of_scope"],
      explain:
        "Pet care is outside domestic assistance on the current Support at Home service list, and it isn’t in this participant’s plan. It can’t be relabelled as cleaning.",
    },
    {
      id: "b-e-dup",
      fieldId: "b-prev-l1",
      missingId: "",
      compareWith: ["b-log-visit"],
      ruleId: "r-claims",
      status: "ambiguous",
      severity: "query",
      categories: ["unverified", "mismatch"],
      explain:
        "INV-0402 has the same visit date, 6 Nov. It might be a duplicate, a second visit, or a corrected invoice that INV-0417 replaces. Check with the supplier before anything is paid; don’t assume fraud.",
    },
    {
      id: "b-e-timesheet",
      fieldId: "",
      missingId: "b-miss-timesheet",
      compareWith: [],
      ruleId: "r-claims",
      status: "missing",
      severity: "information",
      categories: ["missing"],
      explain: "Nothing shows a third hour was delivered. Without it, the service log is the evidence of what was delivered.",
    },
    {
      id: "b-e-from",
      fieldId: "b-inv-from",
      missingId: "",
      compareWith: [],
      ruleId: "r-claims",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "The supplier’s name and ABN match the approved supplier.",
    },
    {
      id: "b-e-to",
      fieldId: "b-inv-to",
      missingId: "",
      compareWith: [],
      ruleId: "r-claims",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Addressed to the provider for this participant, as it should be.",
    },
  ],
  decisions: {
    ready: d(
      "none",
      "Processing it pays for an hour that wasn’t delivered, at a rate that wasn’t agreed, plus a fee a participant can’t be charged and an excluded service.",
      true,
    ),
    request_evidence: d(
      "partial",
      "The duplicate date does need a question, but the rest are confirmed errors in this submission, not open questions. It can’t be processed as submitted and is corrected at source.",
    ),
    escalate: d("none", "Nothing here shows a concern for a delegated decision yet. Check the duplicate date with the supplier first."),
    cannot_engage: d(
      "full",
      "Confirmed errors: units and rate that don’t match the agreed price and the log, a separate participant admin charge, and pet care. Reject the current submission and ask for a corrected, itemised invoice, checking the 6 Nov date against INV-0402.",
    ),
  },
  actions: [
    { id: "corrected", right: true, why: "Ask the supplier for a corrected, itemised invoice. Don’t change the hours, rate or service category yourself." },
    { id: "clarify", right: true, why: "Confirming what was delivered on 6 Nov, and whether INV-0402 covers the same visit, settles the open question." },
    { id: "escalate", right: false, why: "Nothing here shows fraud yet. Check the duplicate date first; escalate only if the evidence supports a concern." },
    { id: "proceed", right: false, why: "Proceeding would pay for lines that don’t reconcile." },
  ],
  hint: "Compare each line with the agreed price and the service log, not with what seems reasonable. And look at who each charge is billed to.",
  variant: {
    fact: "Suppose the agreed schedule were $72.00 an hour, and the service log showed 3 hours on 6 Nov.",
    decision: "cannot_engage",
    why: "Line 1 would then reconcile, and marks on its rate and hours would be false positives. But the participant administration charge and the pet care still can’t go through, so the submission is still corrected at source.",
  },
  ...unsigned(),
};

/** C: a complete, approvable pack, with an NDIS clearance in place of a police certificate. */
const garden: AuditorBlockData = {
  title: "Contractor Vetting: a garden maintenance pack",
  intro: "A sole trader has asked to provide garden maintenance. Check the pack for this service and business structure, on the proposed engagement date.",
  mode: "contractor_vetting",
  context: {
    role: "Care coordinator (practice)",
    participant: "Mr Theo Barnard (fictional), approved for garden maintenance.",
    supplier: "Sam Whitlock trading as Greenleaf Garden Care (fictional): a sole trader with no employees.",
    task: "Is this pack enough to engage the supplier from 8 December 2026? What, if anything, has to be verified first?",
  },
  decisionDate: "2026-11-20",
  engagementDate: "2026-12-08",
  docs: [
    {
      id: "c-reg",
      kind: "document",
      title: "Supplier registration form",
      subtitle: "Submitted 12 Nov 2026 (practice copy)",
      fields: [
        f("c-reg-name", "Legal name", "Sam Whitlock"),
        f("c-reg-trading", "Trading name", "Greenleaf Garden Care"),
        f("c-reg-abn", "ABN", "23 456 789 012"),
        f("c-reg-employees", "Employees", "None"),
        f("c-reg-service", "Service offered", "Garden maintenance: mowing, weeding, pruning"),
      ],
    },
    {
      id: "c-abn",
      kind: "document",
      title: "ABN Lookup excerpt",
      subtitle: "Practice excerpt, not a live check",
      fields: [
        f("c-abn-status", "ABN status", "Active from 9 Feb 2017"),
        f("c-abn-entity", "Entity name", "WHITLOCK, SAM"),
        f("c-abn-business", "Business name", "Greenleaf Garden Care"),
      ],
    },
    {
      id: "c-pl",
      kind: "document",
      title: "Certificate of currency: public liability",
      subtitle: "Example Mutual Insurance (fictional)",
      fields: [
        f("c-pl-insured", "Insured", "Sam Whitlock"),
        f("c-pl-abn", "ABN", "23 456 789 012"),
        f("c-pl-activity", "Business activity", "Garden maintenance"),
        f("c-pl-to", "Period to", "31 Aug 2027", { date: "2027-08-31", dateKind: "expiry" }),
      ],
    },
    {
      id: "c-ndis",
      kind: "document",
      title: "NDIS worker screening clearance",
      subtitle: "Practice copy",
      fields: [
        f("c-ndis-name", "Name", "Sam Whitlock"),
        f("c-ndis-status", "Status", "Cleared"),
        f("c-ndis-expiry", "Expires", "15 Mar 2030", { date: "2030-03-15", dateKind: "expiry" }),
      ],
    },
    {
      id: "c-req",
      kind: "record",
      title: "Requirements for this engagement",
      subtitle: "Garden maintenance, sole trader, no employees",
      fields: [
        f("c-req-date", "Proposed engagement date", "8 Dec 2026"),
        f("c-req-pl", "Public liability", "A current certificate on the engagement date, naming the supplier’s legal entity and ABN, covering the service"),
        f("c-req-wc", "Workers compensation", "Required only where the supplier has employees"),
        f("c-req-screening", "Worker screening", "A police certificate no older than three years, or a current NDIS worker screening clearance"),
      ],
    },
  ],
  missing: [
    { id: "c-miss-police", label: "National police certificate", note: "" },
    { id: "c-miss-wc", label: "Workers compensation certificate", note: "" },
  ],
  rules: [RULES.insurance, RULES.screening, RULES.verification],
  findings: [
    {
      id: "c-e-trading",
      fieldId: "c-reg-trading",
      missingId: "",
      compareWith: ["c-req-pl"],
      ruleId: "r-verification",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain:
        "The trading name differs from the legal name, but the ABN Lookup shows the business name is registered to the same legal entity and ABN. That’s a relationship to check, not a mismatch to reject.",
    },
    {
      id: "c-e-police",
      fieldId: "",
      missingId: "c-miss-police",
      compareWith: ["c-req-screening"],
      ruleId: "r-screening",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Not a gap. A current NDIS worker screening clearance is an accepted alternative, so no separate police certificate is needed.",
    },
    {
      id: "c-e-wc",
      fieldId: "",
      missingId: "c-miss-wc",
      compareWith: ["c-req-wc"],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Not a gap. No employees, so no workers compensation certificate is needed under this checklist.",
    },
    {
      id: "c-e-pl",
      fieldId: "c-pl-to",
      missingId: "",
      compareWith: ["c-req-date"],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Current until 31 Aug 2027, well past the engagement date, and naming the same entity and ABN.",
    },
    {
      id: "c-e-ndis",
      fieldId: "c-ndis-expiry",
      missingId: "",
      compareWith: ["c-req-screening"],
      ruleId: "r-screening",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Cleared and current. Its expiry is tracked and rechecked, like every other document.",
    },
  ],
  decisions: {
    ready: d(
      "full",
      "Everything required for this service and structure is here and current on the engagement date. It’s ready for engagement review at this simulated stage. A careful check that finds nothing wrong is still a careful check.",
    ),
    request_evidence: d(
      "partial",
      "Nothing material is missing or unclear, so holding it up adds delay without protecting anyone. Marking it ready here isn’t careless.",
    ),
    escalate: d("none", "There’s nothing for anyone to decide: the pack is complete for this service."),
    cannot_engage: d("none", "There’s no barrier here. Treating the trading name or the missing police certificate as failures misreads the rules."),
  },
  actions: [
    { id: "proceed", right: true, why: "Proceed to the next simulated stage, with the expiries tracked for recheck." },
    { id: "hold", right: false, why: "There’s nothing to hold for." },
    { id: "corrected", right: false, why: "No document needs correcting." },
  ],
  hint: "Check whether each “missing” document is actually required for this service and structure, and whether an accepted alternative is in the pack.",
  variant: null,
  ...unsigned(),
};

/** D: a cropped certificate with no visible period: query, don't conclude. */
const cropped: AuditorBlockData = {
  title: "Contractor Vetting: a cropped certificate",
  intro: "A handyman’s pack has arrived with an insurance certificate that was cropped when it was uploaded. Decide what you can and can’t establish.",
  mode: "contractor_vetting",
  context: {
    role: "Care coordinator (practice)",
    participant: "Mrs Ada Kowalski (fictional), approved for essential minor home maintenance.",
    supplier: "Alex Moreno trading as Moreno Handy Help (fictional): a sole trader with no employees.",
    task: "Is this pack enough to engage the supplier from 1 December 2026?",
  },
  decisionDate: "2026-11-20",
  engagementDate: "2026-12-01",
  docs: [
    {
      id: "d-reg",
      kind: "document",
      title: "Supplier registration form",
      subtitle: "Submitted 15 Nov 2026 (practice copy)",
      fields: [
        f("d-reg-name", "Legal name", "Alex Moreno"),
        f("d-reg-abn", "ABN", "34 567 890 123"),
        f("d-reg-employees", "Employees", "None"),
        f("d-reg-service", "Service offered", "Essential minor home maintenance"),
      ],
    },
    {
      id: "d-pl",
      kind: "document",
      title: "Certificate of currency: public liability",
      subtitle: "Example Mutual Insurance (fictional). The bottom of the page is cut off in the upload.",
      fields: [
        f("d-pl-insured", "Insured", "Alex Moreno trading as Moreno Handy Help"),
        f("d-pl-abn", "ABN", "34 567 890 123"),
        f("d-pl-activity", "Business activity", "Handyman and minor maintenance"),
        f("d-pl-period", "Period of insurance", "Not visible: the upload is cropped"),
      ],
    },
    {
      id: "d-police",
      kind: "document",
      title: "National police certificate",
      subtitle: "Practice copy: the result isn’t shown",
      fields: [f("d-police-name", "Name", "Alex Moreno"), f("d-police-issued", "Date issued", "10 Feb 2025", { date: "2025-02-10", dateKind: "issued" })],
    },
    {
      id: "d-req",
      kind: "record",
      title: "Requirements for this engagement",
      subtitle: "Minor home maintenance, sole trader, no employees",
      fields: [
        f("d-req-date", "Proposed engagement date", "1 Dec 2026"),
        f("d-req-pl", "Public liability", "A current certificate on the engagement date, naming the supplier’s legal entity and ABN, covering the service"),
        f("d-req-screening", "Worker screening", "A police certificate no older than three years, or a current NDIS worker screening clearance"),
      ],
    },
  ],
  missing: [{ id: "d-miss-wc", label: "Workers compensation certificate", note: "" }],
  rules: [RULES.insurance, RULES.screening, RULES.verification],
  findings: [
    {
      id: "d-e-period",
      fieldId: "d-pl-period",
      missingId: "",
      compareWith: ["d-req-pl", "d-req-date"],
      ruleId: "r-insurance",
      status: "ambiguous",
      severity: "query",
      categories: ["unverified", "missing"],
      explain:
        "You can’t see whether the certificate is current on 1 Dec 2026. Don’t conclude that it’s expired, and don’t assume it’s valid: ask for the complete certificate.",
    },
    {
      id: "d-e-police",
      fieldId: "d-police-issued",
      missingId: "",
      compareWith: ["d-req-screening"],
      ruleId: "r-screening",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Issued 10 Feb 2025, so under three years old on the engagement date.",
    },
    {
      id: "d-e-wc",
      fieldId: "",
      missingId: "d-miss-wc",
      compareWith: [],
      ruleId: "r-insurance",
      status: "verified",
      severity: "information",
      categories: ["looks_correct"],
      explain: "Not a gap. No employees, so no workers compensation certificate is needed.",
    },
  ],
  decisions: {
    ready: d("none", "Marking it ready without seeing the period of insurance engages a supplier without knowing they’re insured on the start date.", true),
    request_evidence: d(
      "full",
      "A material fact can’t be read, and it can be fixed by asking for the complete certificate. Ask for it, and hold until it arrives.",
    ),
    escalate: d("none", "It isn’t a judgement call: the complete certificate settles it."),
    cannot_engage: d("none", "Nothing shows the certificate has expired. Refusing treats an unknown as a confirmed failure."),
  },
  actions: [
    { id: "corrected", right: true, why: "Ask for the complete certificate of currency, showing the period of insurance." },
    { id: "hold", right: true, why: "Hold the engagement until you can see the certificate is current on the start date." },
    { id: "proceed", right: false, why: "Proceeding would engage the supplier without confirmed insurance." },
  ],
  hint: "Separate what the documents show from what they don’t. Something you can’t see isn’t the same as something that’s wrong.",
  variant: null,
  ...unsigned(),
};

export const AUDIT_CASES: { id: string; label: string; data: AuditorBlockData }[] = [
  { id: "dot-gardener", label: "Contractor Vetting Card: Dot’s gardener (screening alternative, insurance, scope and price)", data: DOT_GARDENER },
  { id: "sole-trader-cleaner", label: "Contractor Vetting: a sole trader cleaner (expired certificate, old screening)", data: cleaner },
  { id: "cleaning-invoice", label: "Invoice Red Flags: a monthly cleaning invoice", data: invoice },
  { id: "garden-pack", label: "Contractor Vetting: an approvable garden maintenance pack", data: garden },
  { id: "cropped-certificate", label: "Contractor Vetting: a cropped certificate", data: cropped },
];
