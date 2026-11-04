/*
  The compliance register: what the organisation requires of each mandatory topic, and how a
  person shows they're trained in it. Shared by the server and the register screens.
*/

export const CLASSIFICATIONS = {
  mandatory: "Mandatory compliance",
  mandatory_role: "Mandatory for role",
  recommended: "Recommended",
} as const;
export type Classification = keyof typeof CLASSIFICATIONS;

/** How often it has to be done again; 0 is once only. */
export const RECURRENCES = [
  { months: 0, label: "Once only" },
  { months: 6, label: "Every 6 months" },
  { months: 12, label: "Annual" },
  { months: 24, label: "Every 2 years" },
  { months: 36, label: "Every 3 years" },
] as const;

export const ASSESSMENT_METHODS = {
  quiz: "Quiz",
  scenarios: "Scenarios",
  written: "Written answer",
  assessment: "Marked assessment",
  signoff: "Manager sign-off",
} as const;
export type AssessmentMethod = keyof typeof ASSESSMENT_METHODS;

export const TEST_OUT = {
  allowed: "Allowed",
  approval: "Subject to compliance approval",
  not_allowed: "Not allowed",
} as const;
export type TestOut = keyof typeof TEST_OUT;

export const EVIDENCE = {
  completion: "Completion record",
  assessment: "Assessment record",
  signoff: "Manager sign-off",
  assessment_signoff: "Assessment record and manager sign-off",
} as const;
export type Evidence = keyof typeof EVIDENCE;

export const EXPIRY = {
  cycle: "Based on required training cycle",
  months: "A set time after completion",
  none: "Doesn’t expire",
} as const;
export type Expiry = keyof typeof EXPIRY;

export type RegisterSettings = {
  classification: Classification;
  recurrenceMonths: number;
  assessment: AssessmentMethod[];
  testOut: TestOut;
  /** The team or person accountable for the competency, e.g. Compliance team. */
  owner: string;
  evidence: Evidence;
  expiry: Expiry;
  /** With expiry "months": how long training lasts. */
  expiryMonths: number | null;
  /** How far ahead "due soon" starts. */
  dueSoonDays: number;
  policyName: string;
  policyVersion: string;
  policyUrl: string;
  /** The topic version approved as matching the policy; null until someone approves one. */
  approvedVersion: string | null;
};

export const REGISTER_DEFAULTS: RegisterSettings = {
  classification: "mandatory",
  recurrenceMonths: 12,
  assessment: [],
  testOut: "approval",
  owner: "Compliance team",
  evidence: "assessment",
  expiry: "cycle",
  expiryMonths: null,
  dueSoonDays: 30,
  policyName: "",
  policyVersion: "",
  policyUrl: "",
  approvedVersion: null,
};

const oneOf = <T extends string>(v: unknown, options: Record<T, string>, fallback: T): T => (typeof v === "string" && v in options ? (v as T) : fallback);
const text = (v: unknown, max: number) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/** Settings from the register form, kept to the allowed values. */
export function cleanRegisterSettings(v: unknown): RegisterSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const months = Math.round(Number(o.recurrenceMonths));
  const expiryMonths = Math.round(Number(o.expiryMonths));
  const soon = Math.round(Number(o.dueSoonDays));
  const url = text(o.policyUrl, 500);
  return {
    classification: oneOf(o.classification, CLASSIFICATIONS, REGISTER_DEFAULTS.classification),
    recurrenceMonths: RECURRENCES.some((r) => r.months === months) ? months : REGISTER_DEFAULTS.recurrenceMonths,
    assessment: (Array.isArray(o.assessment) ? o.assessment : []).filter(
      (m, i, all): m is AssessmentMethod => typeof m === "string" && m in ASSESSMENT_METHODS && all.indexOf(m) === i,
    ),
    testOut: oneOf(o.testOut, TEST_OUT, REGISTER_DEFAULTS.testOut),
    owner: text(o.owner, 120),
    evidence: oneOf(o.evidence, EVIDENCE, REGISTER_DEFAULTS.evidence),
    expiry: oneOf(o.expiry, EXPIRY, REGISTER_DEFAULTS.expiry),
    expiryMonths: Number.isFinite(expiryMonths) && expiryMonths >= 1 && expiryMonths <= 120 ? expiryMonths : null,
    dueSoonDays: Number.isFinite(soon) && soon >= 0 && soon <= 180 ? soon : REGISTER_DEFAULTS.dueSoonDays,
    policyName: text(o.policyName, 160),
    policyVersion: text(o.policyVersion, 40),
    // Only web links, so a stored value can't run script when it's clicked.
    policyUrl: /^https?:\/\//i.test(url) ? url : "",
    approvedVersion: o.approvedVersion ? text(o.approvedVersion, 20) : null,
  };
}

/** How long training lasts, in months; null when it doesn't expire. */
export function validMonths(s: Pick<RegisterSettings, "expiry" | "recurrenceMonths" | "expiryMonths">) {
  if (s.expiry === "none") return null;
  if (s.expiry === "months") return s.expiryMonths;
  return s.recurrenceMonths || null;
}

/** The date training done on `completedAt` runs out (YYYY-MM-DD), or null if it doesn't. */
export function expiryFor(completedAt: string, months: number | null) {
  if (!months) return null;
  const d = new Date(completedAt);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 January plus a month is the end of February, not early March.
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export type RegisterStatus = "current" | "due_soon" | "expired" | "refresher" | "evidence" | "approval" | "in_progress" | "not_trained";

export const STATUS_LABELS: Record<RegisterStatus, string> = {
  current: "Trained",
  due_soon: "Due soon",
  expired: "Expired",
  refresher: "Needs refresher",
  evidence: "Evidence missing",
  approval: "Awaiting approval",
  in_progress: "In progress",
  not_trained: "Not trained",
};
