/*
  Trilogy-specific names used across the Care Coordination lessons. These are PLACEHOLDERS until
  Trilogy confirms them: each has an early check date so it shows in Admin > Content review.
  Change a value once in Admin > Facts and every lesson updates.
*/
const confirm = { owner: "Partnerships (placeholder: confirm)", checkBy: "2026-11-13", source: "", sourceTitle: "", notes: "Placeholder written for the draft lessons. Confirm the real name with Trilogy Care." };

export const FACTS = [
  { ...confirm, key: "tc_contact_partnership", label: "Coordinator's first key contact (role)", value: "your Partnership Manager" },
  { ...confirm, key: "tc_contact_clinical", label: "Coordinator's second key contact (team)", value: "Trilogy's Care and Clinical team" },
  { ...confirm, key: "tc_incident_form", label: "Name of Trilogy's incident form", value: "the Incident Submission Form" },
  { ...confirm, key: "tc_portal", label: "Trilogy's online system for coordinators", value: "the Trilogy Care Portal" },
  { ...confirm, key: "tc_case_notes_where", label: "Where coordinators record case notes", value: "the client's record in the Trilogy Care Portal" },
];
