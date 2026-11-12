import type { IconName } from "@/components/Icon";

/*
  Support at Home glossary, shown at /resources/glossary. Adapted from Trilogy Care's internal
  strategy glossary (docs.trilogycare.com.au), with Australian spelling.
*/

export type GlossaryTerm = {
  /** What people say: the short form if there is one ("SAH"), otherwise the name. */
  term: string;
  /** The name an abbreviation stands for. */
  full?: string;
  definition: string;
  /** A short list under the definition (service groups, funding streams and so on). */
  list?: string[];
};

export type GlossarySection = { id: string; title: string; icon: IconName; terms: GlossaryTerm[] };

export const glossary: GlossarySection[] = [
  {
    id: "roles",
    title: "Roles and responsibilities",
    icon: "people",
    terms: [
      {
        term: "Care Partner",
        full: "Self-Managed Plus only",
        definition:
          "An optional third-party service for clients on Self-Managed Plus. Acts as the link between the client, their family and the rest of their Care Circle. Not the same as the internal Care Partner.",
      },
      {
        term: "Care Coordinator",
        full: "Fully Coordinated packages",
        definition:
          "An independent coordinator business, chosen by the client and charging its own fee, that arranges services for a client on a Fully Coordinated package. The internal Care Partner still approves any budget they submit. Not the same as a Care Partner.",
      },
      { term: "Supplier", definition: "Service provider delivering care services, such as personal care, cleaning or meal preparation." },
      { term: "Client", definition: "Person receiving home care services under the Support at Home program. Government documents may call them a care recipient." },
      {
        term: "Care Worker",
        full: "Support worker",
        definition: "Frontline worker delivering personal care services. In disability services, often called a DSP (Disability Support Professional).",
      },
      { term: "Bill Processor", definition: "Finance team member responsible for validating and processing supplier invoices." },
      { term: "Clinical Team", definition: "AHPRA-registered nurses and allied health practitioners providing clinical oversight." },
      { term: "Assessment Partner", definition: "Team member who conducts the initial needs assessment and service planning." },
    ],
  },
  {
    id: "programs",
    title: "Government programs and funding",
    icon: "landmark",
    terms: [
      {
        term: "SAH",
        full: "Support at Home",
        definition:
          "The Australian Government’s aged care program, launched in 2025, replacing HCP and CHSP. Provides subsidised home and community care services for older Australians.",
      },
      { term: "HCP", full: "Home Care Packages", definition: "Predecessor program to Support at Home. Means-tested subsidies for older people needing care at home." },
      {
        term: "CHSP",
        full: "Commonwealth Home Support Programme",
        definition: "Predecessor program to Support at Home. Subsidised entry-level help, such as cleaning, shopping and social support.",
      },
      {
        term: "IPA",
        full: "Individual Payment Agreement",
        definition: "The funding entitlement issued by Services Australia, setting out approved services and dollar amounts for a client.",
      },
      { term: "NOA", full: "Notice of Assessment", definition: "Government-issued document confirming a client’s approved services, funding amounts and eligibility." },
      { term: "PRODA", full: "Provider Digital Access", definition: "Services Australia’s sign-in system for government portals and APIs." },
    ],
  },
  {
    id: "service-groups",
    title: "Service groups",
    icon: "layers",
    terms: [
      {
        term: "SERG",
        full: "Service Group",
        definition: "Service categories defined by the Support at Home program. Trilogy Care tracks use across these groups:",
        list: [
          "SERG-0001: Home Support (personal care, domestic assistance)",
          "SERG-0002: Assistive Technology",
          "SERG-0003: Home Modifications",
          "SERG-0004: Care Management",
          "SERG-0005: End of Life Pathway",
          "SERG-0006: Restorative Care Pathway",
        ],
      },
    ],
  },
  {
    id: "package-types",
    title: "Care package types",
    icon: "briefcase",
    terms: [
      { term: "Package", definition: "The record in the Portal that holds one client’s funded care with Trilogy Care." },
      {
        term: "Self-Managed Package",
        definition: "The client or their representative engages suppliers directly and manages their own services. Trilogy Care provides support and tracking.",
      },
      {
        term: "Fully Coordinated Package",
        definition: "Trilogy Care coordinates and manages services on the client’s behalf. Attracts a Care Coordination fee (typically 20%).",
      },
      {
        term: "SM+",
        full: "Self-Managed Plus",
        definition: "Enhanced self-managed model: Trilogy Care provides coordination support while the client keeps management control.",
      },
      { term: "Consumer Directed Care", definition: "The underlying philosophy of giving clients maximum choice and control over their services." },
      {
        term: "Dignity of Risk",
        definition: "The principle that clients have the right to make informed decisions about their care, even when those decisions involve some risk.",
      },
    ],
  },
  {
    id: "budget",
    title: "Budget and funding",
    icon: "money",
    terms: [
      {
        term: "Service Plan",
        definition: "Document that sets out:",
        list: ["Services approved for the client", "Allocation amount for each service category", "Duration and frequency of services", "Assigned suppliers"],
      },
      {
        term: "Funding Stream",
        definition: "Where the money in a budget allocation comes from:",
        list: [
          "ON: Ongoing (primary quarterly funding from Support at Home)",
          "RC: Restorative Care Pathway",
          "EL: End of Life Pathway",
          "CU: Commonwealth Unspent (rolled-over funds from previous periods)",
          "HC: Home Care Account (accumulated surpluses)",
          "VC: Voluntary Contribution (client top-ups beyond government funding)",
        ],
      },
      { term: "Quarterly Budget", definition: "Funding allocation that resets each calendar quarter." },
      { term: "Unspent Funds", definition: "Budget allocated but not used within the period." },
      { term: "Rollover", definition: "Unspent funds automatically carried forward to the next period (default 60 days)." },
      {
        term: "Wraparound Service",
        definition: "Services delivered to a client using rolled-over or surplus funds beyond the initial service plan period.",
      },
    ],
  },
  {
    id: "fees",
    title: "Fees and charges",
    icon: "clipboard",
    terms: [
      { term: "CC Fee", full: "Care Coordination Fee", definition: "Charged on fully coordinated packages (typically 20%) to cover coordination costs." },
      { term: "TC Fee", full: "Trilogy Care Fee", definition: "Administrative charge to offset operating costs (typically 10%)." },
      { term: "Care Management Fee", definition: "Allowable provider fee (up to 10% under Services Australia rules) for care coordination activities." },
      { term: "Contribution", full: "VC, Voluntary Contribution", definition: "Voluntary client top-up payment, adding to government funding for extra services." },
      { term: "ITF Collection", definition: "Incoming Trust Fund collection by direct debit from the client’s bank account." },
    ],
  },
  {
    id: "claims",
    title: "Claims and billing",
    icon: "doc",
    terms: [
      { term: "Claim", definition: "Formal request to Services Australia to draw down approved funding for services delivered." },
      { term: "Bill", definition: "Invoice from a supplier requesting payment for services delivered to a client." },
      { term: "Bill Matching", definition: "Matching invoice line items to approved service plan items." },
      { term: "Planned Service", definition: "Service included in the active service plan, with an allocated budget." },
      { term: "Unplanned Service", definition: "Service approved in the NOA but not included in the current service plan." },
      { term: "Out-of-Budget Service", definition: "Planned service where actual use is more than the budgeted amount." },
      { term: "Invoice Line Item", definition: "A single service entry on a supplier invoice, such as “Personal care, 2 hours at $50 an hour”." },
      {
        term: "Payment Reconciliation",
        definition: "Matching payments received from Services Australia to the claims submitted and services delivered.",
      },
      {
        term: "RCTI",
        full: "Recipient Created Tax Invoice",
        definition:
          "A tax invoice created by the buyer on the supplier’s behalf, instead of the supplier issuing it. The ATO requires both to agree to this in writing.",
      },
    ],
  },
  {
    id: "regulation",
    title: "Regulation and compliance",
    icon: "shield",
    terms: [
      { term: "Aged Care Quality and Safety Commission", definition: "The Australian Government regulator overseeing aged care quality and compliance." },
      { term: "Services Australia", definition: "Government agency that administers the Support at Home program, processes claims and issues funding." },
      { term: "Price List", definition: "Required transparency document showing service prices and fee structures." },
      {
        term: "Statement of Rights",
        definition:
          "Legally enforceable statement of older people’s rights, in section 23 of the Aged Care Act 2024. Replaced the former Charter of Aged Care Rights, which was a funding condition but not directly enforceable.",
      },
      {
        term: "AHPRA",
        full: "Australian Health Practitioner Regulation Agency",
        definition:
          "National regulator of doctors, nurses and allied health practitioners. Relevant for clinical oversight in the end-of-life and restorative care pathways.",
      },
      { term: "SIRS", full: "Serious Incident Response Scheme", definition: "Mandatory incident reporting framework for aged care providers." },
    ],
  },
  {
    id: "care",
    title: "Care and assessment",
    icon: "heart",
    terms: [
      {
        term: "Care Plan",
        definition: "Document that sets out:",
        list: ["The client’s assessed needs", "Goals and preferences", "Agreed services and approach", "Risk mitigation strategies"],
      },
      { term: "Utilisation Rate", definition: "Percentage of the allocated budget actually spent. “75% utilisation” means 75% of the budget was used." },
      { term: "Unmet Need", definition: "Gap between assessed needs and the services available or approved." },
      { term: "Clinical Risk", definition: "Health-related concern that needs professional nursing or allied health oversight." },
    ],
  },
];

/** A stable anchor for each term, so a topic or story can link straight to it. */
export const termId = (t: GlossaryTerm) => t.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
