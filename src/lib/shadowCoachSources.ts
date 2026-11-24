/*
  The sources First 100 Days: Shadow & Coach rests on (docs/shadow-and-coach.md), for the reviewer and for Quality.

  Public sources were checked on 24 November 2026 against the PRD's section 20 and inform the exercise design only.
  They don't name Trilogy Care's contacts, escalation owners, correction process or delegation of sign-off: those come
  from Trilogy Care's own procedures, which are **placeholder records** here until their owners supply the current
  versions. A block citing a placeholder, or a source that is under review or withdrawn, can't be published
  (lib/shadowCoach signOffProblems), and a withdrawn source takes the block out of use for new attempts.

  The contribution categories themselves aren't repeated here: the case's claims are checked against the Hub's one
  effective-dated rule set (lib/sahRules RULESET), so a change to that rule set flags the case.

  To flag every block resting on a source after it changes: set its status to "review-required" (or let its review
  date pass). Old attempts keep the debrief they were given.
*/

export type ShadowSource = {
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

const PUBLIC = { kind: "public" as const, status: "current" as const, checked: "2026-11-24", reviewBy: "2027-05-24" };
const INTERNAL = { kind: "internal" as const, status: "current" as const, checked: "", reviewBy: "", url: "", placeholder: true };

export const SHADOW_SOURCES: ShadowSource[] = [
  {
    id: "doh-contributions",
    title: "Department of Health, Disability and Ageing: Support at Home participant contributions",
    url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/support-at-home-participant-contributions",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "doh-personal-care-change",
    title: "Department of Health, Disability and Ageing: Personal care contribution change",
    url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/personal-care-contribution-change",
    owner: "Department of Health, Disability and Ageing",
    ...PUBLIC,
  },
  {
    id: "acqsc-sirs-home",
    title: "Aged Care Quality and Safety Commission: SIRS in residential and home services",
    url: "https://www.agedcarequality.gov.au/for-providers/serious-incident-response-scheme/sirs-residential-home-services",
    owner: "Aged Care Quality and Safety Commission",
    ...PUBLIC,
  },
  {
    id: "acqsc-incident-management",
    title: "Aged Care Quality and Safety Commission: Incident management and SIRS (provider handbook)",
    url: "https://www.agedcarequality.gov.au/provider-handbook/provider-requirements/3g-incident-management-and-serious-incident-response-scheme",
    owner: "Aged Care Quality and Safety Commission",
    ...PUBLIC,
  },
  {
    id: "acqsc-support-at-home",
    title: "Aged Care Quality and Safety Commission: Support at Home (the registered provider's responsibilities)",
    url: "https://www.agedcarequality.gov.au/providers/types-aged-care/support-home",
    owner: "Aged Care Quality and Safety Commission",
    ...PUBLIC,
  },
  {
    id: "oaic-employee-records",
    title: "OAIC: Employee records exemption",
    url: "https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/employee-records-exemption",
    owner: "Office of the Australian Information Commissioner",
    ...PUBLIC,
  },
  {
    id: "tc-incident-procedure",
    title: "Trilogy Care incident management procedure (placeholder)",
    owner: "Quality/incident management",
    ...INTERNAL,
  },
  {
    id: "tc-contribution-correction",
    title: "Trilogy Care process for correcting contribution advice to a participant (placeholder)",
    owner: "Support at Home policy and billing",
    ...INTERNAL,
  },
  {
    id: "tc-delegation-matrix",
    title: "Trilogy Care role and delegation matrix for Care Partner managers and coordinators (placeholder)",
    owner: "Care Coordination operations, People/HR and Quality",
    ...INTERNAL,
  },
  {
    id: "tc-coaching-records",
    title: "Trilogy Care guidance on coaching records, employee data and privacy for partner businesses (placeholder)",
    owner: "People/HR and privacy/security",
    ...INTERNAL,
  },
];

export const sourceById = (id: string) => SHADOW_SOURCES.find((s) => s.id === id);
