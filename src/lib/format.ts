// Fixed locale and zone so server and browser render identical text (no hydration mismatch).
const LOCALE = "en-AU";
const ZONE = "Australia/Sydney";

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: ZONE }).format(
    new Date(iso.length === 10 ? `${iso}T00:00:00+11:00` : iso),
  );
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
export const spacedWhen = (days: number) => (days < 7 ? `day ${days}` : days < 28 ? `week ${Math.round(days / 7)}` : days < 84 ? `month ${Math.round(days / 30)}` : `week ${Math.round(days / 7)}`);

/** Running totals of step gaps, so each step knows its day from the start. */
export const cumulative = (gaps: number[]) => gaps.map((_, i) => gaps.slice(0, i + 1).reduce((a, b) => a + b, 0));
