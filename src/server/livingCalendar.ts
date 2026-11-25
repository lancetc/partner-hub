import "server-only";
import { randomUUID } from "node:crypto";
import { categoryOf, MOMENT_CATEGORIES } from "@/lib/lifeMoments";
import {
  balanceOf,
  cleanMonth,
  cleanRoutine,
  dayNumber,
  dayString,
  localDay,
  localTime,
  MEMBER_HUES,
  monthGrid,
  routineDates,
  routineProblems,
  routineWhen,
  shiftMonth,
  type Routine,
} from "@/lib/livingCalendar";
import { cleanId, DEFAULT_FOCUS, episodeLabel, isOut, pronounsFor, storyOrder } from "@/lib/livesInProgress";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { CALENDAR_MOMENTS, DEMO_PAUSES, DEMO_ROUTINES } from "@/content/livingCalendar";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import {
  approvedBible,
  episodeOf,
  hearable,
  livesDemoEnabled,
  livesSettings,
  logActivity,
  memberVisible,
  publishDueEpisodes,
  type EpisodeRow,
} from "./livesInProgress";
import { ensureMoments, momentOf, seedDemoMoments, type FeedChat } from "./lifeMoments";

/*
  The Living Calendar (Community → Living Calendar, docs/lives-in-progress.md): the Digital Members' lives by the day.
  A view over Lives in Progress, not a store of its own:
  - Life Moments, on the day they happen (their fictional date), once they're shared;
  - a moment still to come, shown ahead only by its teaser, if an author chose to ("Mrs Alvarez turns 83");
  - episodes on the day they came out, and "a new chapter" on the day one is due, without its title;
  - routines from the Character Bible ("Isabel visits every Sunday"), as their usual days. A past one is only ever
    "usually", never something that happened, unless a shared moment says so (and then that moment shows instead).

  Everything a learner gets is decided here, on the server: nothing unpublished beyond an approved teaser.
*/

type RoutineRow = { id: string; member_id: string; data: string; status: "draft" | "approved" | "archived"; sample: number; updated_at: string };
export const routineOf = (r: RoutineRow) => ({
  ...cleanRoutine(JSON.parse(r.data)),
  id: r.id,
  memberId: r.member_id,
  status: r.status,
  sample: Boolean(r.sample),
});

// ---------------------------------------------------------------------------------------------
// Tables and the demo
// ---------------------------------------------------------------------------------------------

const started = new WeakSet<object>();
export function ensureCalendar(db: Db, now: Date) {
  ensureMoments(db, now);
  if (started.has(db)) return;
  started.add(db);
  if (livesDemoEnabled()) seedCalendarDemo(db, now);
}

/** The demo routines and calendar moments, once, dated from each arc's current episode. */
export function seedCalendarDemo(db: Db, now: Date) {
  ensureMoments(db, now);
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'lives_calendar_seed'").get()) {
    const anchor = (arc: string) =>
      (
        db.prepare("SELECT publish_at FROM lip_episodes WHERE arc_id = ? AND status = 'published' ORDER BY number DESC LIMIT 1").get(arc) as
          { publish_at: string } | undefined
      )?.publish_at;
    if (DEMO_ROUTINES.some((r) => !anchor(r.arc))) return;
    const at = now.toISOString();
    const dayFrom = (arc: string, n: number) => dayString(dayNumber(anchor(arc)!.slice(0, 10)) + n);
    tx(db, () => {
      for (const r of DEMO_ROUTINES) {
        const { arc, startDay, ...rest } = r;
        const routine = cleanRoutine({
          ...rest,
          start: dayFrom(arc, startDay),
          pauses: (DEMO_PAUSES[r.id] ?? []).map((p) => ({ from: dayFrom(p.arc, p.fromDay), to: dayFrom(p.arc, p.toDay), reason: p.reason })),
        });
        db.prepare(
          "INSERT OR IGNORE INTO lip_routines (id, member_id, data, status, approved_by, approved_at, sample, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, 'approved', 'seed', ?, 1, 'seed', ?, 'seed', ?)",
        ).run(r.id, r.memberId, JSON.stringify({ ...routine, id: r.id }), at, at, at);
      }
      db.prepare("INSERT INTO settings (key, value) VALUES ('lives_calendar_seed', '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run();
    });
  }
  seedDemoMoments(db, now, CALENDAR_MOMENTS, "lives_calendar_moments_seed");
}

// ---------------------------------------------------------------------------------------------
// The month, for a reader
// ---------------------------------------------------------------------------------------------

export type CalendarPerson = { id: string; name: string; first: string; possessive: string; portrait: string; focus: string; colour: string };
export type CalendarEntry = {
  id: string;
  /** moment: shared. ahead: still to come, its teaser only. episode: out. chapter: an episode due, untitled. routine: a usual day. */
  kind: "moment" | "ahead" | "episode" | "chapter" | "routine";
  date: string;
  time: string;
  tense: "past" | "today" | "upcoming";
  people: CalendarPerson[];
  category: string;
  categoryLabel: string;
  icon: string;
  title: string;
  narrative: string;
  quote: string;
  transcript: string;
  audio: { src: string; seconds: number; scriptHash: string; voice: string; at: string } | null;
  image: { src: string; focus: string };
  episodeId: string;
  action: "story" | "chat" | "none";
  actionLabel: string;
  opener: string;
  unread: boolean;
  /** routine: "Every Sunday at 12 pm". */
  routine: string;
};

const firstName = (name: string) => (/^(mr|mrs|ms)\b/i.test(name) ? name : name.split(" ")[0]);

/**
  One month of the Living Calendar for one reader, in their time zone. `members`: only these people (an event shared
  with one of them counts); `following`: only people they follow.
*/
export function livingCalendar(db: Db, user: User, now: Date, input: { month?: unknown; members?: unknown; following?: unknown } = {}) {
  ensureCalendar(db, now);
  publishDueEpisodes(db, now);
  const tz = user.timezone || "Australia/Sydney";
  const today = localDay(now.toISOString(), tz);
  const month = cleanMonth(input.month, today.slice(0, 7));
  const grid = monthGrid(month);
  const from = grid.days[0];
  const to = grid.days.at(-1)!;
  const nowMs = now.getTime();

  const chars = new Map(
    (db.prepare("SELECT id, name, portrait, hidden FROM characters").all() as { id: string; name: string; portrait: string; hidden: number }[]).map((c) => [
      c.id,
      c,
    ]),
  );
  const people = new Map<string, CalendarPerson>();
  DIGITAL_MEMBERS.forEach((m, i) => {
    const c = chars.get(m.id);
    if (!c || c.hidden) return;
    const b = approvedBible(db, m.id);
    people.set(m.id, {
      id: m.id,
      name: c.name,
      first: firstName(c.name),
      possessive: pronounsFor(b?.identity.pronouns ?? "", c.name).possessive,
      portrait: c.portrait,
      focus: b?.media.focus || DEFAULT_FOCUS,
      colour: MEMBER_HUES[i % MEMBER_HUES.length],
    });
  });
  const follows = new Set((db.prepare("SELECT member_id FROM lip_follows WHERE user_id = ?").all(user.id) as { member_id: string }[]).map((r) => r.member_id));
  const asked = (typeof input.members === "string" ? input.members.split(",") : Array.isArray(input.members) ? input.members : [])
    .map(cleanId)
    .filter((id) => people.has(id));
  const only = input.following === true || input.following === "1" ? follows : asked.length ? new Set(asked) : null;
  const included = (ids: string[]) => ids.some((id) => people.has(id)) && (!only || ids.some((id) => only.has(id)));
  const who = (ids: string[]) => ids.map((id) => people.get(id)).filter((p): p is CalendarPerson => Boolean(p));
  const tense = (d: string): CalendarEntry["tense"] => (d < today ? "past" : d === today ? "today" : "upcoming");
  const inRange = (d: string) => d >= from && d <= to;

  const seenMoments = new Set(
    (db.prepare("SELECT moment_id FROM lip_moment_views WHERE user_id = ?").all(user.id) as { moment_id: string }[]).map((r) => r.moment_id),
  );
  const seenEpisodes = new Set(
    (db.prepare("SELECT episode_id FROM lip_views WHERE user_id = ?").all(user.id) as { episode_id: string }[]).map((r) => r.episode_id),
  );
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE status IN ('published','scheduled')").all() as EpisodeRow[]).map(episodeOf);
  const outEpisodes = episodes.filter((e) => isOut(e, now));
  const settings = livesSettings(db);
  const entries: CalendarEntry[] = [];
  const base = (ids: string[], category: string) => {
    const cat = categoryOf(category, settings);
    const p = who(ids);
    return { people: p, category: cat.id, categoryLabel: cat.label, icon: cat.icon, image: { src: p[0]?.portrait ?? "", focus: p[0]?.focus ?? DEFAULT_FOCUS } };
  };

  // Life Moments: shared ones on the day they happen; ones still to come only as an approved teaser.
  const moments = (db.prepare("SELECT * FROM lip_moments WHERE status IN ('published','approved','scheduled')").all() as Parameters<typeof momentOf>[0][]).map(
    momentOf,
  );
  const happened = new Map<string, Set<string>>();
  for (const m of moments) {
    const ids = [m.memberId, ...m.alsoMembers];
    if (!memberVisible(db, m.memberId) || !included(ids)) continue;
    const isShared =
      m.status === "published" && Boolean(m.publishAt) && Date.parse(m.publishAt) <= nowMs && (!m.episodeId || outEpisodes.some((e) => e.id === m.episodeId));
    const when = m.eventAt || m.publishAt;
    if (!when) continue;
    const date = localDay(when, tz);
    if (isShared) {
      if (m.routineId) happened.set(`${m.routineId}|${date}`, new Set());
      if (!inRange(date)) continue;
      const lead = people.get(m.memberId);
      const audio = m.audio?.checked && m.audio.scriptHash ? m.audio : null;
      entries.push({
        ...base(ids, m.category),
        id: m.id,
        kind: "moment",
        date,
        time: m.time,
        tense: tense(date),
        title: m.headline,
        narrative: m.body,
        quote: m.quote,
        transcript: m.audioScript,
        audio:
          audio && audio.scriptHash.length
            ? { src: audio.src, seconds: audio.seconds, scriptHash: audio.scriptHash, voice: audio.voiceName, at: audio.at }
            : null,
        ...(m.image && !m.placeholder ? { image: { src: m.image, focus: m.focus || DEFAULT_FOCUS } } : {}),
        episodeId: m.episodeId,
        action: m.action,
        actionLabel: m.actionLabel || (m.action === "chat" ? `Talk with ${lead?.first ?? ""}` : `Catch up with ${lead?.first ?? ""}`),
        opener: m.opener,
        unread: !seenMoments.has(m.id),
        routine: "",
      });
    } else if (
      m.showAhead &&
      m.teaser &&
      m.eventAt &&
      Date.parse(m.eventAt) > nowMs &&
      (m.status === "approved" || m.status === "scheduled") &&
      inRange(date)
    ) {
      // Coming up: the teaser and the time, and nothing about how it goes.
      entries.push({
        ...base(ids, m.category),
        id: `ahead:${m.id}`,
        kind: "ahead",
        date,
        time: m.time,
        tense: "upcoming",
        title: m.teaser,
        narrative: "",
        quote: "",
        transcript: "",
        audio: null,
        episodeId: "",
        action: "story",
        actionLabel: `Catch up with ${people.get(m.memberId)?.first ?? ""}`,
        opener: "",
        unread: false,
        routine: "",
      });
    }
  }
  // A shared moment's audio, checked against its current script (as on the homepage).
  for (const e of entries) {
    const m = e.kind === "moment" ? moments.find((x) => x.id === e.id) : null;
    if (m && e.audio && !(m.audio?.checked && m.audio.scriptHash === hashOf(m.audio.voice, m.audioScript))) e.audio = null;
  }

  // Episodes: out on the day they came out; due ones as "a new chapter", without a title.
  for (const e of episodes) {
    if (!included([e.memberId])) continue;
    const date = localDay(e.publishAt, tz);
    if (!inRange(date)) continue;
    const p = people.get(e.memberId);
    if (isOut(e, now)) {
      const audio = hearable(e);
      entries.push({
        ...base([e.memberId], "new_chapter"),
        id: `ep:${e.id}`,
        kind: "episode",
        date,
        time: localTime(e.publishAt, tz),
        tense: tense(date),
        title: `${episodeLabel(e.number)}: ${e.title}`,
        narrative: e.story,
        quote: e.quote,
        transcript: e.diary,
        audio: audio ? { src: audio.src, seconds: audio.seconds, scriptHash: audio.scriptHash, voice: audio.voiceName, at: audio.at } : null,
        episodeId: e.id,
        action: "story",
        actionLabel: `Continue ${p?.possessive ?? "their"} story`,
        opener: "",
        unread: !seenEpisodes.has(e.id),
        routine: "",
      });
    } else if (e.status === "scheduled") {
      entries.push({
        ...base([e.memberId], "new_chapter"),
        id: `chapter:${e.id}`,
        kind: "chapter",
        date,
        time: "",
        tense: "upcoming",
        title: `A new chapter in ${p?.name ?? "their"}’s story`,
        narrative: "",
        quote: "",
        transcript: "",
        audio: null,
        episodeId: "",
        action: "none",
        actionLabel: "",
        opener: "",
        unread: false,
        routine: "",
      });
    }
  }

  // Routines: their usual days. A shared moment from that routine on that day takes its place.
  const routines = (db.prepare("SELECT * FROM lip_routines WHERE status = 'approved'").all() as RoutineRow[]).map(routineOf);
  for (const r of routines) {
    const ids = [r.memberId, ...r.alsoMembers];
    if (!memberVisible(db, r.memberId) || !included(ids)) continue;
    for (const date of routineDates(r, from, to)) {
      if (happened.has(`${r.id}|${date}`)) continue;
      entries.push({
        ...base(ids, r.category),
        id: `routine:${r.id}:${date}`,
        kind: "routine",
        date,
        time: r.time,
        tense: tense(date),
        title: r.title,
        narrative: r.about,
        quote: "",
        transcript: "",
        audio: null,
        episodeId: "",
        action: "none",
        actionLabel: "",
        opener: "",
        unread: false,
        routine: routineWhen(r),
      });
    }
  }

  const order = { episode: 0, moment: 1, ahead: 2, chapter: 3, routine: 4 } as const;
  entries.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.time || "99").localeCompare(b.time || "99"));

  // For the chat buttons: each person's latest episode, and whether they remember this reader.
  const remembered = new Set(
    (
      db.prepare("SELECT DISTINCT member_id FROM lip_memories WHERE user_id = ? AND expires_at > ?").all(user.id, now.toISOString()) as { member_id: string }[]
    ).map((r) => r.member_id),
  );
  const chat: Record<string, FeedChat> = {};
  for (const id of people.keys()) {
    const latest = storyOrder(outEpisodes.filter((e) => e.memberId === id)).at(-1);
    if (latest)
      chat[id] = { episodeId: latest.id, number: latest.number, title: latest.title, remembered: remembered.has(id) ? 1 : 0, memory: settings.memory };
  }
  const active = new Set([
    ...moments.flatMap((m) => [m.memberId, ...m.alsoMembers]),
    ...episodes.map((e) => e.memberId),
    ...routines.flatMap((r) => [r.memberId, ...r.alsoMembers]),
  ]);
  return {
    month,
    today,
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    days: grid.days.map((date) => ({ date, inMonth: date.slice(0, 7) === month, entries: entries.filter((e) => e.date === date) })),
    members: [...people.values()].filter((p) => active.has(p.id)).map((p) => ({ ...p, following: follows.has(p.id) })),
    chat,
  };
}
export type LivingCalendarView = ReturnType<typeof livingCalendar>;

import { textHash } from "@/lib/magazineNarration";
const hashOf = (voice: string, script: string) => textHash(`${voice}|${script}`);

/** What a reader did with the calendar, for the report: a visit, a day explored, a filter, an event opened. */
export function calendarActivity(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureCalendar(db, now);
  const kinds = { visit: "calendar_visit", day: "calendar_day", filter: "calendar_filter", event: "calendar_event" } as const;
  const kind = kinds[String(input.kind) as keyof typeof kinds];
  if (!kind) throw new HttpError(400, "That isn’t something we record.");
  const memberId = cleanId(input.memberId);
  logActivity(db, user, memberId && memberVisible(db, memberId) ? memberId : "", null, kind, String(input.detail ?? "").slice(0, 120), now);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// For authors: the month, routines and the review
// ---------------------------------------------------------------------------------------------

/** The admin month: every moment that isn't archived (any state), episodes, routines and their days, and the review. */
export function calendarAdmin(db: Db, actor: User, now: Date, monthRaw: unknown) {
  requireAuthor(actor);
  ensureCalendar(db, now);
  const tz = actor.timezone || "Australia/Sydney";
  const month = cleanMonth(monthRaw, localDay(now.toISOString(), tz).slice(0, 7));
  const grid = monthGrid(month);
  const moments = (db.prepare("SELECT * FROM lip_moments WHERE status != 'archived'").all() as Parameters<typeof momentOf>[0][])
    .map(momentOf)
    .map((m) => ({
      id: m.id,
      memberId: m.memberId,
      headline: m.headline,
      category: m.category,
      status: m.status,
      date: m.eventAt || m.publishAt ? localDay(m.eventAt || m.publishAt, tz) : "",
    }))
    .filter((m) => m.date >= grid.days[0] && m.date <= grid.days.at(-1)!);
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE status != 'archived' AND publish_at != ''").all() as EpisodeRow[])
    .map(episodeOf)
    .map((e) => ({ id: e.id, memberId: e.memberId, number: e.number, title: e.title, status: e.status, date: localDay(e.publishAt, tz) }))
    .filter((e) => e.date >= grid.days[0] && e.date <= grid.days.at(-1)!);
  const routines = (db.prepare("SELECT * FROM lip_routines WHERE status != 'archived' ORDER BY member_id").all() as RoutineRow[]).map(routineOf);
  return {
    month,
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    days: grid.days,
    moments,
    episodes,
    routines: routines.map((r) => ({
      ...r,
      when: routineWhen(r),
      days: r.status === "approved" ? routineDates(r, grid.days[0], grid.days.at(-1)!) : [],
      problems: routineProblems(r),
    })),
    review: calendarReview(db, month, tz),
  };
}

/**
  Rules, not a model: what to look at in a month before approving it. The same person twice with the same headline,
  a crowded day, a moment that would go out before the episode it follows, a moment from a routine on a day the
  routine doesn't happen, too much about care, and the month's balance against the Hub's targets.
*/
export function calendarReview(db: Db, month: string, tz: string) {
  const grid = monthGrid(month);
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const moments = (db.prepare("SELECT * FROM lip_moments WHERE status != 'archived'").all() as Parameters<typeof momentOf>[0][])
    .map(momentOf)
    .map((m) => ({ ...m, date: m.eventAt || m.publishAt ? localDay(m.eventAt || m.publishAt, tz) : "" }))
    .filter((m) => inMonth(m.date));
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE status != 'archived' AND publish_at != ''").all() as EpisodeRow[]).map(episodeOf);
  const routines = (db.prepare("SELECT * FROM lip_routines WHERE status = 'approved'").all() as RoutineRow[]).map(routineOf);
  const issues: { momentId: string | null; text: string }[] = [];
  const seen = new Map<string, string>();
  for (const m of moments) {
    const k = `${m.memberId}|${m.headline.toLowerCase().replace(/\W+/g, " ").trim()}`;
    if (m.headline && seen.has(k)) issues.push({ momentId: m.id, text: `“${m.headline}” appears twice for the same person.` });
    seen.set(k, m.id);
    const e = m.episodeId ? episodes.find((x) => x.id === m.episodeId) : null;
    if (e && m.publishAt && Date.parse(m.publishAt) < Date.parse(e.publishAt))
      issues.push({ momentId: m.id, text: `“${m.headline}” would be shared before episode ${e.number}, which it follows.` });
    const r = m.routineId ? routines.find((x) => x.id === m.routineId) : null;
    if (r && !routineDates(r, m.date, m.date).length)
      issues.push({ momentId: m.id, text: `“${m.headline}” belongs to “${r.title}”, which doesn’t happen that day.` });
  }
  const perDay = new Map<string, number>();
  for (const m of moments) perDay.set(`${m.memberId}|${m.date}`, (perDay.get(`${m.memberId}|${m.date}`) ?? 0) + 1);
  for (const [k, n] of perDay)
    if (n > 2) issues.push({ momentId: null, text: `${n} moments for one person on ${k.split("|")[1]}: give their days some room.` });
  const categories = [
    ...moments.map((m) => m.category),
    ...episodes
      .filter((e) => e.status === "published" || e.status === "scheduled")
      .filter((e) => inMonth(localDay(e.publishAt, tz)))
      .map(() => "new_chapter"),
  ];
  const balance = balanceOf(categories, livesSettings(db).balance);
  const care = balance.find((b) => b.bucket === "care")!;
  if (categories.length >= 5 && care.share > care.target + 10)
    issues.push({
      momentId: null,
      text: `Care is ${care.share}% of the month (the aim is about ${care.target}%). Show them living, not only being looked after.`,
    });
  void grid;
  return { issues, balance, count: categories.length };
}

/** Routine changes, by `action`: routine.new, routine.save, routine.status, routine.delete. Audited as `lives.routine_*`. */
export function routineAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureCalendar(db, now);
  const at = now.toISOString();
  const action = String(input.action ?? "");
  const row = (id: unknown) => db.prepare("SELECT * FROM lip_routines WHERE id = ?").get(cleanId(id)) as RoutineRow | undefined;
  const log = (event: string, entity: string, next?: unknown) => audit(db, { actor: actor.id, event: `lives.routine_${event}`, entity, next, at: now });
  if (action === "routine.new") {
    const memberId = cleanId(input.memberId);
    if (!DIGITAL_MEMBERS.some((m) => m.id === memberId)) throw new HttpError(404, "Choose a digital member.");
    const id = `rt-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const r = cleanRoutine({ id, memberId, title: String(input.title ?? ""), start: at.slice(0, 10), weekdays: [6] });
    db.prepare(
      "INSERT INTO lip_routines (id, member_id, data, status, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)",
    ).run(id, memberId, JSON.stringify(r), actor.id, at, actor.id, at);
    log("created", `routine:${id}`);
    return { id };
  }
  const r = row(input.id ?? (input.routine as { id?: unknown } | undefined)?.id);
  if (!r) throw new HttpError(404, "That routine isn’t here.");
  if (action === "routine.save") {
    const next: Routine = { ...cleanRoutine(input.routine), id: r.id, memberId: r.member_id };
    // A change to an approved routine changes everyone's calendar: it goes back for approval.
    db.prepare(
      "UPDATE lip_routines SET data = ?, status = CASE WHEN status = 'approved' THEN 'draft' ELSE status END, updated_by = ?, updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(next), actor.id, at, r.id);
    log("saved", `routine:${r.id}`);
    return { id: r.id };
  }
  if (action === "routine.status") {
    const to = String(input.status);
    if (!["draft", "approved", "archived"].includes(to)) throw new HttpError(400, "That isn’t a routine state.");
    if (to === "approved") {
      const problems = routineProblems(routineOf(r));
      if (problems.length) throw new HttpError(400, `This routine isn’t ready yet. ${problems.join(" ")}`);
    }
    db.prepare("UPDATE lip_routines SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(
      to,
      to === "approved" ? actor.id : null,
      to === "approved" ? at : null,
      at,
      r.id,
    );
    log("status", `routine:${r.id}`, { status: to });
    return { id: r.id, status: to };
  }
  if (action === "routine.delete") {
    if (r.status !== "draft") throw new HttpError(400, "Only a draft can be deleted. Archive it instead.");
    db.prepare("DELETE FROM lip_routines WHERE id = ?").run(r.id);
    log("deleted", `routine:${r.id}`);
    return { id: r.id };
  }
  throw new HttpError(400, "That isn’t something this page can do.");
}

/** The calendar's part of the report: counts only. */
export function calendarReport(db: Db, actor: User, now: Date, days = 30) {
  requireAuthor(actor);
  ensureCalendar(db, now);
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = db.prepare("SELECT user_id, kind, detail, at FROM lip_activity WHERE kind LIKE 'calendar_%' AND at >= ?").all(since) as {
    user_id: string;
    kind: string;
    detail: string;
    at: string;
  }[];
  const count = (k: string) => rows.filter((r) => r.kind === k).length;
  const visitDays = new Map<string, Set<string>>();
  for (const r of rows.filter((x) => x.kind === "calendar_visit")) visitDays.set(r.user_id, (visitDays.get(r.user_id) ?? new Set()).add(r.at.slice(0, 10)));
  return {
    visits: count("calendar_visit"),
    people: new Set(rows.map((r) => r.user_id)).size,
    daysExplored: count("calendar_day"),
    filters: count("calendar_filter"),
    eventsOpened: count("calendar_event"),
    repeatVisitors: [...visitDays.values()].filter((d) => d.size >= 2).length,
  };
}

export { MOMENT_CATEGORIES };
