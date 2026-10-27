/*
  Facts for chapter 06 (Incident Reporting & SIRS). SIRS timeframes come from the Aged Care Quality
  and Safety Commission. The Commission is updating its SIRS pages for the Aged Care Act 2024 and the
  Aged Care Rules 2025, so these have early check dates.
*/
const QG = "https://www.agedcarequality.gov.au/resource-library/reportable-incidents-and-sirs-quick-guide-changes-1-nov-2025";
const QG_TITLE = "Reportable incidents and SIRS: a quick guide to changes from 1 Nov 2025 (Aged Care Quality and Safety Commission)";
const ABOUT = "https://www.agedcarequality.gov.au/providers/serious-incident-response-scheme/reportable-incidents/about-reportable-incidents";
const ABOUT_TITLE = "About reportable incidents (Aged Care Quality and Safety Commission)";
const PSYCH = "https://www.agedcarequality.gov.au/providers/serious-incident-response-scheme/reportable-incidents/psychological-or-emotional-abuse-0";

const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name with Trilogy Care." };

export const FACTS = [
  {
    key: "sirs_p1_timeframe",
    label: "SIRS Priority 1: time for the provider to notify the Commission",
    value: "within 24 hours of becoming aware",
    source: QG,
    sourceTitle: QG_TITLE,
    checkBy: "2027-01-31",
    owner: "Quality and Compliance",
    notes: "Any information not available at the time must be given within the following 5 days (see sirs_p1_followup). Commission pages are being updated for the Aged Care Act 2024.",
  },
  {
    key: "sirs_p1_followup",
    label: "SIRS Priority 1: time to give information not available at first notice",
    value: "within the following 5 days",
    source: QG,
    sourceTitle: QG_TITLE,
    checkBy: "2027-01-31",
    owner: "Quality and Compliance",
  },
  {
    key: "sirs_p2_timeframe",
    label: "SIRS Priority 2: time for the provider to notify the Commission",
    value: "within 30 days of becoming aware",
    source: ABOUT,
    sourceTitle: ABOUT_TITLE,
    checkBy: "2027-01-31",
    owner: "Quality and Compliance",
    notes: "The quick guide says 30 calendar days.",
  },
  {
    key: "elder_abuse_phone",
    label: "National elder abuse phone line (1800ELDERHelp)",
    value: "1800 353 374",
    source: PSYCH,
    sourceTitle: "Psychological or emotional abuse (Aged Care Quality and Safety Commission)",
    checkBy: "2027-10-31",
    owner: "Quality and Compliance",
  },
  { ...confirm, key: "tc_after_hours", label: "Who coordinators call about an incident out of hours", value: "Trilogy's after-hours contact" },
];
