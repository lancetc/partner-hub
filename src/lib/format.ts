// Fixed locale and zone so server and browser render identical text (no hydration mismatch).
const LOCALE = "en-AU";
const ZONE = "Australia/Sydney";

export function formatDate(iso: string) {
  // A calendar date (2026-10-01) is the same day everywhere: format it as that day, not as a moment in Sydney time,
  // which put dates a day early outside daylight saving.
  if (iso.length === 10)
    return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: ZONE }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ZONE,
  }).format(new Date(iso));
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

export function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** "week 2", "month 2", "week 14": when a spaced follow up arrives, counted from the lesson. */
export const spacedWhen = (days: number) =>
  days < 7 ? `day ${days}` : days < 28 ? `week ${Math.round(days / 7)}` : days < 84 ? `month ${Math.round(days / 30)}` : `week ${Math.round(days / 7)}`;

/** Running totals of step gaps, so each step knows its day from the start. */
export const cumulative = (gaps: number[]) => gaps.map((_, i) => gaps.slice(0, i + 1).reduce((a, b) => a + b, 0));

/** A total time in short form for tiles and lists: "28 min", "2 hr", "5 hr 50 min". */
export function formatHoursMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/**
  A length of time people can picture: "8 minutes", "About 1 hour", "About 6½ hours".
  Under an hour stays in minutes; longer rounds to the nearest half hour.
*/
export function formatDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 55) return `${m} ${m === 1 ? "minute" : "minutes"}`;
  const halves = Math.round(m / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  const text = `${whole || ""}${half ? "½" : ""}`;
  return `About ${text} ${halves === 2 ? "hour" : "hours"}`;
}
