import "server-only";
import { randomUUID } from "node:crypto";
import { actionLabel, categoryOf, cleanMoment, momentProblems, momentWhen, MOMENT_CATEGORIES, type LifeMoment } from "@/lib/lifeMoments";
import { cleanId, DEFAULT_FOCUS, EPISODE_MOVES, episodeLabel, isOut, pronounsFor, storyOrder, type DiaryAudio, type EpisodeState } from "@/lib/livesInProgress";
import { textHash } from "@/lib/magazineNarration";
import { dayNumber, localDay } from "@/lib/livingCalendar";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { DEMO_MOMENTS, type DemoMoment } from "@/content/lifeMoments";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { mp3Seconds } from "./openaiText";
import { narration } from "./tts";
import { saveUpload } from "./uploads";
import { diaryEstimate, type Deps } from "./livesAuthoring";
import {
  approvedBible,
  ensureLives,
  episodeOf,
  hearable,
  lifeEvents,
  livesDemoEnabled,
  livesSettings,
  logActivity,
  memberVisible,
  notifyMoment,
  publishDueEpisodes,
  type EpisodeRow,
} from "./livesInProgress";

/*
  Life Moments: "Meanwhile, in their lives…" (docs/lives-in-progress.md). Small moments between episodes, in a
  horizontal feed on the homepage, built on Lives in Progress: the same members, Bibles, arcs, episodes, Life Event
  Bank, approval states, voices and report. New episodes appear in the feed as "New chapter" cards of their own, from
  the episodes themselves, so there's nothing to keep in step.

  What this never does: show a moment before its time or after it expires; show a moment that depends on an episode
  before that episode is out; invent a time ("2 minutes ago") that isn't the real one; say a learner caused anything;
  or play anything by itself.
*/

type MomentRow = {
  id: string;
  member_id: string;
  arc_id: string;
  episode_id: string;
  category: string;
  status: EpisodeState;
  publish_at: string;
  event_at: string;
  expires_at: string;
  featured: number;
  priority: number;
  sort: number;
  data: string;
  audio: string | null;
  review_note: string;
  approved_by: string | null;
  published_at: string | null;
  sample: number;
  updated_at: string;
};

export type Moment = LifeMoment & {
  status: EpisodeState;
  publishAt: string;
  audio: DiaryAudio | null;
  reviewNote: string;
  sample: boolean;
  sort: number;
  approvedBy: string | null;
  updatedAt: string;
};

export function momentOf(r: MomentRow): Moment {
  const d = cleanMoment(JSON.parse(r.data));
  return {
    ...d,
    id: r.id,
    memberId: r.member_id,
    arcId: r.arc_id,
    episodeId: r.episode_id,
    category: r.category,
    eventAt: r.event_at,
    expiresAt: r.expires_at,
    featured: Boolean(r.featured),
    priority: r.priority,
    status: r.status,
    publishAt: r.publish_at,
    audio: r.audio ? (JSON.parse(r.audio) as DiaryAudio) : null,
    reviewNote: r.review_note,
    sample: Boolean(r.sample),
    sort: r.sort,
    approvedBy: r.approved_by,
    updatedAt: r.updated_at,
  };
}

const newId = () => `lm-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const row = (db: Db, id: unknown) => db.prepare("SELECT * FROM lip_moments WHERE id = ?").get(cleanId(id)) as MomentRow | undefined;
/** Out for learners: published, its time has come, and it hasn't expired. */
export const momentOut = (m: Pick<Moment, "status" | "publishAt" | "expiresAt">, now: Date) =>
  m.status === "published" && Boolean(m.publishAt) && Date.parse(m.publishAt) <= now.getTime() && (!m.expiresAt || Date.parse(m.expiresAt) > now.getTime());
/** A moment's voice message learners may hear: checked, and made from the script as it stands. */
const hearableMoment = (m: Moment) => (m.audio?.checked && m.audio.scriptHash === textHash(`${m.audio.voice}|${m.audioScript}`) ? m.audio : null);

// ---------------------------------------------------------------------------------------------
// Tables and the demo
// ---------------------------------------------------------------------------------------------

const started = new WeakSet<object>();
/** The Lives in Progress tables (which include Life Moments), and the demo moments on a demo Hub. */
export function ensureMoments(db: Db, now: Date) {
  ensureLives(db, now);
  if (started.has(db)) return;
  started.add(db);
  if (livesDemoEnabled()) seedMomentsDemo(db, now);
}

/**
  The demo moments, once, dated from each demo arc's current episode so they sit where they belong in the story.
  Waits until the demo arcs exist; never re-adds anything an author has changed or deleted.
*/
export function seedMomentsDemo(db: Db, now: Date) {
  seedDemoMoments(db, now, DEMO_MOMENTS, "lives_moments_seed");
}

/** Demo moments from a list, once per `key`, dated from each one's arc. Also used by the Living Calendar's demo. */
export function seedDemoMoments(db: Db, now: Date, list: DemoMoment[], key: string) {
  ensureLives(db, now);
  if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key)) return;
  const anchors = new Map<string, number>();
  for (const m of list) {
    if (anchors.has(m.arc)) continue;
    const r = db.prepare("SELECT e.publish_at FROM lip_episodes e WHERE e.arc_id = ? AND e.status = 'published' ORDER BY e.number DESC LIMIT 1").get(m.arc) as
      { publish_at: string } | undefined;
    if (!r) return;
    anchors.set(m.arc, Date.parse(r.publish_at));
  }
  const at = now.toISOString();
  tx(db, () => {
    list.forEach((m, i) => {
      const publishAt = new Date(anchors.get(m.arc)! + m.day * 86_400_000 + (m.hour ?? 0) * 3_600_000).toISOString();
      const eventAt = m.eventDay === undefined ? "" : new Date(anchors.get(m.arc)! + m.eventDay * 86_400_000).toISOString();
      const status: EpisodeState = m.status ?? (Date.parse(publishAt) <= now.getTime() ? "published" : "scheduled");
      const episodeId = m.episode ? `${m.arc}-e${m.episode}` : "";
      const data = cleanMoment({
        ...m,
        memberId: m.memberId,
        arcId: m.episode ? m.arc : "",
        episodeId,
        body: m.body ?? "",
        quote: m.quote ?? "",
        audioScript: m.audioScript ?? "",
        priority: m.priority ?? 0,
        // An upcoming event leaves the feed the day after it happens.
        expiresAt: eventAt ? new Date(Date.parse(eventAt) + 86_400_000).toISOString() : "",
      });
      const approved = status !== "draft" && status !== "in_review";
      db.prepare(
        `INSERT OR IGNORE INTO lip_moments (id, member_id, arc_id, episode_id, category, status, publish_at, event_at, expires_at, featured, priority, sort, data,
           approved_by, approved_at, published_at, sample, created_by, created_at, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'seed', ?, 'seed', ?)`,
      ).run(
        m.id,
        m.memberId,
        data.arcId,
        episodeId,
        m.category,
        status,
        publishAt,
        eventAt,
        data.expiresAt,
        m.featured ? 1 : 0,
        data.priority,
        i,
        JSON.stringify(data),
        approved ? "seed" : null,
        approved ? at : null,
        status === "published" ? publishAt : null,
        at,
        at,
      );
    });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run(key);
  });
}

// ---------------------------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------------------------

export type FeedCard = {
  id: string;
  kind: "moment" | "episode";
  memberId: string;
  name: string;
  first: string;
  possessive: string;
  portrait: string;
  category: string;
  categoryLabel: string;
  icon: string;
  when: string;
  publishedAt: string;
  upcoming: boolean;
  headline: string;
  body: string;
  quote: string;
  transcript: string;
  audio: { src: string; seconds: number; scriptHash: string; voice: string; at: string } | null;
  image: { src: string; alt: string; focus: string };
  action: "story" | "chat";
  actionLabel: string;
  opener: string;
  episodeId: string;
  unread: boolean;
  /** "You last talked with Mrs Alvarez about the roses." Only from this learner's own stored memory. */
  relationship: string | null;
  featured: boolean;
};
export type FeedChat = { episodeId: string; number: number; title: string; remembered: number; memory: boolean };

const firstName = (name: string) => (/^(mr|mrs|ms)\b/i.test(name) ? name : name.split(" ")[0]);

/**
  The homepage feed for one reader, best first: new episodes they haven't seen, recent moments, people they follow,
  people they've talked with, things coming up, and people they haven't met. No one person fills it. `all` gives
  every moment that's out, newest first, for the page that lists them.
*/
export function momentFeed(db: Db, user: User, now: Date, opts: { all?: boolean } = {}) {
  ensureMoments(db, now);
  publishDueEpisodes(db, now);
  const settings = livesSettings(db);
  const tz = user.timezone || "Australia/Sydney";
  const n = now.getTime();
  const members = new Map(
    (
      db.prepare("SELECT id, name, portrait, alt, hidden FROM characters").all() as {
        id: string;
        name: string;
        portrait: string;
        alt: string;
        hidden: number;
      }[]
    )
      .filter((c) => DIGITAL_MEMBERS.some((m) => m.id === c.id) && !c.hidden)
      .map((c) => [c.id, c]),
  );
  const bibles = new Map<string, ReturnType<typeof approvedBible>>();
  const bible = (id: string) => (bibles.has(id) ? bibles.get(id)! : (bibles.set(id, approvedBible(db, id)), bibles.get(id)!));
  const seen = new Set(
    (db.prepare("SELECT moment_id FROM lip_moment_views WHERE user_id = ?").all(user.id) as { moment_id: string }[]).map((r) => r.moment_id),
  );
  const seenEpisodes = new Set(
    (db.prepare("SELECT episode_id FROM lip_views WHERE user_id = ?").all(user.id) as { episode_id: string }[]).map((r) => r.episode_id),
  );
  const follows = new Set((db.prepare("SELECT member_id FROM lip_follows WHERE user_id = ?").all(user.id) as { member_id: string }[]).map((r) => r.member_id));
  const memories = db
    .prepare(
      "SELECT member_id, MAX(updated_at) AS at, details FROM lip_memories WHERE user_id = ? AND category = 'conversation' AND expires_at > ? GROUP BY member_id",
    )
    .all(user.id, now.toISOString()) as { member_id: string; at: string; details: string }[];
  const met = new Set([
    ...follows,
    ...memories.map((m) => m.member_id),
    ...(db.prepare("SELECT DISTINCT member_id FROM lip_views WHERE user_id = ?").all(user.id) as { member_id: string }[]).map((r) => r.member_id),
  ]);
  const episodes = (db.prepare("SELECT * FROM lip_episodes WHERE status = 'published'").all() as EpisodeRow[]).map(episodeOf).filter((e) => isOut(e, now));

  const person = (id: string) => {
    const c = members.get(id)!;
    const b = bible(id);
    const p = pronounsFor(b?.identity.pronouns ?? "", c.name);
    return { name: c.name, first: firstName(c.name), possessive: p.possessive, portrait: c.portrait, focus: b?.media.focus || DEFAULT_FOCUS, alt: c.alt };
  };

  const cards: (FeedCard & { score: number })[] = [];
  const moments = (db.prepare("SELECT * FROM lip_moments WHERE status = 'published'").all() as MomentRow[]).map(momentOf);
  for (const m of moments) {
    if (!momentOut(m, now) || !members.has(m.memberId)) continue;
    // A moment that depends on an episode waits for it.
    if (m.episodeId && !episodes.some((e) => e.id === m.episodeId)) continue;
    const who = person(m.memberId);
    const cat = categoryOf(m.category, settings);
    const audio = hearableMoment(m);
    const upcoming = Boolean(m.eventAt) && Date.parse(m.eventAt) > n;
    const ownImage = m.image && !m.placeholder;
    const hours = (n - Date.parse(m.publishAt)) / 3_600_000;
    cards.push({
      id: m.id,
      kind: "moment",
      memberId: m.memberId,
      name: who.name,
      first: who.first,
      possessive: who.possessive,
      portrait: who.portrait,
      category: cat.id,
      categoryLabel: cat.label,
      icon: cat.icon,
      when: momentWhen(m.publishAt, m.eventAt, now, tz),
      publishedAt: m.publishAt,
      upcoming,
      headline: m.headline,
      body: m.body,
      quote: m.quote,
      transcript: m.audioScript,
      audio: audio ? { src: audio.src, seconds: audio.seconds, scriptHash: audio.scriptHash, voice: audio.voiceName, at: audio.at } : null,
      image: ownImage ? { src: m.image, alt: m.imageAlt, focus: m.focus || DEFAULT_FOCUS } : { src: who.portrait, alt: who.alt, focus: who.focus },
      action: m.action,
      actionLabel: actionLabel(m, who.first, who.possessive, Boolean(m.episodeId)),
      opener: m.opener,
      episodeId: m.episodeId,
      unread: !seen.has(m.id),
      relationship: null,
      featured: m.featured,
      score:
        (m.featured ? 60 - m.sort / 100 : 0) +
        m.priority * 4 +
        (hours < 24 ? 40 : hours < 72 ? 25 : hours < 168 ? 12 : 0) +
        (follows.has(m.memberId) ? 25 : 0) +
        (memories.some((x) => x.member_id === m.memberId) ? 15 : 0) +
        (upcoming ? 15 : 0) +
        (!met.has(m.memberId) ? 10 : 0) +
        (seen.has(m.id) ? -30 : 20),
    });
  }
  // New chapters: each person's latest episode, for two weeks after it's out. Earlier ones are in their story.
  const latestEpisodes = [...new Set(episodes.map((e) => e.memberId))].map((id) => storyOrder(episodes.filter((e) => e.memberId === id)).at(-1)!);
  for (const e of latestEpisodes) {
    if (!members.has(e.memberId) || n - Date.parse(e.publishAt) > 14 * 86_400_000) continue;
    const who = person(e.memberId);
    const audio = hearable(e);
    const ownImage = e.media.hero && !e.media.placeholder;
    cards.push({
      id: `ep:${e.id}`,
      kind: "episode",
      memberId: e.memberId,
      name: who.name,
      first: who.first,
      possessive: who.possessive,
      portrait: who.portrait,
      category: "new_chapter",
      categoryLabel: MOMENT_CATEGORIES.new_chapter.label,
      icon: MOMENT_CATEGORIES.new_chapter.icon,
      when: momentWhen(e.publishAt, "", now, tz),
      publishedAt: e.publishAt,
      upcoming: false,
      headline: `${episodeLabel(e.number)}: ${e.title}`,
      body: e.story,
      quote: e.quote,
      transcript: e.diary,
      audio: audio ? { src: audio.src, seconds: audio.seconds, scriptHash: audio.scriptHash, voice: audio.voiceName, at: audio.at } : null,
      image: ownImage
        ? { src: e.media.hero, alt: e.media.heroAlt, focus: e.media.focus || DEFAULT_FOCUS }
        : { src: who.portrait, alt: who.alt, focus: who.focus },
      action: "story",
      actionLabel: "Read the latest chapter",
      opener: "",
      episodeId: e.id,
      unread: !seenEpisodes.has(e.id),
      relationship: null,
      featured: false,
      score: seenEpisodes.has(e.id) ? 10 : 100,
    });
  }

  let out: (FeedCard & { score: number })[];
  if (opts.all) out = [...cards].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  else {
    // Best first, but not the same person twice running where there's a choice, and no more than three each.
    const pool = [...cards].sort((a, b) => b.score - a.score);
    out = [];
    const count = new Map<string, number>();
    while (pool.length && out.length < 12) {
      const last = out.at(-1)?.memberId;
      const room = (c: { memberId: string }) => (count.get(c.memberId) ?? 0) < 3;
      let i = pool.findIndex((c) => c.memberId !== last && room(c));
      if (i < 0) i = pool.findIndex(room);
      if (i < 0) break;
      const pick = pool.splice(i, 1)[0];
      count.set(pick.memberId, (count.get(pick.memberId) ?? 0) + 1);
      out.push(pick);
    }
  }

  // One line per person, from what this learner and that person actually talked about, on news since then.
  const said = new Set<string>();
  for (const c of out) {
    const mem = memories.find((m) => m.member_id === c.memberId);
    if (!mem || said.has(c.memberId) || c.publishedAt <= mem.at || c.upcoming) continue;
    const topics = (JSON.parse(mem.details) as { topics?: string[] }).topics ?? [];
    if (!topics.length) continue;
    c.relationship = `You last talked with ${c.name} about ${topics[0]}. Here’s what’s new.`;
    said.add(c.memberId);
  }

  // What the chat needs to know for each person: their latest episode and whether they remember this learner.
  const chat: Record<string, FeedChat> = {};
  for (const id of new Set(out.map((c) => c.memberId))) {
    const latest = storyOrder(episodes.filter((e) => e.memberId === id)).at(-1);
    if (latest)
      chat[id] = {
        episodeId: latest.id,
        number: latest.number,
        title: latest.title,
        remembered: memories.some((m) => m.member_id === id) ? 1 : 0,
        memory: settings.memory,
      };
  }
  return { cards: out.map(({ score: _s, ...c }) => (void _s, c)), chat };
}

/**
  What a learner did with the feed: `seen` (a batch of card ids that were on screen), `open`, `audio_play`,
  `audio_complete`, `transcript`, `chat`. Only moments and episodes that are out count.
*/
export function momentActivity(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureMoments(db, now);
  const kind = String(input.kind ?? "");
  const at = now.toISOString();
  const resolve = (id: unknown) => {
    const s = String(id ?? "");
    if (s.startsWith("ep:")) {
      const r = db.prepare("SELECT * FROM lip_episodes WHERE id = ?").get(s.slice(3)) as EpisodeRow | undefined;
      const e = r ? episodeOf(r) : null;
      return e && isOut(e, now) && memberVisible(db, e.memberId) ? { id: s, memberId: e.memberId, episodeId: e.id } : null;
    }
    const r = row(db, s);
    const m = r ? momentOf(r) : null;
    return m && momentOut(m, now) && memberVisible(db, m.memberId) ? { id: m.id, memberId: m.memberId, episodeId: null } : null;
  };
  if (kind === "seen") {
    const ids = (Array.isArray(input.ids) ? input.ids : []).slice(0, 30);
    let n = 0;
    for (const id of ids) {
      const c = resolve(id);
      if (!c) continue;
      if (c.episodeId) {
        logActivity(db, user, c.memberId, c.episodeId, "moment_seen", c.id, now);
      } else {
        const fresh = db
          .prepare(
            `INSERT INTO lip_moment_views (user_id, moment_id, first_at, last_at, count) VALUES (?, ?, ?, ?, 1)
             ON CONFLICT (user_id, moment_id) DO UPDATE SET last_at = excluded.last_at, count = count + 1`,
          )
          .run(user.id, c.id, at, at);
        if (fresh.changes) logActivity(db, user, c.memberId, null, "moment_seen", c.id, now);
      }
      n++;
    }
    return { seen: n };
  }
  const kinds: Record<string, Parameters<typeof logActivity>[4]> = {
    open: "moment_open",
    audio_play: "moment_audio_play",
    audio_complete: "moment_audio_complete",
    transcript: "moment_transcript",
    chat: "moment_chat",
  };
  if (!kinds[kind]) throw new HttpError(400, "That isn’t something we record.");
  const c = resolve(input.id);
  if (!c) return { ok: false };
  logActivity(db, user, c.memberId, c.episodeId, kinds[kind], c.id, now);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// For authors
// ---------------------------------------------------------------------------------------------

/** Every moment, with what the editor needs: members, arcs and their episodes, the Life Event Bank and categories. */
export function momentsAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureMoments(db, now);
  publishDueEpisodes(db, now);
  const settings = livesSettings(db);
  const moments = (db.prepare("SELECT * FROM lip_moments ORDER BY publish_at DESC").all() as MomentRow[]).map(momentOf);
  const chars = db.prepare("SELECT id, name, portrait FROM characters WHERE hidden = 0").all() as { id: string; name: string; portrait: string }[];
  const episodes = (db.prepare("SELECT * FROM lip_episodes ORDER BY arc_id, number").all() as EpisodeRow[]).map(episodeOf);
  const arcs = db.prepare("SELECT id, member_id, data FROM lip_arcs WHERE status != 'archived'").all() as { id: string; member_id: string; data: string }[];
  return {
    moments: moments.map((m) => ({ ...m, out: momentOut(m, now), hearable: Boolean(hearableMoment(m)) })),
    members: DIGITAL_MEMBERS.flatMap((m) => {
      const c = chars.find((x) => x.id === m.id);
      return c ? [{ id: c.id, name: c.name, portrait: c.portrait, focus: approvedBible(db, c.id)?.media.focus || DEFAULT_FOCUS }] : [];
    }),
    arcs: arcs.map((a) => ({
      id: a.id,
      memberId: a.member_id,
      title: (JSON.parse(a.data) as { title?: string }).title ?? a.id,
      episodes: episodes.filter((e) => e.arcId === a.id).map((e) => ({ id: e.id, number: e.number, title: e.title, publishAt: e.publishAt, status: e.status })),
    })),
    events: lifeEvents(db)
      .filter((e) => !e.archived)
      .map((e) => ({ id: e.id, title: e.title, category: e.category })),
    categories: [
      ...Object.entries(MOMENT_CATEGORIES).map(([id, c]) => ({ id, label: c.label, icon: c.icon, extra: false })),
      ...settings.momentCategories.map((c) => ({ id: c.id, label: c.label, icon: c.icon, extra: true })),
    ],
    settings,
  };
}

/** Whether a moment that depends on an episode can go out at a time: the episode must be out (or scheduled) by then. */
function dependsProblem(db: Db, m: Pick<Moment, "episodeId">, publishAt: string) {
  if (!m.episodeId) return null;
  const r = db.prepare("SELECT * FROM lip_episodes WHERE id = ?").get(m.episodeId) as EpisodeRow | undefined;
  if (!r) return "The episode this moment belongs to isn’t here any more.";
  const e = episodeOf(r);
  if (e.status !== "published" && e.status !== "scheduled") return `This moment follows episode ${e.number}, which isn’t scheduled yet.`;
  if (Date.parse(e.publishAt) > Date.parse(publishAt))
    return `This moment follows episode ${e.number}, which isn’t out until later: it would give the story away. Share it after the episode.`;
  return null;
}

/** Every change an author makes to moments, by `action`. Audited as `lives.moment_*`. */
export function momentAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureMoments(db, now);
  const at = now.toISOString();
  const action = String(input.action ?? "");
  const log = (event: string, entity: string, next?: unknown, previous?: unknown, reason?: string) =>
    audit(db, { actor: actor.id, event: `lives.moment_${event}`, entity, next, previous, reason, at: now });
  const insert = (m: ReturnType<typeof cleanMoment>, publishAt: string) => {
    const id = newId();
    const sort = (db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM lip_moments").get() as { n: number }).n;
    db.prepare(
      `INSERT INTO lip_moments (id, member_id, arc_id, episode_id, category, status, publish_at, event_at, expires_at, featured, priority, sort, data, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      m.memberId,
      m.arcId,
      m.episodeId,
      m.category,
      publishAt,
      m.eventAt,
      m.expiresAt,
      m.featured ? 1 : 0,
      m.priority,
      sort,
      JSON.stringify({ ...m, id }),
      actor.id,
      at,
      actor.id,
      at,
    );
    return id;
  };
  const member = (id: unknown) => {
    const m = cleanId(id);
    if (!DIGITAL_MEMBERS.some((d) => d.id === m)) throw new HttpError(404, "Choose a digital member.");
    return m;
  };

  switch (action) {
    case "moment.new": {
      const memberId = member(input.memberId);
      const tomorrow = new Date(now.getTime() + 86_400_000);
      tomorrow.setUTCHours(23, 0, 0, 0); // About 9 or 10 in the morning on the east coast.
      const id = insert(
        cleanMoment({ memberId, category: String(input.category ?? "everyday"), headline: String(input.headline ?? "") }),
        typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
          ? // From the admin calendar: the day that was clicked, at 9 am Queensland time.
            new Date(`${input.date}T09:00:00+10:00`).toISOString()
          : tomorrow.toISOString(),
      );
      log("created", `moment:${id}`);
      return { id };
    }
    case "moment.bulk": {
      // Proposals from the assistant, taken as drafts: nothing is approved or scheduled by taking them.
      const items = (Array.isArray(input.items) ? input.items : []).slice(0, 60);
      const ids = tx(db, () =>
        items.map((x) => {
          const o = x as Record<string, unknown>;
          const m = cleanMoment({ ...o, memberId: member(o.memberId) });
          return insert(m, typeof o.publishAt === "string" && Number.isFinite(Date.parse(o.publishAt)) ? new Date(o.publishAt).toISOString() : "");
        }),
      );
      log("bulk_drafts", "lip_moments", { count: ids.length });
      return { ids };
    }
    case "moment.save": {
      const r = row(db, (input.moment as { id?: unknown } | undefined)?.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      const m = cleanMoment({ ...(input.moment as object), memberId: r.member_id });
      const publishAt =
        typeof (input.moment as { publishAt?: unknown }).publishAt === "string" ? String((input.moment as { publishAt: string }).publishAt) : r.publish_at;
      const reason = String(input.reason ?? "")
        .trim()
        .slice(0, 300);
      if (r.status === "published" && !reason) throw new HttpError(400, "This moment is out. Say what you’re correcting and why.");
      if (r.status === "archived") throw new HttpError(400, "Restore it to a draft first.");
      const status: EpisodeState = r.status === "approved" || r.status === "scheduled" || r.status === "in_review" ? "draft" : r.status;
      const when = publishAt && Number.isFinite(Date.parse(publishAt)) ? new Date(publishAt).toISOString() : "";
      db.prepare(
        "UPDATE lip_moments SET arc_id = ?, episode_id = ?, category = ?, status = ?, publish_at = ?, event_at = ?, expires_at = ?, featured = ?, priority = ?, data = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      ).run(
        m.arcId,
        m.episodeId,
        m.category,
        status,
        when,
        m.eventAt,
        m.expiresAt,
        m.featured ? 1 : 0,
        m.priority,
        JSON.stringify({ ...m, id: r.id }),
        actor.id,
        at,
        r.id,
      );
      log(r.status === "published" ? "corrected" : "saved", `moment:${r.id}`, { status }, { status: r.status }, reason || undefined);
      return { id: r.id, status };
    }
    case "moment.status": {
      const r = row(db, input.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      const to = String(input.status) as EpisodeState;
      if (!EPISODE_MOVES[r.status]?.includes(to))
        throw new HttpError(400, `A moment that’s ${r.status.replace("_", " ")} can’t go to ${to.replace("_", " ")}.`);
      const m = momentOf(r);
      let publishAt = r.publish_at;
      if (to === "published" && (!publishAt || Date.parse(publishAt) > now.getTime())) publishAt = at;
      if (["in_review", "approved", "scheduled", "published"].includes(to)) {
        const problems = momentProblems(m, publishAt);
        if (problems.length) throw new HttpError(400, `This moment isn’t ready yet. ${problems.join(" ")}`);
      }
      if (to === "scheduled" && Date.parse(publishAt) <= now.getTime()) throw new HttpError(400, "That time has passed. Choose a later one, or share it now.");
      if (to === "scheduled" || to === "published") {
        const p = dependsProblem(db, m, publishAt);
        if (p) throw new HttpError(400, p);
      }
      db.prepare(
        `UPDATE lip_moments SET status = ?, publish_at = ?, approved_by = CASE WHEN ? IN ('approved','scheduled','published') THEN COALESCE(approved_by, ?) ELSE NULL END,
           approved_at = CASE WHEN ? IN ('approved','scheduled','published') THEN COALESCE(approved_at, ?) ELSE NULL END,
           published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END, review_note = CASE WHEN ? != '' THEN ? ELSE review_note END,
           updated_by = ?, updated_at = ? WHERE id = ?`,
      ).run(to, publishAt, to, actor.id, to, at, to, at, String(input.note ?? ""), String(input.note ?? "").slice(0, 500), actor.id, at, r.id);
      log("status", `moment:${r.id}`, { status: to, publishAt }, { status: r.status });
      if (to === "published") notifyMoment(db, r, now);
      return { id: r.id, status: to };
    }
    case "moment.reschedule": {
      // From the admin calendar: dragged to another day. Its times of day stay; a shared moment's date doesn't move here.
      const r = row(db, input.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      const date = String(input.date ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Choose a day.");
      if (r.status === "published") throw new HttpError(400, "This moment has been shared. Change its date in the editor, with a reason.");
      const tz = actor.timezone || "Australia/Sydney";
      const current = r.event_at || r.publish_at;
      const shift = current ? (dayNumber(date) - dayNumber(localDay(current, tz))) * 86_400_000 : 0;
      const move = (v: string) => (v ? new Date(Date.parse(v) + shift).toISOString() : "");
      const publishAt = current ? move(r.publish_at) : new Date(`${date}T09:00:00+10:00`).toISOString();
      if (r.status === "scheduled") {
        if (Date.parse(publishAt) <= now.getTime()) throw new HttpError(400, "That day has passed. Choose a later one, or share it now.");
        const p = dependsProblem(db, momentOf(r), publishAt);
        if (p) throw new HttpError(400, p);
      }
      db.prepare("UPDATE lip_moments SET publish_at = ?, event_at = ?, expires_at = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
        publishAt,
        move(r.event_at),
        move(r.expires_at),
        actor.id,
        at,
        r.id,
      );
      log("rescheduled", `moment:${r.id}`, { date, publishAt }, { publishAt: r.publish_at });
      return { id: r.id };
    }
    case "moment.feature": {
      const r = row(db, input.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      db.prepare("UPDATE lip_moments SET featured = ?, updated_at = ? WHERE id = ?").run(input.featured === true ? 1 : 0, at, r.id);
      log("featured", `moment:${r.id}`, { featured: input.featured === true });
      return { id: r.id };
    }
    case "moment.move": {
      // Featured moments in the order authors put them.
      const featured = db.prepare("SELECT id, sort FROM lip_moments WHERE featured = 1 AND status != 'archived' ORDER BY sort").all() as {
        id: string;
        sort: number;
      }[];
      const i = featured.findIndex((f) => f.id === input.id);
      const j = i + (input.dir === "up" ? -1 : 1);
      if (i < 0 || j < 0 || j >= featured.length) return { id: input.id };
      tx(db, () => {
        db.prepare("UPDATE lip_moments SET sort = ? WHERE id = ?").run(featured[j].sort, featured[i].id);
        db.prepare("UPDATE lip_moments SET sort = ? WHERE id = ?").run(featured[i].sort, featured[j].id);
      });
      log("moved", `moment:${featured[i].id}`);
      return { id: featured[i].id };
    }
    case "moment.delete": {
      const r = row(db, input.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      if (r.status !== "draft") throw new HttpError(400, "Only a draft can be deleted. Archive it instead.");
      db.prepare("DELETE FROM lip_moments WHERE id = ?").run(r.id);
      log("deleted", `moment:${r.id}`);
      return { id: r.id };
    }
    case "moment.audio.check": {
      const r = row(db, input.id);
      const audio = r?.audio ? (JSON.parse(r.audio) as DiaryAudio) : null;
      if (!r || !audio) throw new HttpError(400, "There’s no recording to check.");
      if (input.ok !== true) throw new HttpError(400, "Tick that you’ve listened and it matches the script.");
      db.prepare("UPDATE lip_moments SET audio = ? WHERE id = ?").run(JSON.stringify({ ...audio, checked: { by: actor.id, at } }), r.id);
      log("audio_checked", `moment:${r.id}`);
      return { id: r.id };
    }
    case "moment.audio.remove": {
      const r = row(db, input.id);
      if (!r) throw new HttpError(404, "That moment isn’t here.");
      db.prepare("UPDATE lip_moments SET audio = NULL WHERE id = ?").run(r.id);
      log("audio_removed", `moment:${r.id}`);
      return { id: r.id };
    }
  }
  throw new HttpError(400, "That isn’t something this page can do.");
}

/**
  Records a voice message in the member's approved voice, from an approved moment's script. Charged, so without
  `confirm: true` it only returns the estimate. Cached by the narration layer, so the same words are never paid twice.
*/
export async function recordMomentAudio(db: Db, actor: User, input: { momentId?: unknown; confirm?: unknown }, now: Date, deps: Deps = {}) {
  requireAuthor(actor);
  ensureMoments(db, now);
  const r = row(db, input.momentId);
  if (!r) throw new HttpError(404, "That moment isn’t here.");
  const m = momentOf(r);
  if (!["approved", "scheduled", "published"].includes(m.status))
    throw new HttpError(400, "Approve the moment first: voice messages are recorded from approved words only.");
  if (m.audioScript.length < 30) throw new HttpError(400, "There’s no voice message script to record.");
  const b = approvedBible(db, m.memberId);
  const voice = b?.media.voiceId ?? "";
  if (!voice) throw new HttpError(400, "Choose and approve a voice in the Character Bible first, so every message sounds like the same person.");
  const estimate = diaryEstimate(voice, m.audioScript.length);
  if (input.confirm !== true) return { estimate, recorded: false };
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db
    .prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event IN ('lives.diary_recorded', 'lives.moment_recorded') AND at > ?")
    .get(actor.id, since) as { n: number };
  if (recent.n >= 40) throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  const speak = deps.speak ?? ((text: string, v: string, style?: string) => narration(text, v, style));
  const made = await speak(m.audioScript, voice, voice.startsWith("openai:") ? b?.media.delivery : undefined);
  const name = (db.prepare("SELECT name FROM characters WHERE id = ?").get(m.memberId) as { name: string } | undefined)?.name ?? m.memberId;
  const file = new File([new Uint8Array(made.audio)], `Life Moment – ${name} – ${m.id}.mp3`, { type: "audio/mpeg" });
  const saved = deps.save ? await deps.save(file) : await saveUpload(db, actor, file, { width: 0, height: 0 }, now);
  const seconds = made.words?.length ? Math.round(made.words[made.words.length - 1].end * 10) / 10 : (mp3Seconds(made.audio) ?? 0);
  const audio: DiaryAudio = {
    src: saved.src,
    seconds,
    scriptHash: textHash(`${voice}|${m.audioScript}`),
    voice,
    voiceName: b?.media.voiceName || voice,
    at: now.toISOString(),
    by: actor.id,
    characters: m.audioScript.length,
    checked: null,
  };
  db.prepare("UPDATE lip_moments SET audio = ? WHERE id = ?").run(JSON.stringify(audio), m.id);
  audit(db, {
    actor: actor.id,
    event: "lives.moment_recorded",
    entity: `moment:${m.id}`,
    next: { characters: m.audioScript.length, estimate: estimate.text },
    at: now,
  });
  return { estimate, recorded: true, audio };
}

/** What recording every demo voice message would cost, for the owner to approve first. */
export function demoMomentsEstimate(db: Db, actor: User, now: Date, voiceId: string) {
  requireAuthor(actor);
  ensureMoments(db, now);
  const rows = (
    db.prepare("SELECT * FROM lip_moments WHERE sample = 1 AND category = 'voice' AND status IN ('approved','scheduled','published')").all() as MomentRow[]
  ).map(momentOf);
  return {
    messages: rows.length,
    ...diaryEstimate(
      voiceId,
      rows.reduce((n, m) => n + m.audioScript.length, 0),
    ),
  };
}

/** The feed's part of the report: counts only, by category. All of it voluntary. */
export function momentsReport(db: Db, actor: User, now: Date, days = 30) {
  requireAuthor(actor);
  ensureMoments(db, now);
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = db.prepare("SELECT user_id, kind, detail, at FROM lip_activity WHERE kind LIKE 'moment_%' AND at >= ?").all(since) as {
    user_id: string;
    kind: string;
    detail: string;
    at: string;
  }[];
  const cat = new Map((db.prepare("SELECT id, category FROM lip_moments").all() as { id: string; category: string }[]).map((r) => [r.id, r.category]));
  const settings = livesSettings(db);
  const categoryOfDetail = (d: string) => (d.startsWith("ep:") ? "new_chapter" : (cat.get(d) ?? "everyday"));
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const c = categoryOfDetail(r.detail);
    const k = by.get(c) ?? {};
    k[r.kind] = (k[r.kind] ?? 0) + 1;
    by.set(c, k);
  }
  const days2 = new Map<string, Set<string>>();
  for (const r of rows.filter((x) => x.kind === "moment_seen")) days2.set(r.user_id, (days2.get(r.user_id) ?? new Set()).add(r.at.slice(0, 10)));
  const count = (k: string) => rows.filter((r) => r.kind === k).length;
  return {
    days,
    impressions: count("moment_seen"),
    people: new Set(rows.map((r) => r.user_id)).size,
    opens: count("moment_open"),
    audioPlays: count("moment_audio_play"),
    audioCompletes: count("moment_audio_complete"),
    transcripts: count("moment_transcript"),
    chats: count("moment_chat"),
    repeatVisitors: [...days2.values()].filter((d) => d.size >= 2).length,
    byCategory: [...by.entries()].map(([id, k]) => ({
      id,
      label: categoryOf(id, settings).label,
      seen: k.moment_seen ?? 0,
      opened: k.moment_open ?? 0,
      played: k.moment_audio_play ?? 0,
      chats: k.moment_chat ?? 0,
    })),
  };
}
