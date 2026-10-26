/*
  The single scheduling function for learning paths. It is used by the builder's date
  preview, by enrolment creation and by the background worker, so all three agree.

  Date arithmetic happens on local calendar dates in the learner's IANA timezone; the
  results are UTC instants. "Calendar days" means local dates, not multiples of 24 hours.
  Public holidays are not excluded in this release.
*/

export type DeliveryMode = "scheduled" | "after_completion";
export type GapUnit = "calendar" | "weekdays";

export type ScheduleConfig = {
  mode: DeliveryMode;
  unit: GapUnit;
  deliveryDays: "weekdays" | "every";
  /** Preferred local send time, "HH:MM". */
  sendTime: string;
  /** Permitted delivery window, local "HH:MM" start inclusive, end exclusive. */
  window: { start: string; end: string };
  timezone: string;
};

export type PlainDate = { y: number; m: number; d: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function localParts(instant: Date, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(instant).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

export function localDate(instant: Date, tz: string): PlainDate {
  const { y, m, d } = localParts(instant, tz);
  return { y, m, d };
}

/** The UTC instant for a local wall-clock time, correct across daylight saving changes. */
export function zonedToUtc(date: PlainDate, time: string, tz: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  const wanted = Date.UTC(date.y, date.m - 1, date.d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - wanted;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

export function addDays(date: PlainDate, n: number): PlainDate {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export const dayOfWeek = (date: PlainDate) => new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
export const isWeekend = (date: PlainDate) => dayOfWeek(date) === 0 || dayOfWeek(date) === 6;

/** Counts Monday to Friday after the given date. */
export function addWeekdays(date: PlainDate, n: number): PlainDate {
  let cur = date;
  let counted = 0;
  while (counted < n) {
    cur = addDays(cur, 1);
    if (!isWeekend(cur)) counted++;
  }
  return cur;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const permittedDay = (date: PlainDate, cfg: ScheduleConfig) => cfg.deliveryDays === "every" || !isWeekend(date);

/** Earliest instant at or after `from` that falls on a permitted day inside the delivery window. */
export function nextPermittedSlot(from: Date, cfg: ScheduleConfig): Date {
  const lp = localParts(from, cfg.timezone);
  let date: PlainDate = { y: lp.y, m: lp.m, d: lp.d };
  const now = lp.h * 60 + lp.min;
  if (permittedDay(date, cfg)) {
    if (now >= toMinutes(cfg.window.start) && now < toMinutes(cfg.window.end)) return from;
    if (now < toMinutes(cfg.window.start)) return zonedToUtc(date, cfg.window.start, cfg.timezone);
  }
  do date = addDays(date, 1);
  while (!permittedDay(date, cfg));
  return zonedToUtc(date, cfg.window.start, cfg.timezone);
}

const dateLabel = (date: PlainDate) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(date.y, date.m - 1, date.d)),
  );

export function formatLocal(instant: Date, tz: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(instant);
}

export type Release = { at: Date; notes: string[] };

/** One gap: the release that follows `from` after `gap` units. */
export function releaseAfter(from: Date, gap: number, cfg: ScheduleConfig): Release {
  const notes: string[] = [];
  if (gap === 0) {
    const at = nextPermittedSlot(from, cfg);
    notes.push(at.getTime() === from.getTime() ? "No wait: available at the next worker run" : "No wait: available at the next delivery window");
    return { at, notes };
  }
  const base = localDate(from, cfg.timezone);
  let target = cfg.unit === "calendar" ? addDays(base, gap) : addWeekdays(base, gap);
  if (!permittedDay(target, cfg)) {
    const original = target;
    do target = addDays(target, 1);
    while (!permittedDay(target, cfg));
    notes.push(`Moved from ${dateLabel(original)} to ${dateLabel(target)} because delivery is weekdays only`);
  }
  let at = zonedToUtc(target, cfg.sendTime, cfg.timezone);
  if (at < from) at = nextPermittedSlot(from, cfg);
  return { at, notes };
}

export type ProjectedStep = {
  index: number;
  gap: number;
  status: "planned" | "estimated" | "waiting";
  at: Date | null;
  explanation: string;
};

const unitLabel = (unit: GapUnit, n: number) => `${n} ${unit === "calendar" ? "calendar day" : "weekday"}${n === 1 ? "" : "s"}`;

/**
  Projects release instants for every step.
  - scheduled: each release follows the previous effective planned release (after weekend moves).
  - after_completion: each release follows the previous step's confirmed completion. Without
    one, the step is waiting, or (with `estimate`) assumes the previous step finished on release.
*/
export function projectSchedule(input: {
  cfg: ScheduleConfig;
  anchor: Date;
  anchorLabel: string;
  gaps: number[];
  completions?: (Date | null | undefined)[];
  estimate?: boolean;
}): ProjectedStep[] {
  const { cfg, anchor, anchorLabel, gaps, completions = [], estimate = false } = input;
  const out: ProjectedStep[] = [];
  let prev: Date | null = anchor;
  let estimated = false;

  gaps.forEach((gap, i) => {
    if (i > 0 && cfg.mode === "after_completion") {
      const done = completions[i - 1];
      if (done) {
        prev = done;
      } else if (!estimate || !prev) {
        out.push({ index: i, gap, status: "waiting", at: null, explanation: "Waiting for the previous activity" });
        prev = null;
        return;
      } else {
        estimated = true;
      }
    }
    if (!prev) {
      out.push({ index: i, gap, status: "waiting", at: null, explanation: "Waiting for the previous activity" });
      return;
    }
    const r = releaseAfter(prev, gap, cfg);
    const after =
      i === 0
        ? anchorLabel
        : cfg.mode === "scheduled"
          ? "the previous activity was released"
          : estimated && !completions[i - 1]
            ? "the previous activity is completed (estimate assumes it is finished on release)"
            : "the previous activity was completed";
    const lead = gap === 0 ? `Straight after ${after}` : `${unitLabel(cfg.unit, gap)} after ${after}`;
    out.push({
      index: i,
      gap,
      status: estimated ? "estimated" : "planned",
      at: r.at,
      explanation: [`${lead}: ${formatLocal(r.at, cfg.timezone)}`, ...r.notes].join(". "),
    });
    prev = r.at;
  });
  return out;
}

/** Reminder slot: two permitted weekdays after the release date, at the send time. */
export function reminderAt(release: Date, cfg: ScheduleConfig): Date {
  const target = addWeekdays(localDate(release, cfg.timezone), 2);
  return zonedToUtc(target, cfg.sendTime, cfg.timezone);
}

export function validateSchedule(cfg: ScheduleConfig, gaps: number[]): string[] {
  const errors: string[] = [];
  const t = /^([01]\d|2[0-3]):[0-5]\d$/;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: cfg.timezone });
  } catch {
    errors.push(`Unknown timezone “${cfg.timezone}”`);
  }
  if (![cfg.sendTime, cfg.window.start, cfg.window.end].every((x) => t.test(x))) errors.push("Times must use HH:MM");
  else {
    if (toMinutes(cfg.window.start) >= toMinutes(cfg.window.end)) errors.push("The delivery window must end after it starts");
    if (toMinutes(cfg.sendTime) < toMinutes(cfg.window.start) || toMinutes(cfg.sendTime) >= toMinutes(cfg.window.end))
      errors.push("The send time must fall inside the delivery window");
  }
  if (!gaps.length) errors.push("Add at least one activity");
  if (gaps.some((g) => !Number.isInteger(g) || g < 0 || g > 365)) errors.push("Each wait must be a whole number from 0 to 365");
  return errors;
}
