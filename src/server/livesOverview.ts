import "server-only";
import { cleanBible, consistencyCheck, episodeLabel, type CastMember } from "@/lib/livesInProgress";
import { localDay, monthGrid, routineDates } from "@/lib/livingCalendar";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { type Db } from "./db";
import { requireAuthor, type User } from "./auth";
import { episodeOf, livesSettings, memberCast, publishDueEpisodes, type EpisodeRow } from "./livesInProgress";
import { calendarReview, ensureCalendar, routineOf } from "./livingCalendar";
import { momentOf } from "./lifeMoments";

/*
  The overview at the top of Admin → Lives in Progress (docs/lives-in-progress.md): the six connected parts, from who
  they are to how learners keep in touch, each with live counts from the real tables, what needs attention, and a row
  per character showing which parts are set up. Counts only: no learner's words, ever.
*/

export const PARTS = [
  { key: "bible", heading: "Character Bible", line: "Who they are.", tab: "characters" },
  { key: "calendar", heading: "Living Calendar", line: "What they’re doing.", tab: "moments" },
  { key: "moments", heading: "Life Moments", line: "What’s happening in their lives.", tab: "moments" },
  { key: "arcs", heading: "Story Arcs", line: "How their lives evolve.", tab: "arcs" },
  { key: "memory", heading: "Conversational Memory", line: "What we’ve spoken about.", tab: "memory" },
  { key: "checkin", heading: "Check In", line: "How we maintain a connection.", tab: "report" },
] as const;
export type PartKey = (typeof PARTS)[number]["key"];

const short = (name: string) => name.replace(/^(mr|mrs|ms)\s+/i, "");

export function livesOverview(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureCalendar(db, now);
  publishDueEpisodes(db, now);
  const at = now.toISOString();
  const tz = actor.timezone || "Australia/Sydney";
  const today = localDay(at, tz);
  const month = today.slice(0, 7);
  const grid = monthGrid(month);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const s = livesSettings(db);
  const names = new Map((db.prepare("SELECT id, name FROM characters").all() as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  // A member missing from the photo library still reads as a name: "mrs-patel" → "Mrs Patel".
  const name = (id: string) => names.get(id) ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // ---- The rows ----
  const bibles = db.prepare("SELECT character_id, draft, approved FROM lip_bibles").all() as { character_id: string; draft: string; approved: string | null }[];
  const routines = (db.prepare("SELECT * FROM lip_routines WHERE status != 'archived'").all() as Parameters<typeof routineOf>[0][]).map(routineOf);
  const moments = (db.prepare("SELECT * FROM lip_moments WHERE status != 'archived'").all() as Parameters<typeof momentOf>[0][]).map(momentOf);
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE status != 'archived'").all() as EpisodeRow[]).map(episodeOf);
  const arcs = db.prepare("SELECT id, member_id, status FROM lip_arcs WHERE status != 'archived'").all() as { id: string; member_id: string; status: string }[];
  const follows = db.prepare("SELECT member_id, COUNT(*) AS n FROM lip_follows GROUP BY member_id").all() as { member_id: string; n: number }[];
  const memoryByMember = db.prepare("SELECT member_id, COUNT(DISTINCT user_id) AS n FROM lip_memories WHERE expires_at > ? GROUP BY member_id").all(at) as {
    member_id: string;
    n: number;
  }[];

  // ---- Character Bible ----
  const approvedBibles = bibles.filter((b) => b.approved);
  const draftBibles = bibles.filter((b) => !b.approved || b.approved !== b.draft);
  const reconcile = bibles.filter((b) => cleanBible(JSON.parse(b.approved ?? b.draft)).reconcile);
  const lives = new Set([
    ...arcs.map((a) => a.member_id),
    ...moments.map((m) => m.memberId),
    ...routines.map((r) => r.memberId),
    ...bibles.map((b) => b.character_id),
  ]);
  const noBible = [...lives].filter((id) => !approvedBibles.some((b) => b.character_id === id));

  // ---- Living Calendar ----
  const paused = routines.filter((r) => r.status === "approved" && r.pauses.some((p) => today >= p.from && today <= p.to));
  const activeRoutines = routines.filter((r) => r.status === "approved" && !paused.includes(r));
  const inMonth = (iso: string) => Boolean(iso) && localDay(iso, tz).slice(0, 7) === month;
  const monthEvents =
    moments.filter((m) => m.status !== "draft" && m.status !== "in_review" && inMonth(m.eventAt || m.publishAt)).length +
    episodes.filter((e) => (e.status === "published" || e.status === "scheduled") && inMonth(e.publishAt)).length;
  const routineDays = routines.filter((r) => r.status === "approved").reduce((n, r) => n + routineDates(r, grid.first, grid.last).length, 0);
  const review = calendarReview(db, month, tz);

  // ---- Life Moments ----
  const scheduled = moments.filter((m) => m.status === "scheduled").length;
  const publishedWeek = moments.filter((m) => m.status === "published" && m.publishAt >= weekAgo && m.publishAt <= at).length;
  const awaiting = moments.filter((m) => m.status === "in_review").length;
  const unrecorded = moments.filter((m) => m.category === "voice" && ["approved", "scheduled", "published"].includes(m.status) && !m.audio?.checked).length;

  // ---- Story Arcs ----
  const activeArcs = arcs.filter((a) => a.status === "approved");
  const due = episodes
    .filter((e) => e.status === "scheduled" && e.publishAt > at && e.publishAt <= weekAhead)
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
    .map(
      (e) =>
        `${short(name(e.memberId))} ${episodeLabel(e.number).replace("Episode", "ep")} · ${new Date(e.publishAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz })}`,
    );
  const inReview = episodes.filter((e) => e.status === "in_review").length;
  const flagged = arcs.flatMap((a) => {
    const eps = episodes.filter((e) => e.arcId === a.id);
    const b = bibles.find((x) => x.character_id === a.member_id);
    const cast = memberCast(db, a.member_id) as CastMember[];
    return consistencyCheck({ bible: b?.approved ? cleanBible(JSON.parse(b.approved)) : null, cast, episodes: eps })
      .filter((i) => i.episodeId)
      .map((i) => {
        const e = eps.find((x) => x.id === i.episodeId)!;
        return `${short(name(a.member_id))} ${episodeLabel(e.number).replace("Episode", "ep")}: ${i.text.replace(/^Episode \d+(’s|:)?\s*/, "")}`;
      });
  });

  // ---- Memory and Check In (counts only) ----
  const memory = db.prepare("SELECT COUNT(*) AS memories, COUNT(DISTINCT user_id) AS learners FROM lip_memories WHERE expires_at > ?").get(at) as {
    memories: number;
    learners: number;
  };
  const followers = (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM lip_follows").get() as { n: number }).n;
  const follows_ = (db.prepare("SELECT COUNT(*) AS n FROM lip_follows").get() as { n: number }).n;
  const opened = (db.prepare("SELECT COUNT(*) AS n FROM lip_activity WHERE kind = 'checkin_open' AND at >= ?").get(weekAgo) as { n: number }).n;

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts: Record<PartKey, { stats: { label: string; value: string | number }[]; attention: string[] }> = {
    bible: {
      stats: [
        { label: "Approved", value: approvedBibles.length },
        { label: "Drafts or changes waiting", value: draftBibles.length },
        { label: "Still to reconcile", value: reconcile.length },
      ],
      attention: [
        ...noBible.map((id) => `${name(id)}: no approved Bible`),
        ...(draftBibles.length ? [`${plural(draftBibles.length, "Bible")} with changes waiting for approval`] : []),
      ],
    },
    calendar: {
      stats: [
        { label: "Routines active", value: activeRoutines.length },
        { label: "Routines paused", value: paused.length },
        { label: "Events this month", value: monthEvents },
        { label: "Routine days this month", value: routineDays },
      ],
      attention: [
        ...(routines.some((r) => r.status === "draft")
          ? [`${plural(routines.filter((r) => r.status === "draft").length, "routine")} waiting for approval`]
          : []),
        ...review.issues.slice(0, 3).map((i) => i.text),
      ],
    },
    moments: {
      stats: [
        { label: "Scheduled", value: scheduled },
        { label: "Published this week", value: publishedWeek },
        { label: "Awaiting approval", value: awaiting },
      ],
      attention: [
        ...(awaiting ? [`${plural(awaiting, "moment")} awaiting approval`] : []),
        ...(unrecorded ? [`${plural(unrecorded, "voice message")} not recorded or checked yet`] : []),
      ],
    },
    arcs: {
      stats: [
        { label: "Active arcs", value: activeArcs.length },
        { label: "Episodes due in the next week", value: due.length },
      ],
      attention: [...(inReview ? [`${plural(inReview, "episode")} in review`] : []), ...flagged.slice(0, 4)],
    },
    memory: {
      stats: [
        { label: "Learners with memories", value: memory.learners },
        { label: "Memories kept", value: memory.memories },
        { label: "Kept for", value: `${s.retentionDays} days` },
      ],
      attention: s.memory ? [] : ["Memory is switched off: every chat starts fresh"],
    },
    checkin: {
      stats: [
        { label: "Learners following someone", value: followers },
        { label: "Follows", value: follows_ },
        { label: "Check-ins opened this week", value: opened },
      ],
      attention: s.checkInVoice ? ["Spoken replies are on: each one is a paid request"] : [],
    },
  };

  // ---- A row per character: which parts are set up ----
  const characters = DIGITAL_MEMBERS.filter((m) => lives.has(m.id)).map((m) => ({
    id: m.id,
    name: name(m.id),
    parts: {
      bible: approvedBibles.some((b) => b.character_id === m.id),
      calendar: routines.some((r) => r.status === "approved" && (r.memberId === m.id || r.alsoMembers.includes(m.id))),
      moments: moments.some((x) => x.memberId === m.id && (x.status === "published" || x.status === "scheduled")),
      arcs: activeArcs.some((a) => a.member_id === m.id),
      memory: memoryByMember.some((x) => x.member_id === m.id && x.n > 0),
      checkin: follows.some((x) => x.member_id === m.id && x.n > 0),
    } satisfies Record<PartKey, boolean>,
  }));

  return {
    parts: PARTS.map((p) => ({ ...p, ...parts[p.key] })),
    characters,
    due: due.slice(0, 3),
    month,
  };
}
export type LivesOverview = ReturnType<typeof livesOverview>;
