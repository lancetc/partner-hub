import "server-only";
import { randomUUID } from "node:crypto";
import {
  ACTIVITY_KINDS,
  cleanBible,
  DEFAULT_FOCUS,
  cleanLivesSettings,
  emptyBible,
  isOut,
  knownAt,
  memoryTopics,
  pronounsFor,
  rememberChat,
  storyBrief,
  storyOrder,
  type ActivityKind,
  type Arc,
  type ArcState,
  type Bible,
  type BriefMemory,
  type CastMember,
  type DiaryAudio,
  type Episode,
  type EpisodeState,
  type LifeEvent,
  type LivesSettings,
  type MemoryDetails,
  type Resource,
  type Turn,
} from "@/lib/livesInProgress";
import { textHash } from "@/lib/magazineNarration";
import { cleanRoutine, localDay, routineWhen } from "@/lib/livingCalendar";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { DEMO_ARCS, DEMO_BIBLES, DEMO_CAST, LIFE_EVENTS } from "@/content/livesInProgress";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";
import { canOpenTopic } from "./catalogue";
import { pathFor } from "./learningPaths";
import { ensureCharacters } from "./characters";
import { digitalMember } from "./digitalMembers";
import { learnerGuides } from "./magazine";
import { getLesson } from "./lessonStore";
import { notify } from "./notifications";

/*
  Lives in Progress (docs/lives-in-progress.md): the Digital Members' ongoing stories. This module keeps the tables,
  publishes episodes when their time comes, and answers for learners: the latest episode, the story so far, what
  they've viewed and followed, and what a character may know and remember in a chat with them.

  The authoring side (Bibles, cast, the Life Event Bank, arcs, episodes, recordings) is in livesAuthoring.ts; the
  AI Story Assistant in livesAssist.ts.

  What this never does: show a learner an episode before it's out; tell a character anything from an unpublished or
  later episode; share one learner's conversations with anyone else (authors included); or change the shared story
  because of anything a learner did.
*/

export const SETTINGS_KEY = "lives_in_progress";

/** Demo arcs and Bibles are seeded on a demo Hub only: a local development server, or HUB_LIVES_DEMO=1. */
export const livesDemoEnabled = () => process.env.HUB_LIVES_DEMO === "1" || (process.env.NODE_ENV === "development" && process.env.HUB_LIVES_DEMO !== "0");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lip_bibles (
  character_id TEXT PRIMARY KEY, draft TEXT NOT NULL, approved TEXT, version INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT, approved_at TEXT, sample INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lip_bible_versions (
  character_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, PRIMARY KEY (character_id, version)
);
CREATE TABLE IF NOT EXISTS lip_cast (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  sample INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lip_life_events (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
  sample INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lip_arcs (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','archived')),
  is_primary INTEGER NOT NULL DEFAULT 0, author TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
  sample INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lip_episodes (
  id TEXT PRIMARY KEY, arc_id TEXT NOT NULL, member_id TEXT NOT NULL, number INTEGER NOT NULL, publish_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','scheduled','published','archived')),
  data TEXT NOT NULL, audio TEXT, review_note TEXT NOT NULL DEFAULT '', approved_by TEXT, approved_at TEXT, published_at TEXT,
  sample INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lip_episodes_due ON lip_episodes (status, publish_at);
CREATE INDEX IF NOT EXISTS lip_episodes_member ON lip_episodes (member_id, status);
CREATE TABLE IF NOT EXISTS lip_views (
  user_id TEXT NOT NULL, episode_id TEXT NOT NULL, member_id TEXT NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, episode_id)
);
CREATE TABLE IF NOT EXISTS lip_follows (
  user_id TEXT NOT NULL, member_id TEXT NOT NULL, notify INTEGER NOT NULL DEFAULT 1, at TEXT NOT NULL, PRIMARY KEY (user_id, member_id)
);
CREATE TABLE IF NOT EXISTS lip_memories (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, member_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  episode_id TEXT, episode_number INTEGER, category TEXT NOT NULL CHECK (category IN ('conversation','hypothetical')),
  summary TEXT NOT NULL, details TEXT NOT NULL, turns INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, UNIQUE (user_id, conversation_id)
);
CREATE INDEX IF NOT EXISTS lip_memories_user ON lip_memories (user_id, member_id, updated_at);
CREATE TABLE IF NOT EXISTS lip_decisions (
  user_id TEXT NOT NULL, episode_id TEXT NOT NULL, interaction_id TEXT NOT NULL, option_id TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (user_id, episode_id, interaction_id)
);
CREATE TABLE IF NOT EXISTS lip_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, member_id TEXT NOT NULL, episode_id TEXT,
  kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', voluntary INTEGER NOT NULL DEFAULT 1, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lip_activity_member ON lip_activity (member_id, at);
CREATE INDEX IF NOT EXISTS lip_activity_user ON lip_activity (user_id, at);
CREATE TABLE IF NOT EXISTS lip_moments (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, arc_id TEXT NOT NULL DEFAULT '', episode_id TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','scheduled','published','archived')),
  publish_at TEXT NOT NULL DEFAULT '', event_at TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL, audio TEXT, review_note TEXT NOT NULL DEFAULT '', approved_by TEXT, approved_at TEXT, published_at TEXT,
  sample INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lip_moments_due ON lip_moments (status, publish_at);
CREATE INDEX IF NOT EXISTS lip_moments_member ON lip_moments (member_id, status);
CREATE TABLE IF NOT EXISTS lip_routines (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL, data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  approved_by TEXT, approved_at TEXT, sample INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lip_moment_views (
  user_id TEXT NOT NULL, moment_id TEXT NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, moment_id)
);
`;

const ready = new WeakSet<object>();
const started = new WeakSet<object>();

/** The tables, the Life Event Bank (once per Hub), and on a demo Hub the demo stories (once). */
export function ensureLives(db: Db, now = new Date()) {
  if (started.has(db)) return;
  ensureLivesTables(db);
  started.add(db);
  seedLifeEvents(db, now);
  if (livesDemoEnabled()) seedLivesDemo(db, now);
}

const seeded = (db: Db, key: string) => Boolean(db.prepare("SELECT 1 FROM settings WHERE key = ?").get(key));
const markSeeded = (db: Db, key: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run(key);

function seedLifeEvents(db: Db, now: Date) {
  if (seeded(db, "lives_events_seed")) return;
  const at = now.toISOString();
  tx(db, () => {
    for (const e of LIFE_EVENTS)
      db.prepare("INSERT OR IGNORE INTO lip_life_events (id, data, sample, updated_by, updated_at) VALUES (?, ?, 1, 'seed', ?)").run(
        e.id,
        JSON.stringify(e),
        at,
      );
    markSeeded(db, "lives_events_seed");
  });
}

/**
  The demonstration stories for Mrs Alvarez, Margaret Alder and Mr Okafor: approved Bibles, their supporting cast,
  and an arc each, dated from today so some episodes are out, one is current and some are still to come. Once only:
  an author's later changes, or deletions, are never undone. Exported for tests, which call it directly.
*/
export function seedLivesDemo(db: Db, now: Date) {
  ensureLivesTables(db);
  if (seeded(db, "lives_demo_seed")) return;
  ensureCharacters(db, now);
  const at = now.toISOString();
  tx(db, () => {
    for (const [id, b] of Object.entries(DEMO_BIBLES)) {
      const data = JSON.stringify(cleanBible(b));
      db.prepare(
        "INSERT OR IGNORE INTO lip_bibles (character_id, draft, approved, version, approved_by, approved_at, sample, updated_by, updated_at) VALUES (?, ?, ?, 1, 'seed', ?, 1, 'seed', ?)",
      ).run(id, data, data, at, at);
      db.prepare(
        "INSERT OR IGNORE INTO lip_bible_versions (character_id, version, data, note, approved_by, approved_at) VALUES (?, 1, ?, 'Demo Bible from the existing introduction and cases', 'seed', ?)",
      ).run(id, data, at);
    }
    for (const c of DEMO_CAST)
      db.prepare("INSERT OR IGNORE INTO lip_cast (id, member_id, data, sample, updated_by, updated_at) VALUES (?, ?, ?, 1, 'seed', ?)").run(
        c.id,
        c.memberId,
        JSON.stringify({ ...c, characterId: c.characterId ?? "" }),
        at,
      );
    for (const a of DEMO_ARCS) {
      // The current episode went out an hour ago; the others a week apart either side.
      const current = now.getTime() - 3600_000;
      const when = (n: number) => new Date(current + (n - a.currentNumber) * 7 * 86_400_000);
      const arc: Arc = {
        id: a.id,
        memberId: a.memberId,
        title: a.title,
        summary: a.summary,
        starting: a.starting,
        theme: a.theme,
        cast: a.cast,
        learning: a.learning,
        behaviour: a.behaviour,
        plannedEpisodes: a.plannedEpisodes,
        startDate: when(1).toISOString().slice(0, 10),
        endDate: when(a.plannedEpisodes).toISOString().slice(0, 10),
        schedule: a.schedule,
        resolution: a.resolution,
        events: a.events,
        primary: a.primary,
      };
      db.prepare(
        "INSERT OR IGNORE INTO lip_arcs (id, member_id, data, status, is_primary, author, approved_by, approved_at, sample, created_at, updated_at) VALUES (?, ?, ?, 'approved', ?, 'seed', 'seed', ?, 1, ?, ?)",
      ).run(a.id, a.memberId, JSON.stringify(arc), a.primary ? 1 : 0, at, at, at);
      for (const e of a.episodes) {
        const publishAt = when(e.number).toISOString();
        const status: EpisodeState = e.status ?? (e.number <= a.currentNumber ? "published" : "scheduled");
        const id = `${a.id}-e${e.number}`;
        const { status: _s, ...rest } = e;
        void _s;
        const data = { ...rest, id, arcId: a.id, memberId: a.memberId, publishAt };
        const approved = status === "published" || status === "scheduled" || status === "approved";
        db.prepare(
          `INSERT OR IGNORE INTO lip_episodes (id, arc_id, member_id, number, publish_at, status, data, approved_by, approved_at, published_at, sample, created_by, created_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'seed', ?, 'seed', ?)`,
        ).run(
          id,
          a.id,
          a.memberId,
          e.number,
          publishAt,
          status,
          JSON.stringify(data),
          approved ? "seed" : null,
          approved ? at : null,
          status === "published" ? publishAt : null,
          at,
          at,
        );
      }
    }
    markSeeded(db, "lives_demo_seed");
  });
}

/** Just the tables, for callers that seed for themselves. */
export function ensureLivesTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export function livesSettings(db: Db): LivesSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
  try {
    return cleanLivesSettings(row ? JSON.parse(row.value) : {});
  } catch {
    return cleanLivesSettings({});
  }
}

// ---------------------------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------------------------

export type EpisodeRow = {
  id: string;
  arc_id: string;
  member_id: string;
  number: number;
  publish_at: string;
  status: EpisodeState;
  data: string;
  audio: string | null;
  review_note: string;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  sample: number;
  updated_at: string;
  updated_by: string;
};
export type ArcRow = {
  id: string;
  member_id: string;
  data: string;
  status: ArcState;
  is_primary: number;
  author: string;
  approved_by: string | null;
  approved_at: string | null;
  sample: number;
  updated_at: string;
};

export function episodeOf(r: EpisodeRow): Episode & { sample: boolean; approvedBy: string | null; publishedAt: string | null; updatedAt: string } {
  const d = JSON.parse(r.data) as Partial<Episode>;
  return {
    id: r.id,
    arcId: r.arc_id,
    memberId: r.member_id,
    number: r.number,
    title: d.title ?? "",
    publishAt: r.publish_at,
    summary: d.summary ?? "",
    story: d.story ?? "",
    dialogue: d.dialogue ?? "",
    quote: d.quote ?? "",
    diary: d.diary ?? "",
    audio: r.audio ? (JSON.parse(r.audio) as DiaryAudio) : null,
    media: { hero: "", heroAlt: "", thumb: "", placeholder: false, prompt: "", focus: "", ...(d.media ?? {}) },
    cast: d.cast ?? [],
    resources: d.resources ?? [],
    interactions: d.interactions ?? [],
    knowledge: d.knowledge ?? "",
    outcomes: d.outcomes ?? "",
    teaser: d.teaser ?? "",
    status: r.status,
    reviewNote: r.review_note,
    sample: Boolean(r.sample),
    approvedBy: r.approved_by,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
  };
}
export const arcOf = (r: ArcRow): Arc & { status: ArcState; sample: boolean; author: string; approvedBy: string | null; updatedAt: string } => ({
  ...(JSON.parse(r.data) as Arc),
  id: r.id,
  memberId: r.member_id,
  primary: Boolean(r.is_primary),
  status: r.status,
  sample: Boolean(r.sample),
  author: r.author,
  approvedBy: r.approved_by,
  updatedAt: r.updated_at,
});

export const memberEpisodes = (db: Db, memberId: string) =>
  (db.prepare("SELECT * FROM lip_episodes WHERE member_id = ? ORDER BY arc_id, number").all(memberId) as EpisodeRow[]).map(episodeOf);
export const memberArcs = (db: Db, memberId: string) =>
  (db.prepare("SELECT * FROM lip_arcs WHERE member_id = ? ORDER BY created_at").all(memberId) as ArcRow[]).map(arcOf);
export const memberCast = (db: Db, memberId: string): CastMember[] =>
  (db.prepare("SELECT id, data FROM lip_cast WHERE member_id = ? AND archived = 0 ORDER BY rowid").all(memberId) as { id: string; data: string }[]).map(
    (r) => ({
      ...(JSON.parse(r.data) as CastMember),
      id: r.id,
      memberId,
    }),
  );
export const lifeEvents = (db: Db): (LifeEvent & { sample: boolean; archived: boolean })[] =>
  (
    db.prepare("SELECT id, data, sample, archived FROM lip_life_events ORDER BY rowid").all() as {
      id: string;
      data: string;
      sample: number;
      archived: number;
    }[]
  ).map((r) => ({ ...(JSON.parse(r.data) as LifeEvent), id: r.id, sample: Boolean(r.sample), archived: Boolean(r.archived) }));

/** The approved Bible the chat and learners use, or null when none is approved yet. */
export function approvedBible(db: Db, memberId: string): Bible | null {
  const r = db.prepare("SELECT approved FROM lip_bibles WHERE character_id = ?").get(memberId) as { approved: string | null } | undefined;
  return r?.approved ? cleanBible(JSON.parse(r.approved)) : null;
}

/**
  A Bible to start from when a member has none yet: everything the Hub already says about them, in the right
  places, so moving an existing member to Lives in Progress loses nothing. Not saved until an author saves it.
*/
export function bibleFromIntroduction(db: Db, memberId: string): Bible {
  ensureCharacters(db);
  const intro = DIGITAL_MEMBERS.find((m) => m.id === memberId);
  const c = db.prepare("SELECT name, look, portrait FROM characters WHERE id = ?").get(memberId) as
    { name: string; look: string; portrait: string } | undefined;
  const b = emptyBible();
  if (!intro || !c) return b;
  b.identity.fullName = c.name;
  b.identity.preferredName = c.name;
  b.identity.living = intro.role;
  b.history.events = intro.about.replace(/\n\n/g, "\n");
  b.personality.expressions = [intro.hello, intro.approach]
    .filter(Boolean)
    .map((s) => `“${s}”`)
    .join(" ");
  b.personality.values = intro.matters ?? "";
  b.daily.challenges = intro.tagline;
  b.media.portrait = c.portrait;
  b.media.visualGuide = c.look;
  b.sources = "Started from the Digital Member introduction (content/digitalMembers.ts) and the photo library.";
  return cleanBible(b);
}

// ---------------------------------------------------------------------------------------------
// Publishing on schedule
// ---------------------------------------------------------------------------------------------

/**
  Scheduled episodes whose time has come are published, and the people following that character are told (in their
  Inbox, once each). Run on every learner read and by the background worker, so nothing waits for either.
*/
export function publishDueEpisodes(db: Db, now: Date) {
  ensureLives(db, now);
  // Life Moments whose time has come go out too (lib/lifeMoments). They notify nobody: the homepage feed is the news.
  const dueMoments = db
    .prepare("SELECT id, member_id, category, data FROM lip_moments WHERE status = 'scheduled' AND publish_at != '' AND publish_at <= ?")
    .all(now.toISOString()) as { id: string; member_id: string; category: string; data: string }[];
  if (dueMoments.length) {
    db.prepare("UPDATE lip_moments SET status = 'published', published_at = ? WHERE status = 'scheduled' AND publish_at != '' AND publish_at <= ?").run(
      now.toISOString(),
      now.toISOString(),
    );
    audit(db, { actor: "scheduler", event: "lives.moments_published", entity: "lip_moments", next: { count: dueMoments.length }, at: now });
    for (const m of dueMoments) notifyMoment(db, m, now);
  }
  const due = db
    .prepare("SELECT * FROM lip_episodes WHERE status = 'scheduled' AND publish_at != '' AND publish_at <= ?")
    .all(now.toISOString()) as EpisodeRow[];
  if (!due.length) return 0;
  const at = now.toISOString();
  for (const r of due) {
    const changed = db.prepare("UPDATE lip_episodes SET status = 'published', published_at = ? WHERE id = ? AND status = 'scheduled'").run(at, r.id);
    if (!changed.changes) continue;
    audit(db, { actor: "scheduler", event: "lives.episode_published", entity: `episode:${r.id}`, next: { publishAt: r.publish_at }, at: now });
    notifyFollowers(db, episodeOf({ ...r, status: "published" }), now);
  }
  // Memories past their keeping date go at the same time.
  db.prepare("DELETE FROM lip_memories WHERE expires_at <= ?").run(at);
  return due.length;
}

export function notifyFollowers(db: Db, e: Episode, now: Date) {
  notifyDaily(
    db,
    e.memberId,
    { title: e.title, body: e.quote ? `“${e.quote}”` : "A new episode in their story.", href: `/community/digital/${e.memberId}?episode=${e.id}` },
    now,
  );
}

/** A moment just shared: followers hear about it only if it's one of the kinds they're told about (NOTIFY_CATEGORIES, or marked). */
export function notifyMoment(db: Db, m: { id: string; member_id: string; category: string; data: string }, now: Date) {
  const d = JSON.parse(m.data) as { headline?: string; quote?: string; notify?: boolean };
  if (!NOTIFY_CATEGORIES.has(m.category) && d.notify !== true) return;
  notifyDaily(db, m.member_id, { title: d.headline ?? "Something new", body: d.quote ? `“${d.quote}”` : "", href: `/community/digital/${m.member_id}` }, now);
}

/** Moments followers hear about: milestones and birthdays, voice messages, and upcoming events an author marks. Never everyday ones. */
export const NOTIFY_CATEGORIES = new Set(["milestone", "celebration", "voice"]);

/**
  Tells a member's followers (those who kept notifications on) about something new, at most once per follower per
  person per day, in their own time zone: a second thing that day updates the same Inbox notice ("2 new things today")
  instead of adding another. No urgency, no extra notices.
*/
export function notifyDaily(db: Db, memberId: string, item: { title: string; body: string; href: string }, now: Date) {
  const name = (db.prepare("SELECT name FROM characters WHERE id = ?").get(memberId) as { name: string } | undefined)?.name ?? "Someone you follow";
  const followers = db
    .prepare("SELECT f.user_id, u.timezone FROM lip_follows f JOIN users u ON u.id = f.user_id WHERE f.member_id = ? AND f.notify = 1")
    .all(memberId) as { user_id: string; timezone: string | null }[];
  for (const f of followers) {
    const source = `lives-day:${memberId}:${localDay(now.toISOString(), f.timezone || "Australia/Sydney")}`;
    const had = db.prepare("SELECT id, title, body FROM notifications WHERE user_id = ? AND source = ?").get(f.user_id, source) as
      { id: number; title: string; body: string } | undefined;
    if (!had) {
      notify(db, f.user_id, { kind: "update", category: "Lives in Progress", title: `${name}: ${item.title}`, body: item.body, href: item.href, source }, now);
      continue;
    }
    const n = Number(/: (\d+) new things today$/.exec(had.title)?.[1] ?? 1) + 1;
    db.prepare("UPDATE notifications SET title = ?, body = ?, href = ?, read_at = NULL WHERE id = ?").run(
      `${name}: ${n} new things today`,
      `${had.body.replace(/^“.*”$/, "").trim() ? `${had.body} · ` : ""}${item.title}`.slice(0, 300),
      `/community/digital/${memberId}`,
      had.id,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// For learners
// ---------------------------------------------------------------------------------------------

/** Whether a reader can open a learning link from a story: anything they can't open is left out. */
function openable(db: Db, user: User, now: Date, guides: () => Set<string>, r: Resource) {
  const [, kind, ref] = r.href.split(/[/?#]/);
  if (kind === "magazine") return guides().has(ref);
  if (kind === "topics") {
    const l = getLesson(db, ref); // A spaced-learning variation counts only once approved; a Topic an author deleted isn't in the list at all.
    if (!l) return false;
    // A catalogue Topic only when it's for this reader (catalogue.canOpenTopic): no partner topic under a coordinator's story.
    return "generated" in l && l.generated ? l.generated.status === "approved" : canOpenTopic(db, user, ref);
  }
  if (kind === "discovery") {
    const p = db.prepare("SELECT id, audience FROM learning_paths WHERE id = ? AND archived = 0").get(ref) as { id: string; audience: string } | undefined;
    return Boolean(p) && pathFor(db, user, p!);
  }
  return true;
}

export type StoryEpisode = {
  id: string;
  number: number;
  arcId: string;
  arcTitle: string;
  title: string;
  publishedAt: string;
  story: string;
  dialogue: string;
  quote: string;
  diary: { script: string; audio: { src: string; seconds: number; scriptHash: string; voice: string; at: string } | null };
  hero: { src: string; alt: string; placeholder: boolean; focus: string };
  thumb: string;
  cast: { id: string; name: string; relation: string; portrait: string }[];
  resources: Resource[];
  interactions: (Episode["interactions"][number] & { speaker?: { name: string; relation: string; portrait: string } })[];
  viewed: boolean;
  /** An author's preview of something learners can't see yet. */
  status?: EpisodeState;
};
export type StoryTimelineItem = Pick<StoryEpisode, "id" | "number" | "arcId" | "arcTitle" | "title" | "publishedAt" | "thumb" | "viewed" | "status"> & {
  blurb: string;
  audio: boolean;
  kinds: string[];
};
export type LivesStoryView = Awaited<ReturnType<typeof livesStory>>;

/** A recording learners may hear: checked by an author, and made from the script as it stands. */
export const hearable = (e: Episode) => (e.audio && e.audio.checked && e.audio.scriptHash === textHash(`${e.audio.voice}|${e.diary}`) ? e.audio : null);

function viewsOf(db: Db, userId: string, memberId: string) {
  return new Set(
    (db.prepare("SELECT episode_id FROM lip_views WHERE user_id = ? AND member_id = ?").all(userId, memberId) as { episode_id: string }[]).map(
      (r) => r.episode_id,
    ),
  );
}

/** The episodes this reader may see: out ones, or for an author previewing, anything not archived. */
function visibleEpisodes(db: Db, user: User, memberId: string, now: Date, preview: boolean) {
  const all = memberEpisodes(db, memberId);
  const arcs = new Map(memberArcs(db, memberId).map((a) => [a.id, a]));
  const shown = preview && canAuthor(user) ? all.filter((e) => e.status !== "archived") : all.filter((e) => isOut(e, now));
  return { episodes: storyOrder(shown.map((e) => (e.publishAt ? e : { ...e, publishAt: now.toISOString() }))), arcs, all };
}

/** An introduced Digital Member whose library row isn't hidden: the same people the Digital Members tab shows. */
export function memberVisible(db: Db, memberId: string) {
  if (!DIGITAL_MEMBERS.some((m) => m.id === memberId)) return false;
  ensureCharacters(db);
  const r = db.prepare("SELECT hidden FROM characters WHERE id = ?").get(memberId) as { hidden: number } | undefined;
  return Boolean(r && !r.hidden);
}

/** Whether this member has a story learners can see now. */
export function hasStory(db: Db, memberId: string, now: Date) {
  ensureLives(db, now);
  return memberEpisodes(db, memberId).some((e) => isOut(e, now));
}

/**
  One member's story for one reader: the episode they're looking at (the latest unless they choose another), the
  timeline of what's out, a teaser for what's next (its date and the teaser line only, never its title), the people
  in it, their own conversations with this person, and whether they follow them.
*/
export function livesStory(db: Db, user: User, memberId: string, now: Date, opts: { episode?: string | null; preview?: boolean } = {}) {
  ensureLives(db, now);
  publishDueEpisodes(db, now);
  const profile = digitalMember(db, user, memberId, now);
  if (!profile) throw new HttpError(404, "That digital member isn’t here.");
  const preview = Boolean(opts.preview && canAuthor(user));
  const { episodes, arcs, all } = visibleEpisodes(db, user, memberId, now, preview);
  const bible = approvedBible(db, memberId);
  const cast = memberCast(db, memberId);
  const portraits = new Map((db.prepare("SELECT id, portrait FROM characters").all() as { id: string; portrait: string }[]).map((r) => [r.id, r.portrait]));
  // Where the face is: the Bible's focal point for their portrait, an episode picture's own focal point otherwise.
  const portraitFocus = bible?.media.focus || DEFAULT_FOCUS;
  const isPortrait = (src: string) => !src || src === profile.portrait || src === bible?.media.portrait;
  // A stand-in picture may show someone else: learners get the character's own portrait until the real one is made.
  // Only an author previewing sees the stand-in, marked as a placeholder.
  const own = (e: Episode) => (e.media.placeholder && !preview ? { hero: "", thumb: "" } : { hero: e.media.hero, thumb: e.media.thumb });
  const viewed = viewsOf(db, user.id, memberId);
  let guideSet: Set<string> | null = null;
  const guides = () => (guideSet ??= new Set(learnerGuides(db, user, now).map((g) => g.slug)));
  const pronouns = pronounsFor(bible?.identity.pronouns || profile.pronouns, profile.name);
  const out = episodes.filter((e) => isOut(e, now));
  const latest = (preview ? episodes : out).at(-1) ?? null;
  const viewing = (opts.episode && episodes.find((e) => e.id === opts.episode)) || latest;

  const toView = (e: Episode): StoryEpisode => {
    const castOf = (id: string) => {
      const c = cast.find((x) => x.id === id);
      return c ? { id: c.id, name: c.name, relation: c.relation, portrait: c.characterId ? (portraits.get(c.characterId) ?? "") : "" } : null;
    };
    const audio = hearable(e);
    return {
      id: e.id,
      number: e.number,
      arcId: e.arcId,
      arcTitle: arcs.get(e.arcId)?.title ?? "",
      title: e.title,
      publishedAt: e.publishAt,
      story: e.story,
      dialogue: e.dialogue,
      quote: e.quote,
      diary: {
        script: e.diary,
        audio: audio ? { src: audio.src, seconds: audio.seconds, scriptHash: audio.scriptHash, voice: audio.voiceName, at: audio.at } : null,
      },
      hero: {
        src: own(e).hero || profile.portrait,
        alt: own(e).hero ? e.media.heroAlt : profile.alt,
        placeholder: preview && e.media.placeholder,
        focus: (own(e).hero && e.media.focus) || (isPortrait(own(e).hero) ? portraitFocus : DEFAULT_FOCUS),
      },
      thumb: own(e).thumb || own(e).hero || profile.portrait,
      cast: e.cast.map(castOf).filter((c): c is NonNullable<typeof c> => Boolean(c)),
      resources: e.resources.filter((r) => preview || openable(db, user, now, guides, r)),
      interactions: e.interactions
        .filter((i) => i.kind !== "learn" || preview || e.resources.some((r) => r.href === i.href && openable(db, user, now, guides, r)))
        .map((i) => {
          const c = i.kind === "perspective" ? castOf(i.castId) : null;
          return c ? { ...i, speaker: { name: c.name, relation: c.relation, portrait: c.portrait } } : i;
        }),
      viewed: viewed.has(e.id),
      ...(preview && { status: e.status }),
    };
  };

  // What's next: the date and the latest episode's own teaser. The next episode's title and words stay on the server.
  const next = storyOrder(all.filter((e) => e.status === "scheduled" && e.publishAt && Date.parse(e.publishAt) > now.getTime()))[0];
  const conversations = livesConversations(db, user, memberId, now);
  const follow = db.prepare("SELECT notify FROM lip_follows WHERE user_id = ? AND member_id = ?").get(user.id, memberId) as { notify: number } | undefined;
  return {
    member: {
      id: profile.id,
      name: profile.name,
      portrait: profile.portrait,
      /** Where the face is in the portrait, for framing it in a wide picture. */
      focus: portraitFocus,
      alt: profile.alt,
      groupLabel: profile.groupLabel,
      // "82 · Lives alone at home, with a front garden": age and circumstances from the Bible, else the card's role.
      circumstances: [bible?.identity.age, bible?.identity.living || profile.role].filter(Boolean).join(" · "),
      location: bible?.identity.location ?? "",
      pronouns,
    },
    hasStory: Boolean(latest),
    latestId: latest?.id ?? null,
    viewing: viewing ? toView(viewing) : null,
    /** Looking back: an earlier chapter, where the character knows only what had happened by then. */
    historical: Boolean(viewing && latest && viewing.id !== latest.id),
    isNew: Boolean(latest && !viewed.has(latest.id)),
    timeline: episodes.map((e): StoryTimelineItem => ({
      id: e.id,
      number: e.number,
      arcId: e.arcId,
      arcTitle: arcs.get(e.arcId)?.title ?? "",
      title: e.title,
      publishedAt: e.publishAt,
      thumb: own(e).thumb || own(e).hero || profile.portrait,
      blurb: e.story.length > 160 ? `${e.story.slice(0, 157).trimEnd()}…` : e.story,
      viewed: viewed.has(e.id),
      audio: Boolean(hearable(e)),
      kinds: [...new Set(e.interactions.map((i) => i.kind))],
      ...(preview && { status: e.status }),
    })),
    upcoming: next && latest ? { at: next.publishAt, teaser: latest.teaser } : null,
    following: follow ? { on: true, notify: Boolean(follow.notify) } : { on: false, notify: livesSettings(db).notifyByDefault },
    conversations,
    memory: { enabled: livesSettings(db).memory, retentionDays: livesSettings(db).retentionDays },
    preview,
  };
}

/** For cards (the homepage and Community → Digital Members): each member's latest episode for this reader. */
export function livesCards(db: Db, user: User, now: Date) {
  ensureLives(db, now);
  publishDueEpisodes(db, now);
  const rows = db.prepare("SELECT * FROM lip_episodes WHERE status = 'published' AND publish_at <= ?").all(now.toISOString()) as EpisodeRow[];
  const byMember = new Map<string, Episode[]>();
  for (const e of rows.map(episodeOf)) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);
  const seen = new Set((db.prepare("SELECT episode_id FROM lip_views WHERE user_id = ?").all(user.id) as { episode_id: string }[]).map((r) => r.episode_id));
  const next = db
    .prepare("SELECT member_id, MIN(publish_at) AS at FROM lip_episodes WHERE status = 'scheduled' AND publish_at > ? GROUP BY member_id")
    .all(now.toISOString()) as { member_id: string; at: string }[];
  const out = new Map<string, StoryCard>();
  for (const [memberId, list] of byMember) {
    const latest = storyOrder(list).at(-1)!;
    const audio = hearable(latest);
    out.set(memberId, {
      episodeId: latest.id,
      number: latest.number,
      title: latest.title,
      quote: latest.quote,
      publishedAt: latest.publishAt,
      isNew: !seen.has(latest.id),
      audioSeconds: audio ? Math.round(audio.seconds) : null,
      hero: latest.media.placeholder ? "" : latest.media.hero,
      nextAt: next.find((n) => n.member_id === memberId)?.at ?? null,
    });
  }
  return out;
}
export type StoryCard = {
  episodeId: string;
  number: number;
  title: string;
  quote: string;
  publishedAt: string;
  isNew: boolean;
  audioSeconds: number | null;
  hero: string;
  nextAt: string | null;
};

// ---------------------------------------------------------------------------------------------
// What learners do: views, follows, interactions, listening
// ---------------------------------------------------------------------------------------------

export function logActivity(db: Db, user: User, memberId: string, episodeId: string | null, kind: ActivityKind, detail: string, now: Date) {
  db.prepare("INSERT INTO lip_activity (user_id, member_id, episode_id, kind, detail, voluntary, at) VALUES (?, ?, ?, ?, ?, 1, ?)").run(
    user.id,
    memberId,
    episodeId,
    kind,
    detail.slice(0, 120),
    now.toISOString(),
  );
}

/**
  `{ kind, episodeId?, interactionId?, optionId?, notify?, detail? }`. Only an episode the reader can see counts,
  and nothing here changes the shared story: a decision is the learner's own "what if".
*/
export function livesActivity(db: Db, user: User, memberId: string, input: Record<string, unknown>, now: Date) {
  ensureLives(db, now);
  const kind = String(input.kind ?? "") as ActivityKind;
  if (!(ACTIVITY_KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "That isn’t something we record.");
  if (!memberVisible(db, memberId)) throw new HttpError(404, "That digital member isn’t here.");
  const at = now.toISOString();
  if (kind === "follow" || kind === "unfollow") {
    if (kind === "follow")
      db.prepare(
        "INSERT INTO lip_follows (user_id, member_id, notify, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, member_id) DO UPDATE SET notify = excluded.notify",
      ).run(user.id, memberId, input.notify === false ? 0 : 1, at);
    else db.prepare("DELETE FROM lip_follows WHERE user_id = ? AND member_id = ?").run(user.id, memberId);
    logActivity(db, user, memberId, null, kind, input.notify === false ? "no notifications" : "", now);
    return { following: kind === "follow", notify: kind === "follow" && input.notify !== false };
  }
  if (kind === "open") {
    logActivity(db, user, memberId, null, "open", String(input.detail ?? ""), now);
    return { ok: true };
  }
  const id = String(input.episodeId ?? "");
  const row = db.prepare("SELECT * FROM lip_episodes WHERE id = ? AND member_id = ?").get(id, memberId) as EpisodeRow | undefined;
  const e = row ? episodeOf(row) : null;
  // An author's preview isn't a learner's visit: only episodes that are out are counted.
  if (!e || !isOut(e, now)) return { ok: false };
  if (kind === "episode_view")
    db.prepare(
      `INSERT INTO lip_views (user_id, episode_id, member_id, first_at, last_at, count) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT (user_id, episode_id) DO UPDATE SET last_at = excluded.last_at, count = count + 1`,
    ).run(user.id, e.id, memberId, at, at);
  if (kind === "decision") {
    const interaction = e.interactions.find((i) => i.id === input.interactionId && i.kind === "decide");
    const option = interaction?.options.find((o) => o.id === input.optionId);
    if (!interaction || !option) throw new HttpError(400, "That choice isn’t part of this episode.");
    db.prepare(
      "INSERT INTO lip_decisions (user_id, episode_id, interaction_id, option_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, episode_id, interaction_id) DO UPDATE SET option_id = excluded.option_id, at = excluded.at",
    ).run(user.id, e.id, interaction.id, option.id, at);
    // Remembered as a what-if the two of them explored, never as something that happened.
    const s = livesSettings(db);
    if (s.memory) {
      const words = `${interaction.body.length > 90 ? `${interaction.body.slice(0, 89)}…` : interaction.body} The learner chose: “${option.text}”`;
      const details: MemoryDetails = { topics: [], questions: [], suggestions: [], decisions: [words] };
      db.prepare(
        `INSERT INTO lip_memories (id, user_id, member_id, conversation_id, episode_id, episode_number, category, summary, details, turns, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'hypothetical', ?, ?, 0, ?, ?, ?)
         ON CONFLICT (user_id, conversation_id) DO UPDATE SET summary = excluded.summary, details = excluded.details, updated_at = excluded.updated_at, expires_at = excluded.expires_at`,
      ).run(
        randomUUID(),
        user.id,
        memberId,
        `decide:${e.id}:${interaction.id}`,
        e.id,
        e.number,
        `Explored a what-if: “${option.text}”`,
        JSON.stringify(details),
        at,
        at,
        expiry(now, s),
      );
    }
    logActivity(db, user, memberId, e.id, "decision", `${interaction.id}:${option.id}`, now);
    return { ok: true, response: option.response };
  }
  logActivity(db, user, memberId, e.id, kind, String(input.detail ?? input.interactionId ?? ""), now);
  return { ok: true };
}

/** A chat started with a Lives in Progress character, for the report: voluntary, and at which episode. */
export function logStoryChat(db: Db, user: User, memberId: string, episodeId: string | null, now: Date) {
  logActivity(db, user, memberId, episodeId, "chat_start", "", now);
}

const expiry = (now: Date, s: LivesSettings) => new Date(now.getTime() + s.retentionDays * 86_400_000).toISOString();

// ---------------------------------------------------------------------------------------------
// Relationship memory: per learner, per character, never shared
// ---------------------------------------------------------------------------------------------

type MemoryRow = {
  id: string;
  conversation_id: string;
  episode_id: string | null;
  episode_number: number | null;
  category: "conversation" | "hypothetical";
  summary: string;
  details: string;
  turns: number;
  created_at: string;
  updated_at: string;
};

/** This reader's own memories with one person, newest first. Only ever the signed-in reader's. */
export function livesConversations(db: Db, user: User, memberId: string, now: Date) {
  ensureLives(db, now);
  db.prepare("DELETE FROM lip_memories WHERE user_id = ? AND expires_at <= ?").run(user.id, now.toISOString());
  const rows = db
    .prepare("SELECT * FROM lip_memories WHERE user_id = ? AND member_id = ? ORDER BY updated_at DESC LIMIT 50")
    .all(user.id, memberId) as MemoryRow[];
  return rows.map((r) => ({
    id: r.id,
    at: r.updated_at,
    episodeNumber: r.episode_number,
    category: r.category,
    summary: r.summary,
    details: JSON.parse(r.details) as MemoryDetails,
  }));
}

/** Forgets one conversation, or everything this reader and this person have shared. */
export function forgetConversations(db: Db, user: User, memberId: string, conversationId: string | null, now: Date) {
  ensureLives(db, now);
  const r = conversationId
    ? db.prepare("DELETE FROM lip_memories WHERE user_id = ? AND member_id = ? AND id = ?").run(user.id, memberId, conversationId)
    : db.prepare("DELETE FROM lip_memories WHERE user_id = ? AND member_id = ?").run(user.id, memberId);
  // The audit says that a learner cleared their memories, never what they were.
  audit(db, { actor: user.id, event: "lives.memory_cleared", entity: `member:${memberId}`, next: { count: Number(r.changes), all: !conversationId }, at: now });
  return { forgotten: Number(r.changes) };
}

/**
  Keeps what a chat should be remembered as: the topics, a few questions and suggestions (scrubbed), and when, at
  which point in the story. Called with the learner's side of the conversation each time they send a message, so the
  memory grows with the chat and never holds the AI's replies.
*/
export function rememberConversation(
  db: Db,
  user: User,
  memberId: string,
  conversationId: string,
  episode: Pick<Episode, "id" | "number"> | null,
  turns: Turn[],
  now: Date,
) {
  ensureLives(db, now);
  const s = livesSettings(db);
  if (!s.memory || !/^[\w-]{8,64}$/.test(conversationId)) return null;
  const memory = rememberChat(turns, memoryTopics({ bible: approvedBible(db, memberId), cast: memberCast(db, memberId) }));
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO lip_memories (id, user_id, member_id, conversation_id, episode_id, episode_number, category, summary, details, turns, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'conversation', ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET summary = excluded.summary, details = excluded.details, turns = excluded.turns,
       updated_at = excluded.updated_at, expires_at = excluded.expires_at
     WHERE lip_memories.member_id = excluded.member_id`,
  ).run(
    randomUUID(),
    user.id,
    memberId,
    `chat:${conversationId}`,
    episode?.id ?? null,
    episode?.number ?? null,
    memory.summary,
    JSON.stringify({ topics: memory.topics, questions: memory.questions, suggestions: memory.suggestions, decisions: [] }),
    turns.filter((t) => t.role === "user").length,
    at,
    at,
    expiry(now, s),
  );
  return memory;
}

/**
  The story layers of a chat brief for this learner and this member, or null when the member has no story yet (the
  chat is then exactly as it was). `episodeId` is the episode the learner is looking at; a learner may only name one
  that's out, and an author previewing may name any that isn't archived. `fresh` leaves earlier chats out.
*/
export function livesChatContext(db: Db, user: User, memberId: string, input: { episodeId?: unknown; fresh?: unknown; preview?: unknown }, now: Date) {
  ensureLives(db, now);
  publishDueEpisodes(db, now);
  const bible = approvedBible(db, memberId);
  const all = memberEpisodes(db, memberId);
  const preview = input.preview === true && canAuthor(user);
  const outEpisodes = knownAt(all, now);
  if (!bible && !outEpisodes.length && !preview) return null;
  const arcs = new Map(memberArcs(db, memberId).map((a) => [a.id, a.title]));
  const latest = outEpisodes.at(-1) ?? null;
  const asked = typeof input.episodeId === "string" ? all.find((e) => e.id === input.episodeId) : undefined;
  let viewing: Episode | null = latest;
  let known: Episode[] = outEpisodes;
  if (asked && isOut(asked, now)) {
    viewing = asked;
    known = knownAt(all, now, asked.id);
  } else if (asked && preview && asked.status !== "archived") {
    // An author trying an episode before it's out: the story as it would stand then.
    viewing = asked;
    const before = storyOrder(all.filter((e) => e.status !== "archived" && e.status !== "draft" && e.arcId === asked.arcId && e.number <= asked.number));
    known = [...outEpisodes.filter((e) => e.arcId !== asked.arcId), ...before];
  }
  const historical = Boolean(viewing && latest && viewing.id !== latest.id && isOut(viewing, now));
  const s = livesSettings(db);
  let memories: BriefMemory[] | null = [];
  if (input.fresh === true) memories = null;
  else if (s.memory) {
    // Only memories from that point in the story or before: looking back, the character can't remember the future.
    const limit = historical && viewing ? viewing.number : Infinity;
    const sameArc = (m: MemoryRow) => !historical || !m.episode_id || all.find((e) => e.id === m.episode_id)?.arcId === viewing?.arcId;
    memories = (
      db
        .prepare("SELECT * FROM lip_memories WHERE user_id = ? AND member_id = ? AND expires_at > ? ORDER BY updated_at DESC")
        .all(user.id, memberId, now.toISOString()) as MemoryRow[]
    )
      .filter((m) => (m.episode_number ?? 0) <= limit && sameArc(m))
      .slice(0, s.memoriesInBrief)
      .reverse()
      .map((m) => ({
        at: m.updated_at,
        episodeNumber: m.episode_number,
        category: m.category,
        summary: m.summary,
        details: JSON.parse(m.details) as MemoryDetails,
      }));
  }
  const brief = (e: Episode) => ({ ...e, arcTitle: arcs.get(e.arcId) ?? "" });
  const cast = memberCast(db, memberId);
  // Life Moments that are out: the latest few, and only up to the episode being viewed when looking back.
  const until = historical && viewing ? viewing.publishAt : now.toISOString();
  const moments = (
    db
      .prepare(
        "SELECT data, publish_at, event_at FROM lip_moments WHERE member_id = ? AND status = 'published' AND publish_at != '' AND publish_at <= ? ORDER BY publish_at DESC LIMIT 6",
      )
      .all(memberId, until) as { data: string; publish_at: string; event_at: string }[]
  )
    .reverse()
    .map((r) => {
      const d = JSON.parse(r.data) as { headline?: string; body?: string; quote?: string; audioScript?: string };
      return {
        at: r.publish_at,
        headline: d.headline ?? "",
        text: [d.body, d.quote && `You said: "${d.quote}"`, d.audioScript && `Your voice message: "${d.audioScript}"`].filter(Boolean).join(" "),
        upcoming: Boolean(r.event_at) && Date.parse(r.event_at) > now.getTime(),
      };
    });
  // The Living Calendar: their approved routines, and (in the present only) what's coming up, by its teaser alone.
  const routines = (db.prepare("SELECT data FROM lip_routines WHERE member_id = ? AND status = 'approved'").all(memberId) as { data: string }[]).map((r) => {
    const x = cleanRoutine(JSON.parse(r.data));
    return `${x.title}: ${routineWhen(x).toLowerCase()}`;
  });
  const ahead = historical
    ? []
    : (
        db
          .prepare(
            "SELECT event_at, data FROM lip_moments WHERE member_id = ? AND status IN ('approved','scheduled') AND event_at > ? AND event_at <= ? ORDER BY event_at LIMIT 5",
          )
          .all(memberId, now.toISOString(), new Date(now.getTime() + 60 * 86_400_000).toISOString()) as { event_at: string; data: string }[]
      )
        .map((r) => ({ at: r.event_at, d: JSON.parse(r.data) as { showAhead?: boolean; teaser?: string } }))
        .filter((r) => r.d.showAhead && r.d.teaser)
        .map((r) => ({
          when: new Date(r.at).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: user.timezone || "Australia/Sydney" }),
          teaser: r.d.teaser!,
        }));
  return {
    brief: storyBrief({
      name: memberId,
      bible,
      cast,
      known: known.map(brief),
      viewing: viewing ? brief(viewing) : null,
      historical,
      memories,
      now,
      moments,
      routines,
      ahead,
    }),
    viewing: viewing ? { id: viewing.id, number: viewing.number, title: viewing.title } : null,
    historical,
    remembered: memories?.length ?? 0,
  };
}
