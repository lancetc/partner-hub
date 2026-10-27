/*
  Facts for Chapter 08 · Package Management (lessons 08-1 to 08-5).
  Regulatory values were checked on health.gov.au and myagedcare.gov.au on 26 October 2026.
  Trilogy-specific names at the bottom are PLACEHOLDERS: confirm them with Trilogy Care.
*/
const MAC_COSTS = "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions";
const MAC_COSTS_TITLE = "Support at Home costs and contributions (My Aged Care)";
const CLASSIFICATIONS = "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home";
const CLASSIFICATIONS_TITLE = "Funding classifications for Support at Home";
const PAYMENTS = "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/provider-payment-arrangements-for-support-at-home";
const HARDSHIP = "https://www.myagedcare.gov.au/financial-hardship-assistance";

const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name or process with Trilogy Care." };

export const FACTS = [
  {
    key: "sah_lifetime_cap",
    label: "Lifetime cap on contributions (carried over from Home Care Packages)",
    value: "$88,934.57 (as at 20 September 2026, indexed)",
    source: MAC_COSTS,
    sourceTitle: MAC_COSTS_TITLE,
    checkBy: "2027-03-20",
    owner: "Finance",
    notes: "Indexed each March and September. My Aged Care says the Home Care Package lifetime cap remains for Support at Home contributions.",
  },
  {
    key: "thcp_l1_quarterly",
    label: "Transitioned HCP Level 1 quarterly budget",
    value: "$2,823.55",
    source: MAC_COSTS,
    sourceTitle: MAC_COSTS_TITLE,
    checkBy: "2027-07-01",
    owner: "Finance",
    notes: "Current as of 1 October 2026 on My Aged Care. Indexed each 1 July. Includes care management.",
  },
  {
    key: "thcp_l4_quarterly",
    label: "Transitioned HCP Level 4 quarterly budget",
    value: "$16,385.99",
    source: MAC_COSTS,
    sourceTitle: MAC_COSTS_TITLE,
    checkBy: "2027-07-01",
    owner: "Finance",
    notes: "Current as of 1 October 2026. On 26 October 2026 the My Aged Care table had the Level 4 quarterly and annual columns swapped ($65,543.98 is the annual amount). Indexed each 1 July.",
  },
  {
    key: "sah_claim_deadline",
    label: "Deadline for providers to claim ongoing services",
    value: "up to 60 days after the end of the quarter",
    source: PAYMENTS,
    sourceTitle: "Provider payment arrangements for Support at Home",
    checkBy: "2027-04-30",
    owner: "Finance",
  },
  {
    key: "sah_hardship_form",
    label: "Financial hardship application form",
    value: "the Aged Care Claim for financial hardship assistance form (SA462)",
    source: HARDSHIP,
    sourceTitle: "Financial hardship assistance (My Aged Care)",
    checkBy: "2027-04-30",
    owner: "Finance",
  },
  {
    key: "sah_hardship_timeframe",
    label: "Time Services Australia takes to assess a hardship application",
    value: "within 28 days",
    source: HARDSHIP,
    sourceTitle: "Financial hardship assistance (My Aged Care)",
    checkBy: "2027-04-30",
    owner: "Finance",
    notes: "28 days from receiving the application, or from receiving any extra information requested.",
  },
  {
    key: "sah_agreement_review",
    label: "How often service agreements for ongoing services are reviewed",
    value: "at least every 12 months",
    source: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/service-agreements-for-support-at-home",
    sourceTitle: "Service agreements for Support at Home",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },

  // Trilogy-specific placeholders
  { ...confirm, key: "tc_contact_finance", label: "Trilogy team that handles invoice and statement queries", value: "Trilogy's Finance team" },
  { ...confirm, key: "tc_budget_view", label: "Where coordinators see a client's budget and spending", value: "the client's budget in the Trilogy Care Portal" },
  { ...confirm, key: "tc_invoice_where", label: "How coordinators send supplier invoices to Trilogy", value: "through the Trilogy Care Portal" },
  { ...confirm, key: "tc_price_list", label: "Name of Trilogy's published price list", value: "Trilogy's published price list" },
];
