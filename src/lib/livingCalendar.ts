import { cleanId, type LivesSettings } from "./livesInProgress";

/*
  The Living Calendar (Community → Living Calendar, docs/lives-in-progress.md): the Digital Members' lives by the day.
  It's a view over Lives in Progress, not a separate store: Life Moments (on the day they happen), episodes (on the day
  they're out), and recurring routines from the Character Bible. Shared by the server and the browser: routines and
  their dates, calendar days in a time zone, and the editorial balance.
*/

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export type RoutineFreq = "weekly" | "fortnightly" | "monthly" | "annual";
export type Routine = {
  id: string;
  memberId: string;
  title: string;
  /** A line about it, from the Bible: what it is, not how any one occasion went. */
  about: string;
  category: string;
  alsoMembers: string[];
  freq: RoutineFreq;
  /** 0 = Monday. Weekly and fortnightly: the days; monthly by weekday: the one day. */
  weekdays: number[];
  /** Monthly: which of that weekday in the month (1 to 4, or -1 for the last); 0 means by date (`dayOfMonth`). */
  nth: number;
  dayOfMonth: number;
  /** Annual: month (1 to 12) and day. */
  month: number;
  day: number;
  time: string;
  /** YYYY-MM-DD. A fortnightly routine counts its weeks from `start`. */
  start: string;
  end: string;
  /** Days it doesn't happen (an exception or a cancellation), YYYY-MM-DD. */
  skips: string[];
  /** Spells it stops for, with why: "While her hip heals". */
  pauses: { from: string; to: string; reason: string }[];
  /** For authors: where it comes from in the Bible. */
  source: string;
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function cleanRoutine(raw: unknown): Routine {
  const o = obj(raw);
  const freq: RoutineFreq = o.freq === "fortnightly" || o.freq === "monthly" || o.freq === "annual" ? o.freq : "weekly";
  return {
    id: cleanId(o.id),
    memberId: cleanId(o.memberId),
    title: str(o.title, 100),
    about: str(o.about, 300),
    category: typeof o.category === "string" && /^(x-)?[a-z_-]{2,40}$/.test(o.category) ? o.category : "everyday",
    alsoMembers: (Array.isArray(o.alsoMembers) ? o.alsoMembers : []).map(cleanId).filter(Boolean).slice(0, 6),
    freq,
    weekdays: [...new Set((Array.isArray(o.weekdays) ? o.weekdays : []).map((d) => int(d, 0, 6, 0)))].sort().slice(0, 7),
    nth: [1, 2, 3, 4, -1].includes(Number(o.nth)) ? Number(o.nth) : 0,
    dayOfMonth: int(o.dayOfMonth, 0, 31, 0),
    month: int(o.month, 0, 12, 0),
    day: int(o.day, 0, 31, 0),
    time: typeof o.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : "",
    start: day(o.start),
    end: day(o.end),
    skips: (Array.isArray(o.skips) ? o.skips : []).map(day).filter(Boolean).slice(0, 60),
    pauses: (Array.isArray(o.pauses) ? o.pauses : [])
      .map((p) => ({ from: day(obj(p).from), to: day(obj(p).to), reason: str(obj(p).reason, 140) }))
      .filter((p) => p.from && p.to && p.from <= p.to)
      .slice(0, 12),
    source: str(o.source, 300),
  };
}

/** What a routine needs before it's approved. */
export function routineProblems(r: Routine): string[] {
  const out: string[] = [];
  if (!r.title) out.push("Give the routine a name.");
  if (!r.start) out.push("Say when it starts.");
  if ((r.freq === "weekly" || r.freq === "fortnightly") && !r.weekdays.length) out.push("Choose the day or days of the week.");
  if (r.freq === "monthly" && !r.dayOfMonth && !(r.nth && r.weekdays.length)) out.push("Choose a date in the month, or which weekday (the second Friday).");
  if (r.freq === "annual" && !(r.month && r.day)) out.push("Choose the day and month.");
  if (!r.source) out.push("Say where it comes from in the Character Bible.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Calendar days, without time zones getting in the way
// ---------------------------------------------------------------------------------------------

/** "2026-11-25" as a day number (days since 1970), and back. Pure date arithmetic, in UTC. */
export const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
export const dayString = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
/** 0 = Monday. */
export const weekdayOf = (d: string) => (new Date(dayNumber(d) * 86_400_000).getUTCDay() + 6) % 7;

/** The calendar day a moment falls on, in the reader's time zone. */
export function localDay(isoDate: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(isoDate));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** The time of day in the reader's time zone, "14:30". */
export function localTime(isoDate: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(isoDate));
}

/** A month's grid, Monday first: from the Monday on or before the 1st to the Sunday on or after the last day. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = dayString(Date.UTC(y, m, 0) / 86_400_000);
  const from = dayNumber(first) - weekdayOf(first);
  const to = dayNumber(last) + (6 - weekdayOf(last));
  return { first, last, days: Array.from({ length: to - from + 1 }, (_, i) => dayString(from + i)) };
}
export const cleanMonth = (v: unknown, fallback: string) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : fallback);
export const shiftMonth = (month: string, by: number) => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + by;
  return `${y + Math.floor(m / 12)}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
};

/**
  The days a routine falls on between two dates (inclusive), leaving out its skips and pauses. These are when it
  usually happens: a past one isn't something that "happened" unless an approved moment says so.
*/
export function routineDates(r: Routine, from: string, to: string): string[] {
  if (!r.start) return [];
  const lo = Math.max(dayNumber(from), dayNumber(r.start));
  const hi = Math.min(dayNumber(to), r.end ? dayNumber(r.end) : Infinity);
  const out: string[] = [];
  const startWeek = Math.floor((dayNumber(r.start) - weekdayOf(r.start)) / 7);
  for (let n = lo; n <= hi; n++) {
    const d = dayString(n);
    const wd = weekdayOf(d);
    const dom = Number(d.slice(8, 10));
    const mon = Number(d.slice(5, 7));
    let hit = false;
    if (r.freq === "weekly") hit = r.weekdays.includes(wd);
    else if (r.freq === "fortnightly") hit = r.weekdays.includes(wd) && (Math.floor((n - wd) / 7) - startWeek) % 2 === 0;
    else if (r.freq === "monthly") {
      if (r.nth && r.weekdays.length) {
        const daysInMonth = new Date(Date.UTC(Number(d.slice(0, 4)), mon, 0)).getUTCDate();
        hit = wd === r.weekdays[0] && (r.nth === -1 ? dom + 7 > daysInMonth : Math.ceil(dom / 7) === r.nth);
      } else hit = dom === r.dayOfMonth;
    } else hit = mon === r.month && dom === r.day;
    if (!hit || r.skips.includes(d) || r.pauses.some((p) => d >= p.from && d <= p.to)) continue;
    out.push(d);
  }
  return out;
}

/** "Every Sunday", "Every second Thursday", "The second Friday of each month", "Every year on 14 January". */
export function routineWhen(r: Routine) {
  const days = r.weekdays.map((d) => WEEKDAYS[d]);
  const list = days.length <= 1 ? (days[0] ?? "") : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
  const at = r.time ? ` at ${formatTime(r.time)}` : "";
  if (r.freq === "weekly") return `Every ${list}${at}`;
  if (r.freq === "fortnightly") return `Every second ${list}${at}`;
  if (r.freq === "monthly")
    return r.nth
      ? `The ${["", "first", "second", "third", "fourth"][r.nth] ?? "last"} ${days[0] ?? ""} of each month${at}`
      : `The ${r.dayOfMonth}${ordinal(r.dayOfMonth)} of each month${at}`;
  const monthName = new Date(Date.UTC(2026, Math.max(0, r.month - 1), 1)).toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" });
  return `Every year on ${r.day} ${monthName}${at}`;
}
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th"));
/** "14:30" → "2:30 pm". */
export const formatTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};

// ---------------------------------------------------------------------------------------------
// Editorial balance
// ---------------------------------------------------------------------------------------------

export const BALANCE_BUCKETS = {
  everyday: { label: "Everyday life and routines", categories: ["everyday", "checking_in", "seasonal", "hobby", "quiet", "voice"] },
  social: { label: "Relationships and social life", categories: ["family", "community", "upcoming"] },
  celebration: { label: "Achievements and celebrations", categories: ["celebration", "good_news", "milestone"] },
  story: { label: "Story developments and reflections", categories: ["new_chapter", "follow_up", "reflection", "think"] },
  care: { label: "Care-related", categories: ["changing", "appointment"] },
} as const;
export type BalanceBucket = keyof typeof BALANCE_BUCKETS;
export const bucketOf = (category: string): BalanceBucket =>
  (Object.keys(BALANCE_BUCKETS) as BalanceBucket[]).find((b) => (BALANCE_BUCKETS[b].categories as readonly string[]).includes(category)) ?? "everyday";

/** The share of each bucket in a set of categories, against the target, in whole per cent. */
export function balanceOf(categories: string[], target: LivesSettings["balance"]) {
  const total = categories.length || 1;
  return (Object.keys(BALANCE_BUCKETS) as BalanceBucket[]).map((b) => ({
    bucket: b,
    label: BALANCE_BUCKETS[b].label,
    share: Math.round((categories.filter((c) => bucketOf(c) === b).length / total) * 100),
    target: target[b],
  }));
}

/** A subtle, steady colour per member (always beside their portrait and name, never on its own). */
export const MEMBER_HUES = ["#0e7c7b", "#b4570f", "#5a4fcf", "#a1306b", "#2f6fb0", "#6b7d10", "#8a5a00", "#3a7d44"] as const;

// ---------------------------------------------------------------------------------------------
// A little serendipity: spreading proposed moments over days and times
// ---------------------------------------------------------------------------------------------

/** When in the day each kind of moment tends to happen, as [from, to] hours. */
export const TIME_WINDOWS: Record<string, [number, number]> = {
  celebration: [8, 10],
  milestone: [8, 10],
  good_news: [9, 11],
  seasonal: [7, 9],
  appointment: [9, 11],
  upcoming: [9, 11],
  new_chapter: [9, 12],
  follow_up: [10, 13],
  changing: [10, 12],
  everyday: [10, 16],
  hobby: [10, 15],
  community: [10, 14],
  family: [11, 14],
  voice: [15, 19],
  checking_in: [16, 18],
  think: [17, 19],
  reflection: [18, 20],
  quiet: [18, 20],
};
/** Story developments land midweek, not at the weekend. */
const WEEKDAYS_ONLY = new Set(["new_chapter", "follow_up", "think"]);

/** A small seeded random number generator: the same seed gives the same schedule, so it's testable and steady. */
export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
  Gives each proposed moment a day and a time, so the calendar feels lived in rather than mechanical: some days have
  three moments, some one, some none (about `quietDays`% of them); nobody appears on two days running unless the
  settings allow it; story developments fall on weekdays; birthdays come in the morning and reflections in the
  evening. Deterministic for the same seed. Moments that can't be placed under the rules are left out, and counted.
*/
export function spreadSchedule<T extends { memberId: string; category: string }>(
  items: T[],
  opts: { from: string; days: number; seed: string; variety: { maxPerDay: number; quietDays: number; consecutive: boolean } },
): { placed: (T & { date: string; time: string })[]; dropped: number } {
  const rand = seededRandom(`${opts.seed}|${opts.from}|${opts.days}`);
  const start = dayNumber(opts.from);
  const max = Math.max(1, opts.variety.maxPerDay);
  const capacity = Array.from({ length: opts.days }, () => (rand() * 100 < opts.variety.quietDays ? 0 : 1 + Math.floor(rand() * max)));
  const busy = Array.from({ length: opts.days }, () => new Set<string>());
  const order = items.map((item, i) => ({ item, i, r: rand() })).sort((a, b) => a.r - b.r);
  const placed: (T & { date: string; time: string })[] = [];
  let dropped = 0;
  for (const { item } of order) {
    const days = Array.from({ length: opts.days }, (_, d) => ({ d, r: rand() })).sort((a, b) => a.r - b.r);
    const fits = (d: number, strict: boolean) =>
      capacity[d] > busy[d].size &&
      !busy[d].has(item.memberId) &&
      (!strict || opts.variety.consecutive || (!busy[d - 1]?.has(item.memberId) && !busy[d + 1]?.has(item.memberId))) &&
      (!strict || !WEEKDAYS_ONLY.has(item.category) || weekdayOf(dayString(start + d)) < 5);
    const pick = days.find(({ d }) => fits(d, true)) ?? null;
    if (!pick) {
      dropped++;
      continue;
    }
    busy[pick.d].add(item.memberId);
    const [a, b] = TIME_WINDOWS[item.category] ?? TIME_WINDOWS.everyday;
    const hour = a + Math.floor(rand() * (b - a + 1));
    const minute = [0, 15, 30, 45][Math.floor(rand() * 4)];
    placed.push({ ...item, date: dayString(start + pick.d), time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` });
  }
  placed.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  return { placed, dropped };
}
