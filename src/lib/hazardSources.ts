/*
  The policy and guidance sources a Spot the Hazard item or action can rest on (docs/spot-the-hazard.md). FOR QUALITY
  REVIEW: every rationale and approved action in a scene cites one of these by id, so a source can be found, reviewed
  and withdrawn in one place.

  - `status` drives publishing and selection. "review-required" or "withdrawn" (or a review date that has passed)
    takes every variant citing it out of selection, and holds publishing, until the scene is reviewed again. Attempts
    already made keep the variant and answer key they were scored on.
  - `placeholder` marks a Hub policy record that stands in for a Trilogy Care procedure nobody has supplied yet. A
    variant citing one can be drafted and previewed, but not approved for learners until the real procedure replaces it.

  Nothing here is current Trilogy Care policy until Quality, Clinical and Operations say so. The external sources are
  the Commission's guidance the PRD cites; the internal records are placeholders.
*/

export type SourceStatus = "current" | "review-required" | "withdrawn";
export type HazardSource = {
  id: string;
  title: string;
  owner: string;
  url: string;
  /** A Job Aid in the Work Tools library that carries the steps, where there is one. */
  jobAid?: string;
  status: SourceStatus;
  reviewBy: string;
  placeholder: boolean;
};

export const HAZARD_SOURCES: HazardSource[] = [
  {
    id: "acqsc-home-environment",
    title: "Aged Care Quality and Safety Commission: Environment in the individual’s home",
    owner: "Quality and Clinical Governance",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/environment/environment-services-delivered-individuals-home",
    status: "current",
    reviewBy: "2027-06-30",
    placeholder: false,
  },
  {
    id: "acqsc-ipc",
    title: "Aged Care Quality and Safety Commission: Infection prevention and control",
    owner: "Quality and Clinical Governance",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/environment/infection-prevention-and-control",
    status: "current",
    reviewBy: "2027-06-30",
    placeholder: false,
  },
  {
    id: "tc-home-safety",
    title: "Home safety and falls risk at home (placeholder Hub policy record)",
    owner: "Quality and Clinical Governance",
    url: "",
    jobAid: "ask-before-changing-the-plan",
    status: "current",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-equipment-transfers",
    title: "Equipment checks and transfers (placeholder Hub policy record)",
    owner: "Clinical Governance and Operations",
    url: "",
    status: "current",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-infection-control",
    title: "Infection prevention in the home: PPE, waste and cleaning (placeholder Hub policy record)",
    owner: "Quality and Clinical Governance",
    url: "",
    status: "current",
    reviewBy: "",
    placeholder: true,
  },
  {
    id: "tc-incidents",
    title: "Incident response procedure (placeholder Hub policy record)",
    owner: "Quality and Clinical Governance",
    url: "",
    jobAid: "sirs-first-steps",
    status: "current",
    reviewBy: "",
    placeholder: true,
  },
  // The two sources ALIS module 3.3 (SIRS in Home Services: Neglect) cites by name. Marked review-required until Quality
  // confirms the current version and adds the link: the module itself flags both to verify.
  {
    id: "aged-care-rules-neglect",
    title: "Aged Care Rules 2025, s16-5: reportable neglect, and the person’s recorded choice",
    owner: "Quality and Clinical Governance",
    url: "",
    status: "review-required",
    reviewBy: "",
    placeholder: false,
  },
  {
    id: "acqsc-sirs-home",
    title: "Aged Care Quality and Safety Commission: SIRS guidelines for home services, Chapter 4",
    owner: "Quality and Clinical Governance",
    url: "",
    jobAid: "sirs-first-steps",
    status: "review-required",
    reviewBy: "",
    placeholder: false,
  },
];

export const hazardSource = (id: string) => HAZARD_SOURCES.find((s) => s.id === id) ?? null;

/** A source's status on a day: its own status, or "review-required" once its review date has passed. Unknown is withdrawn. */
export function sourceStatus(id: string, today: string, list: HazardSource[] = HAZARD_SOURCES): SourceStatus {
  const s = list.find((x) => x.id === id);
  if (!s) return "withdrawn";
  if (s.status !== "current") return s.status;
  return s.reviewBy && s.reviewBy < today ? "review-required" : "current";
}
