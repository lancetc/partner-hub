/*
  Facts for the Chapter 05 (Care Coordination) draft lessons. Program facts were checked against
  health.gov.au on 26 October 2026. Trilogy-specific values are placeholders until Trilogy confirms them.
*/
const CM = "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/care-management-for-support-at-home";
const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name with Trilogy Care." };

export const FACTS = [
  {
    key: "sah_cm_monthly",
    label: "Minimum care management contact (Support at Home)",
    value: "at least one direct care management activity (talking or meeting with the participant or their registered supporter) every month",
    source: CM,
    sourceTitle: "Care management for Support at Home (Department of Health, Disability and Ageing)",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },
  {
    key: "sah_care_plan_review",
    label: "How often care plans are reviewed (at minimum)",
    value: "at least once every 12 months",
    source: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/care-plans-for-support-at-home-participants",
    sourceTitle: "Care plans for Support at Home participants",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
    notes: "Also reviewed when needs, goals, funding, risks or supports change, or the participant asks.",
  },
  {
    key: "sah_statement_due",
    label: "Monthly statement deadline",
    value: "by the last day of the following month",
    source: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/monthly-statements-for-support-at-home-services",
    sourceTitle: "Monthly statements for Support at Home services",
    checkBy: "2027-04-30",
    owner: "Finance",
  },
  {
    key: "sah_interim_funding",
    label: "Interim funding while waiting for full funding",
    value: "60% of their classification's funding",
    source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home",
    sourceTitle: "Funding classifications for Support at Home",
    checkBy: "2027-04-30",
    owner: "Finance",
    notes: "Doesn't apply to the Restorative Care or End-of-Life pathways. The remaining funding isn't backdated.",
  },
  {
    key: "sah_priority_categories",
    label: "Support at Home Priority System categories",
    value: "urgent, high, medium or standard",
    source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/support-at-home-ongoing-services-priority-categories-assignment",
    sourceTitle: "Support at Home ongoing services priority categories assignment",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },
  {
    key: "sah_service_list_shape",
    label: "Shape of the Support at Home service list",
    value: "3 contribution categories, 14 service types and 49 services",
    source: "https://www.health.gov.au/resources/publications/support-at-home-service-list",
    sourceTitle: "Support at Home service list (September 2026)",
    checkBy: "2027-03-31",
    owner: "Quality and Compliance",
    notes: "The list is updated from time to time. Check the count of service types and services.",
  },
  {
    key: "sah_pause_withdrawal",
    label: "When paused ongoing funding is withdrawn",
    value: "4 quarters in a row (one year) without services",
    source: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/temporarily-stopping-support-at-home-services",
    sourceTitle: "Temporarily stopping Support at Home services",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },
  { ...confirm, key: "tc_budget_where", label: "Where coordinators see a client's budget and spend", value: "the client's budget view in the Trilogy Care Portal" },
];
