/*
  Starting courses (docs/onboarding.md, "Starting courses"): which getting-started course applies to a person, from
  their verified role and work, and what to show them next. Shared by the server and pages.

  Kept apart on purpose, as the setup tasks are:
  - the person's role and work (set by an administrator, never by the person),
  - the assignment rule (versioned, effective-dated, with a named owner who alone can make it mandatory),
  - the enrolment (one per person, organisation and course version: repeated sign-ins never add another),
  - learning progress (read from the Hub's own Topic, Magazine and Job Aid records, never copied),
  - operational approval (supplier approval, credentials, clearance), which a course completion never sets.
*/

/** How the Hub groups people for starting courses. Worked out from their verified role, never chosen by them. */
export const SEGMENTS = {
  supplier: "Supplier",
  coordinator: "Care Coordinator",
  principal: "Care Partner (business principal)",
  staff: "Trilogy Care staff",
} as const;
export type Segment = keyof typeof SEGMENTS;

/**
  The four roles someone picks from at the first sign-in (the owner, Nov 2026): the Magazine's four, in its order. The
  pick takes effect straight away (their content and starting course follow it); an administrator can keep it or change
  it back. It never grants anything: a Care Partner picked here isn't an administrator of their business.
*/
export const ROLE_CHOICES: { segment: Segment; label: string; hint: string }[] = [
  { segment: "supplier", label: "Supplier", hint: "You deliver services to Trilogy Care clients, such as cleaning, gardening or nursing." },
  { segment: "coordinator", label: "Care Coordinator", hint: "You coordinate clients’ care and services." },
  { segment: "principal", label: "Care Partner", hint: "You own or manage a partner business." },
  { segment: "staff", label: "Trilogy Care staff", hint: "You work for Trilogy Care." },
];
export const roleChoiceLabel = (s: string | null | undefined) => ROLE_CHOICES.find((c) => c.segment === s)?.label ?? "Not set";

/**
  The role an account is: the one they picked for themself while it still fits their account's audience (an
  administrator may have changed that since), otherwise from the account (a partner business's administrator is its
  Care Partner, everyone else there a Supplier).
*/
export function accountSegment(u: { audience: string; role: string; self_role?: string | null }): Segment {
  const picked = u.self_role as Segment | null | undefined;
  if (picked && picked in SEGMENTS && SEGMENT_AUDIENCE[picked] === u.audience) return picked;
  return u.audience === "staff" ? "staff" : u.audience === "coordinator" ? "coordinator" : u.role === "org_admin" ? "principal" : "supplier";
}

/** The Hub audience each segment reads content as. A principal is a Care Partner; a supplier reads Care Partner content too. */
export const SEGMENT_AUDIENCE: Record<Segment, "partner" | "coordinator" | "staff"> = {
  supplier: "partner",
  coordinator: "coordinator",
  principal: "partner",
  staff: "staff",
};

/** Supplier service types. A cleaner and a nurse share an introduction but never each other's branch. */
export const SERVICE_TYPES = {
  cleaning: "Cleaning",
  gardening: "Gardening",
  nursing: "Nursing",
  allied_health: "Allied health",
  personal_care: "Personal care",
  home_maintenance: "Home maintenance",
} as const;
export type ServiceType = keyof typeof SERVICE_TYPES;

/** What the person does at work, in their words: "You're here to provide cleaning services." */
export const SERVICE_PHRASES: Record<ServiceType, string> = {
  cleaning: "cleaning services",
  gardening: "gardening services",
  nursing: "nursing services",
  allied_health: "allied health services",
  personal_care: "personal care",
  home_maintenance: "home maintenance",
};

/**
  A service type as recorded on someone's account, in the Hub's words. Anything that isn't one of the known types is
  treated as missing, so a typo or an unknown value asks for confirmation rather than guessing a branch.
*/
export function serviceTypeOf(raw: string | null | undefined): ServiceType | null {
  const v = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!v) return null;
  const alias: Record<string, ServiceType> = {
    cleaner: "cleaning",
    gardener: "gardening",
    nurse: "nursing",
    allied: "allied_health",
    personal_care_worker: "personal_care",
    maintenance: "home_maintenance",
  };
  if (v in SERVICE_TYPES) return v as ServiceType;
  return alias[v] ?? null;
}

/** Trilogy staff functions. A general employee doesn't receive an administrator's course, or powers. */
export const STAFF_FUNCTIONS = {
  general: "Employee",
  author: "Content author",
  moderator: "Community moderator",
  manager: "Team manager",
  administrator: "Technical administrator",
} as const;
export type StaffFunction = keyof typeof STAFF_FUNCTIONS;

export type Membership = {
  /** "primary" for the person's Hub account; otherwise an added, verified role. */
  id: string;
  segment: Segment;
  orgId: string;
  orgName: string;
  serviceType: ServiceType | null;
  staffFunction: StaffFunction | null;
  /** Where it came from and who verified it, in words. */
  source: string;
  verifiedBy: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

/** Who a rule applies to. Empty lists mean "any". Service types only apply to suppliers; functions only to staff. */
export type RuleWhen = { segment: Segment; serviceTypes: ServiceType[]; staffFunctions: StaffFunction[] };

export const TRIGGERS = {
  joined: "When they first sign in, or are added",
  scope_change: "When their role or work changes",
  manual: "Only when an administrator assigns it",
} as const;
export type Trigger = keyof typeof TRIGGERS;

export type RuleData = {
  name: string;
  when: RuleWhen;
  courseId: string;
  /** Asked for. Only the named owner can approve it; until then it's assigned as recommended, without a due date. */
  mandatory: boolean;
  trigger: Trigger;
  /** Days after assignment that it's due, once mandatory is approved. Null: no due date. */
  dueDays: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The accountable team, in words, and the person who approves it (a Hub user), if one has been named. */
  ownerTeam: string;
  ownerUserId: string | null;
  /** Synthetic demonstration content, not current Trilogy policy. */
  demo: boolean;
  note: string;
};
export type MandatoryState = "none" | "pending" | "approved";

/** A step in a course: an existing Topic, Magazine course or Job Aid, by reference. Never a copy. */
export type StepKind = "topic" | "course" | "path" | "job_aid";
export const STEP_KINDS: Record<StepKind, string> = { topic: "Topic", course: "Magazine course", path: "Discovery Path", job_aid: "Job Aid" };
export type CourseStep = {
  id: string;
  kind: StepKind;
  /** `topic:<slug>`, `course:<guide id>`, `path:<learning path id>` or `aid:<snippet id>`. */
  ref: string;
  /** The step as the learner reads it: what to do, not the content's title. */
  title: string;
  required: boolean;
  minutes: number;
  /**
    For later rather than today (the owner, Nov 2026): a short course first, a longer one when they're ready. Still
    allocated, and still counts; it's just not where they start. Missing: today.
  */
  later?: boolean;
};

export type CourseData = {
  /** The admin's name for it. */
  name: string;
  /** What the learner sees, action first: "Getting ready for your first visit". */
  learnerTitle: string;
  gains: string[];
  segment: Segment;
  /** For a supplier branch: the service types it's written for. Empty: every supplier (a shared introduction). */
  serviceTypes: ServiceType[];
  /** Earlier stages come first on the learner's homepage. */
  stage: number;
  order: number;
  steps: CourseStep[];
  /** Languages with a reviewed translation of the whole course. English is the source. */
  languages: string[];
  ownerTeam: string;
  /** What happens to people part-way through when a new version is published. */
  reassign: "continue" | "new_assignment";
  changeNote: string;
  /** Content that should exist but doesn't yet, for the owner to commission. */
  gaps: string;
  demo: boolean;
};

export const STATUS_WORDS = {
  active: "In progress",
  completed: "Completed",
  exempted: "Exempted",
  ended: "No longer assigned",
} as const;
export type EnrolmentStatus = keyof typeof STATUS_WORDS;

const list = (items: string[], last = "or") => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`);

/** The "IF" half of a rule, in plain words. */
export function whenSummary(w: RuleWhen): string {
  const parts = [`verified role is ${SEGMENTS[w.segment]}`];
  if (w.segment === "supplier")
    parts.push(
      w.serviceTypes.length ? `verified service type includes ${list(w.serviceTypes.map((s) => SERVICE_TYPES[s]))}` : "they have a verified service type (any)",
    );
  if (w.segment === "staff" && w.staffFunctions.length) parts.push(`their function is ${list(w.staffFunctions.map((f) => STAFF_FUNCTIONS[f]))}`);
  parts.push("their membership is active");
  return parts.join(" AND ");
}

/** A rule as an administrator reads it before publishing: IF … THEN …, with its owner, trigger and due rule. */
export function ruleSummary(r: RuleData, courseTitle: string, state: MandatoryState) {
  return {
    if: `IF ${whenSummary(r.when)}`,
    then: `THEN assign “${courseTitle}”`,
    with: [
      r.mandatory
        ? state === "approved"
          ? "Mandatory (approved by its owner)"
          : "Mandatory requested: waiting for the named owner to approve. Until then it’s recommended, with no due date."
        : "Recommended, not mandatory",
      r.dueDays ? `Due ${r.dueDays} days after it’s assigned${state === "approved" ? "" : " (once mandatory is approved)"}` : "No due date",
      TRIGGERS[r.trigger],
      `Owner: ${r.ownerTeam || "not named"}`,
      `In force from ${r.effectiveFrom}${r.effectiveTo ? ` to ${r.effectiveTo}` : ""}`,
    ],
  };
}

/** Whether a membership meets a rule's conditions. A supplier with no verified service type meets none. */
export function matches(w: RuleWhen, m: Pick<Membership, "segment" | "serviceType" | "staffFunction">): boolean {
  if (w.segment !== m.segment) return false;
  if (m.segment === "supplier") {
    if (!m.serviceType) return false;
    if (w.serviceTypes.length && !w.serviceTypes.includes(m.serviceType)) return false;
  }
  if (m.segment === "staff" && w.staffFunctions.length && !(m.staffFunction && w.staffFunctions.includes(m.staffFunction))) return false;
  return true;
}

/** How a membership reads to the person: "Supplier · cleaning services · Taylor Cleaning". */
export function membershipLabel(m: Pick<Membership, "segment" | "serviceType" | "staffFunction" | "orgName">) {
  const work = m.serviceType ? SERVICE_PHRASES[m.serviceType] : m.staffFunction && m.staffFunction !== "general" ? STAFF_FUNCTIONS[m.staffFunction] : "";
  return [SEGMENTS[m.segment], work, m.orgName].filter(Boolean).join(" · ");
}

/** Whole days from one ISO time to a calendar date (negative when it's past). */
export function daysUntil(dueOn: string, now: Date) {
  return Math.ceil((Date.parse(`${dueOn}T23:59:59Z`) - now.getTime()) / 86_400_000);
}

/** A due date in plain words, with what to do about it. Only ever shown for a real due date. */
export function dueWords(dueOn: string | null, now: Date): { text: string; overdue: boolean } | null {
  if (!dueOn) return null;
  const days = daysUntil(dueOn, now);
  if (days < 0)
    return {
      text: `This was due ${Math.abs(days)} day${days === -1 ? "" : "s"} ago. Carry on where you left off, or ask for help if something is in the way.`,
      overdue: true,
    };
  if (days === 0) return { text: "Due today.", overdue: false };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}.`, overdue: false };
}

/** The learner's preferences for getting started. Language itself is the Hub-wide setting (Profile and settings). */
/**
  Get to know you (the owner, Nov 2026): a few optional questions on a starting course's page, so Trilogy Care
  understands someone's background. Every answer is optional and can be changed; administrators see them on the
  person's page (Admin → Onboarding → Starting courses → People).
*/
export const ABOUT_YEARS = {
  new: "I’m new to it",
  lt1: "Less than a year",
  "1to3": "1 to 3 years",
  "3to10": "3 to 10 years",
  "10plus": "More than 10 years",
} as const;
export type AboutYears = keyof typeof ABOUT_YEARS;
export const ABOUT_INTERESTS = {
  clients: "Working with clients and families",
  quality: "Quality and safety",
  money: "Funding, quotes and getting paid",
  business: "Running or growing a business",
  tech: "Using the Hub and other systems",
  compliance: "Rules and compliance",
} as const;
export type AboutInterest = keyof typeof ABOUT_INTERESTS;
export const ABOUT_LEARN = {
  videos: "Short videos",
  reading: "Reading",
  listening: "Listening",
  practice: "Practising with real situations",
  people: "Learning from other people",
} as const;
export type AboutLearn = keyof typeof ABOUT_LEARN;
export type About = {
  years: AboutYears | null;
  before: string;
  languages: string;
  interests: AboutInterest[];
  learn: AboutLearn[];
  note: string;
  updatedAt: string | null;
};

export const READ_MODES = { read: "Read", listen: "Listen", both: "Read and listen" } as const;
export type ReadMode = keyof typeof READ_MODES;
export const TEXT_SIZES = { standard: "Standard", large: "Larger" } as const;
export type TextSize = keyof typeof TEXT_SIZES;

export const HELP_KINDS = {
  language: "I need this in my language, or read to me",
  access: "I can’t use something on my phone or with my device",
  broken: "Something is broken or missing",
  question: "I have a question about my work",
  completion: "My progress or completion is wrong",
} as const;
export type HelpKind = keyof typeof HELP_KINDS;

export const DEMO_NOTE = "Demonstration course with made-up examples. It isn’t current Trilogy Care policy and hasn’t been approved by its owner.";
