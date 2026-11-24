/*
  The sources The 72-Hour Discharge Pivot rests on (docs/discharge-pivot.md), for the reviewer and for Quality.

  Public sources were checked on 21 November 2026 (the PRD's section 16) and inform the exercise design only. They
  don't name Trilogy Care's contacts, thresholds, service capacity or clinical delegation: those come from Trilogy
  Care's own procedures, which are **placeholder records** here until their owners supply the current versions. A
  block citing a placeholder, or a source that is under review or withdrawn, can't be published (lib/dischargePivot
  pivotHardProblems), and a withdrawn source takes the block out of use for new attempts.

  To flag every block resting on a source after it changes: set its status to "review-required" (or let its review
  date pass). Old attempts keep the debrief they were given.
*/

export type DischargeSource = {
  id: string;
  title: string;
  url: string;
  owner: string;
  kind: "public" | "internal";
  status: "current" | "review-required" | "withdrawn";
  /** When it was last checked against the block's claims. */
  checked: string;
  reviewBy: string;
  /** An internal record that doesn't exist yet: it holds publishing until the owner supplies the real one. */
  placeholder?: boolean;
};

const PUBLIC = { kind: "public" as const, status: "current" as const, checked: "2026-11-21", reviewBy: "2027-05-21" };
const INTERNAL = { kind: "internal" as const, status: "current" as const, checked: "", reviewBy: "", url: "", placeholder: true };

export const DISCHARGE_SOURCES: DischargeSource[] = [
  {
    id: "acqsc-transitions",
    title: "Aged Care Quality and Safety Commission: Transitions",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/residential-community/transitions",
    owner: "Aged Care Quality and Safety Commission",
    ...PUBLIC,
  },
  {
    id: "acqsc-comprehensive-care",
    title: "Aged Care Quality and Safety Commission: Comprehensive care",
    url: "https://www.agedcarequality.gov.au/strengthened-quality-standards/clinical-care/comprehensive-care",
    owner: "Aged Care Quality and Safety Commission",
    ...PUBLIC,
  },
  {
    id: "doh-restorative-care",
    title: "Department of Health, Disability and Ageing: Restorative Care Pathway",
    url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/restorative-care-pathway",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-other-programs",
    title: "Department: How Support at Home interacts with other aged care programs",
    url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/how-support-at-home-interacts-with-other-aged-care-programs",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-tcp",
    title: "Department: Transition Care Program",
    url: "https://www.health.gov.au/our-work/transition-care-program",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-at-hm",
    title: "Department: Assistive Technology and Home Modifications (AT–HM) scheme",
    url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/assistive-technology-and-home-modifications-at-hm-scheme",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-care-plans",
    title: "Department: Care plans for Support at Home participants",
    url: "https://www.health.gov.au/our-work/support-at-home/managing-support-at-home-services/care-plans-for-support-at-home-participants",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-spr",
    title: "Department: When to request a Support Plan Review from an assessor (fact sheet)",
    url: "https://www.health.gov.au/sites/default/files/2025-10/when-to-request-a-support-plan-review-from-an-assessor-fact-sheet_0.pdf",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-sah-manual",
    title: "Department: Support at Home program manual (use the latest version at publication)",
    url: "https://www.health.gov.au/resources/publications/support-at-home-program-manual-a-guide-for-registered-providers",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "tc-hospital-handover",
    title: "Trilogy Care hospital-to-home handover procedure (placeholder Hub policy record)",
    owner: "Care Partner Operations, with the discharge process owner",
    ...INTERNAL,
  },
  {
    id: "tc-clinical-escalation",
    title: "Trilogy Care clinical escalation route (placeholder Hub policy record)",
    owner: "Clinical Governance and Quality",
    ...INTERNAL,
  },
  {
    id: "tc-privacy-consent",
    title: "Trilogy Care privacy and consent procedure (placeholder Hub policy record)",
    owner: "Privacy",
    ...INTERNAL,
  },
];

export const dischargeSource = (id: string) => DISCHARGE_SOURCES.find((s) => s.id === id);

/** "current", "review-required" (marked, or past its review date) or "withdrawn". An unknown id reads as withdrawn. */
export function dischargeSourceStatus(id: string, today: string): DischargeSource["status"] {
  const s = dischargeSource(id);
  if (!s) return "withdrawn";
  if (s.status !== "current") return s.status;
  if (s.reviewBy && s.reviewBy < today) return "review-required";
  return "current";
}
