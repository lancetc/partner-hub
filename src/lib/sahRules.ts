/*
  Support at Home contribution categories and money, effective-dated (docs/while-you-wait.md). One small,
  deterministic place for: which category a funded service falls in on a given date, what that means for a
  participant contribution, and how money is handled (whole Australian cents, rounded once, to the cent).

  - A category says nothing about a person's own rate. Services Australia sets that; without a verified notice
    there is no personal figure, only "rate to confirm".
  - Categories apply to approved, funded Support at Home services only. A private visit keeps its private price.
  - The ruleset carries its source, effective date and review date. When a rule changes, add a dated row; don't
    edit history.
*/

export const CATEGORIES = {
  clinical: { label: "Clinical Supports", contribution: "none" },
  independence: { label: "Independence", contribution: "rate" },
  everyday: { label: "Everyday Living", contribution: "rate" },
} as const;
export type Category = keyof typeof CATEGORIES;

export const SERVICES = {
  domestic_assistance: { label: "Domestic assistance", unit: "hour" },
  personal_care: { label: "Personal care", unit: "hour" },
  nursing: { label: "Nursing", unit: "hour" },
  social_support: { label: "Social support", unit: "hour" },
  meals: { label: "Meals", unit: "meal" },
} as const;
export type ServiceId = keyof typeof SERVICES;

type Row = { service: ServiceId; category: Category; from: string; to: string | null };

/** The ruleset: which category each funded service is in, and when. Reviewed and versioned as a whole. */
export const RULESET = {
  version: "2026-10-01",
  source: "Department of Health, Disability and Ageing: Support at Home participant contributions, and the personal care contribution change",
  reviewOn: "2027-04-01",
  rows: [
    { service: "nursing", category: "clinical", from: "2025-11-01", to: null },
    // Personal care moved to Clinical Supports for services delivered from 1 October 2026.
    { service: "personal_care", category: "independence", from: "2025-11-01", to: "2026-09-30" },
    { service: "personal_care", category: "clinical", from: "2026-10-01", to: null },
    { service: "social_support", category: "independence", from: "2025-11-01", to: null },
    { service: "domestic_assistance", category: "everyday", from: "2025-11-01", to: null },
    { service: "meals", category: "everyday", from: "2025-11-01", to: null },
  ] as Row[],
};

/** The category a funded service is in on a date, by the ruleset. Null if the ruleset doesn't cover it. */
export function categoryOn(service: ServiceId, date: string, rules = RULESET): Category | null {
  return rules.rows.find((r) => r.service === service && r.from <= date && (r.to === null || date <= r.to))?.category ?? null;
}

/** Whether the ruleset is past its review date: figures from it shouldn't be client-ready until it's reviewed. */
export const rulesStale = (today: string, rules = RULESET) => !today || rules.reviewOn < today;

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

/** Price × units, in cents. Units can be fractional (1.5 hours); the result is rounded once, to the cent. */
export const times = (centsPerUnit: number, units: number) => Math.round(centsPerUnit * units);
/** A rate in basis points (2000 = 20%) of an amount in cents, rounded to the cent. */
export const share = (cents: number, basisPoints: number) => Math.round((cents * basisPoints) / 10000);

export const aud = (cents: number) =>
  `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: Math.abs(cents) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------
// Dates (YYYY-MM-DD, treated as calendar days)
// ---------------------------------------------------------------------------------------------

const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
export const addDays = (d: string, n: number) => new Date(ms(d) + n * 86_400_000).toISOString().slice(0, 10);
/** 0 Monday … 6 Sunday. */
export const weekday = (d: string) => (new Date(ms(d)).getUTCDay() + 6) % 7;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const showDate = (d: string) =>
  isDate(d)
    ? new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(ms(d)))
    : "";

/** How many times each weekday falls from `start` for `weeks` weeks (start inclusive), so a mid-week start counts the real visits. */
export function visitsIn(start: string, weeks: number, days: number[]): number {
  if (!isDate(start) || weeks <= 0) return 0;
  let n = 0;
  for (let i = 0; i < weeks * 7; i++) if (days.includes(weekday(addDays(start, i)))) n++;
  return n;
}
