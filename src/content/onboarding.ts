/*
  Demonstration onboarding configuration. The real document matrix, readiness rules and
  waivers must be confirmed by Trilogy operations (PRD section 9); these are placeholders.
*/

export type TaskKind = "profile" | "organisation" | "document" | "agreement" | "learning";

export type OnboardingTask = {
  id: string;
  group: "Profile" | "Organisation" | "Documents" | "Agreements" | "Starter learning";
  kind: TaskKind;
  title: string;
  why: string;
  responsible: "You" | "Your organisation administrator";
  requiredForReadiness: boolean;
  /** Task ids that must be done first, with the reason shown to the person. */
  dependsOn?: { id: string; reason: string };
  appliesTo?: { services?: string[]; roles?: string[] };
  accept?: string;
  acceptLabel?: string;
  maxMb?: number;
  hasExpiry?: boolean;
  lessonSlug?: string;
  fields?: { id: string; label: string; type?: string; autoComplete?: string }[];
};

export const roles = [
  { id: "individual", label: "Individual Care Partner", hint: "You deliver services yourself" },
  { id: "org-admin", label: "Partner organisation administrator", hint: "You manage a business and its workers" },
];

export const serviceTypes = [
  { id: "cleaning", label: "Cleaning" },
  { id: "gardening", label: "Gardening" },
  { id: "physiotherapy", label: "Physiotherapy" },
  { id: "nursing", label: "Nursing" },
  { id: "personal-care", label: "Personal care" },
];

export const onboardingTasks: OnboardingTask[] = [
  {
    id: "profile",
    group: "Profile",
    kind: "profile",
    title: "Your contact details",
    why: "So coordinators can reach you about visits and changes.",
    responsible: "You",
    requiredForReadiness: true,
    fields: [
      { id: "name", label: "Full name", autoComplete: "name" },
      { id: "phone", label: "Mobile number", type: "tel", autoComplete: "tel" },
      { id: "suburb", label: "Suburb you work from", autoComplete: "address-level2" },
    ],
  },
  {
    id: "abn",
    group: "Organisation",
    kind: "organisation",
    title: "Business details",
    why: "We need your business name and ABN to set up payments.",
    responsible: "You",
    requiredForReadiness: true,
    fields: [
      { id: "business", label: "Business or trading name", autoComplete: "organization" },
      { id: "abn", label: "ABN (demo, do not enter a real number)", type: "text" },
    ],
  },
  {
    id: "insurance",
    group: "Documents",
    kind: "document",
    title: "Public liability insurance",
    why: "Covers you and clients while you deliver services. Example requirement only.",
    responsible: "You",
    requiredForReadiness: true,
    accept: ".pdf,.jpg,.jpeg,.png,.heic",
    acceptLabel: "PDF, JPG, PNG or HEIC, up to 10 MB",
    maxMb: 10,
    hasExpiry: true,
  },
  {
    id: "police-check",
    group: "Documents",
    kind: "document",
    title: "Police check",
    why: "Confirms you are suitable to work in clients’ homes. Example requirement only.",
    responsible: "You",
    requiredForReadiness: true,
    accept: ".pdf,.jpg,.jpeg,.png,.heic",
    acceptLabel: "PDF, JPG, PNG or HEIC, up to 10 MB",
    maxMb: 10,
    hasExpiry: true,
  },
  {
    id: "registration",
    group: "Documents",
    kind: "document",
    title: "Professional registration",
    why: "Shows current registration for your profession. Example requirement only.",
    responsible: "You",
    requiredForReadiness: true,
    appliesTo: { services: ["physiotherapy", "nursing"] },
    accept: ".pdf,.jpg,.jpeg,.png",
    acceptLabel: "PDF, JPG or PNG, up to 10 MB",
    maxMb: 10,
    hasExpiry: true,
  },
  {
    id: "agreement",
    group: "Agreements",
    kind: "agreement",
    title: "Care Partner agreement",
    why: "Sets out how we work together. Read it before you accept.",
    responsible: "You",
    requiredForReadiness: true,
    dependsOn: { id: "abn", reason: "The agreement is issued to your business, so add your business details first." },
  },
  {
    id: "learn-extra-time",
    group: "Starter learning",
    kind: "learning",
    title: "A little extra time",
    why: "A three minute topic on extending visits.",
    responsible: "You",
    requiredForReadiness: true,
    lessonSlug: "a-little-extra-time",
  },
  {
    id: "learn-briefing",
    group: "Starter learning",
    kind: "learning",
    title: "Briefing: confirming extra visit time",
    why: "Optional. A two minute briefing on an upcoming change.",
    responsible: "You",
    requiredForReadiness: false,
    lessonSlug: "extra-time-briefing",
  },
];

export const groupsInOrder: OnboardingTask["group"][] = ["Profile", "Organisation", "Documents", "Agreements", "Starter learning"];
