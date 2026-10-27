/*
  Facts for Chapter 04 (Rights & Obligations). Regulatory values were checked on official sites on
  26 October 2026. Trilogy-specific names are PLACEHOLDERS with an early check date.
*/
const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name with Trilogy Care." };

export const FACTS = [
  {
    key: "opan_phone",
    label: "Aged Care Advocacy Line (Older Persons Advocacy Network, OPAN)",
    value: "1800 700 600",
    source: "https://www.myagedcare.gov.au/seeking-support-from-advocate",
    sourceTitle: "Seeking support from an advocate (My Aged Care)",
    checkBy: "2027-10-31",
    owner: "Quality and Compliance",
    notes: "Free, confidential and independent. Connects callers to the advocacy organisation in their state or territory.",
  },
  {
    key: "opan_hours",
    label: "Aged Care Advocacy Line hours",
    value: "8am to 8pm Monday to Friday, and 10am to 4pm Saturday",
    source: "https://www.myagedcare.gov.au/seeking-support-from-advocate",
    sourceTitle: "Seeking support from an advocate (My Aged Care)",
    checkBy: "2027-04-30",
    owner: "Quality and Compliance",
  },
  {
    key: "dementia_helpline",
    label: "National Dementia Helpline (Dementia Australia)",
    value: "1800 100 500",
    source: "https://www.health.gov.au/contacts/national-dementia-helpline",
    sourceTitle: "National Dementia Helpline (Department of Health, Disability and Ageing)",
    checkBy: "2027-10-31",
    owner: "Quality and Compliance",
    notes: "Free and confidential, 24 hours a day, 7 days a week.",
  },
  {
    key: "ais_phone",
    label: "Aboriginal Interpreter Service (AIS)",
    value: "1800 334 944",
    source: "https://www.agedcarequality.gov.au/older-people/choice-dignity-respect-your-rights-aged-care/what-do-if-you-have-concern",
    sourceTitle: "What to do if you have a concern (Aged Care Quality and Safety Commission)",
    checkBy: "2027-10-31",
    owner: "Quality and Compliance",
  },
  {
    key: "linkup_phone",
    label: "Link-Up (for First Nations people separated from their families)",
    value: "1800 624 332",
    source: "https://www.myagedcare.gov.au/support-care-leavers",
    sourceTitle: "Support for care leavers (My Aged Care)",
    checkBy: "2027-10-31",
    owner: "Quality and Compliance",
  },
  { ...confirm, key: "tc_feedback_form", label: "Name of Trilogy's complaints and feedback form", value: "Trilogy's feedback and complaints form" },
  { ...confirm, key: "tc_risk_record", label: "Where a dignity of risk conversation is recorded", value: "a dignity of risk record in the Trilogy Care Portal" },
];
