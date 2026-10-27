/*
  Facts for Chapter 07 (Compliance & Quality). Verified regulatory values first, then Trilogy-specific
  placeholders that Trilogy must confirm (early check date so they show in Admin > Content review).
*/
const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name with Trilogy Care." };

export const FACTS = [
  {
    key: "police_cert_max_age",
    label: "Maximum age of a police certificate for aged care work",
    value: "3 years",
    source: "https://www.health.gov.au/topics/aged-care-workforce/screening-requirements",
    sourceTitle: "Screening requirements for the aged care workforce (Department of Health, Disability and Ageing)",
    checkBy: "2027-03-31",
    owner: "Quality and Compliance",
    notes: "Workers need a police certificate no older than this, or an NDIS worker screening check. A national worker screening check for the care and support economy is being developed; check whether it has replaced these options.",
  },
  {
    key: "incident_record_retention",
    label: "How long incident records must be kept",
    value: "7 years after the incident was identified",
    source: "https://www.agedcarequality.gov.au/providers/serious-incident-response-scheme/incident-management-systems/recording-incidents",
    sourceTitle: "Recording incidents (Aged Care Quality and Safety Commission)",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },
  { ...confirm, key: "tc_quality_team", label: "Trilogy team that runs internal audits and file reviews", value: "Trilogy’s Quality and Compliance team" },
  { ...confirm, key: "tc_whistleblower_policy", label: "Name of Trilogy’s whistleblower policy", value: "Trilogy’s whistleblower policy" },
];
