import "server-only";
import { randomUUID } from "node:crypto";
import { lessons, lessonBySlug } from "@/content/lessons";
import { PILOT_APPEARANCES, PILOT_CHARACTERS, PILOT_EPISODES, PILOT_MOMENTS, PILOT_PLAN } from "@/content/storyPilot";
import { BLOCK_LABELS, type BlockType } from "@/lib/magazine";
import { ordered } from "@/lib/lessonGraph";
import { textHash } from "@/lib/magazineNarration";
import {
  AUDIENCES,
  CAST_ROLES,
  cleanMoment,
  cleanPlan,
  cleanProfile,
  continuityCheck,
  emptyMoment,
  emptyPlan,
  emptyProfile,
  FORMATS,
  MOMENT_KINDS,
  momentProblems,
  outlineFor,
  profileChanges,
  profileProblems,
  scriptOf,
  splitHistory,
  starterBeats,
  STORY_EVENTS,
  suggestCharacters,
  type AppearanceKind,
  type Audience,
  type CastMember,
  type CastRole,
  type Episode,
  type HistoryItem,
  type MomentData,
  type MomentKind,
  type PlacedMoment,
  type PlanData,
  type Profile,
  type StoryStatus,
} from "@/lib/story";
import { audit, ensureStoryTables, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, requireAuthor, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { missionLock } from "./challenges";
import { canRead, createGuide } from "./magazine";
import { mp3Seconds } from "./openaiText";
import { narration, narratorName, ttsConfig } from "./tts";
import { saveUpload } from "./uploads";

/*
  Story Plans, recurring characters and check-ins (docs/story-plans.md).

  Authors keep a character's shared story here: an approved profile, episodes in story order, where the character
  appears, and story moments. Learners get only approved revisions, pinned by a placement to the Topic card or
  Magazine block they sit beside, and a history that leaves out anything they may not open.

  What this never does: change a course, a completion or an attempt; advance anyone's story from a learner's
  answer; or make a paid voice request from a learner's page. Audio is made from an approved script, by an author,
  and is only played once someone has listened and confirmed it matches.
*/

type CharRow = { id: string; name: string; role: string; look: string; portrait: string; alt: string; hidden: number };
type ProfileRow = { character_id: string; steward: string; audience: string; draft: string; revision: number; sample: number; updated_at: string };
type EpisodeRow = {
  id: string;
  title: string;
  summary: string;
  when_label: string;
  seq: number;
  people: string;
  changes: string;
  source: string;
  status: StoryStatus;
  sample: number;
};
type AppearanceRow = {
  id: string;
  character_id: string;
  episode_id: string;
  kind: AppearanceKind;
  ref: string;
  page_id: string;
  version: string;
  type: CastRole;
  summary: string;
  label: string;
  href: string;
  status: string;
};
type MomentRow = {
  id: string;
  kind: MomentKind;
  speaker_id: string;
  featured_id: string;
  episode_id: string;
  plan_id: string;
  draft: string;
  status: StoryStatus;
  revision: number;
  sample: number;
  updated_at: string;
};
type PlacementRow = {
  id: string;
  moment_id: string;
  revision: number;
  kind: "topic" | "guide";
  ref: string;
  place: string;
  position: "before" | "after";
  content_version: string;
  status: string;
};
type PlanRow = { id: string; title: string; ref_kind: string; ref: string; theme_id: string; data: string; status: string; sample: number; updated_at: string };
type GuideRow = { id: string; slug: string; title: string; status: string; audience: string; revision_id: string | null; draft: string };
type Clip = { src: string; seconds: number; hash: string };
type Audio = {
  voice?: string;
  voiceName?: string;
  at?: string;
  by?: string;
  script?: Clip | null;
  answers?: Record<string, Clip>;
  checked?: { by: string; at: string } | null;
};

const newId = (p: string) => `${p}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v: unknown) => (typeof v === "string" && /^[\w-]{1,60}$/.test(v) ? v : "");
const audiences = (v: unknown): Audience[] => (Array.isArray(v) ? v.filter((a): a is Audience => typeof a === "string" && a in AUDIENCES) : []);
const AUDIO_PER_HOUR = 40;

// ---------------------------------------------------------------------------------------------
// Tables and the pilot
// ---------------------------------------------------------------------------------------------

const seeded = new WeakSet<object>();
/** The tables, with the fictional pilot (Dot, Fiona, Ava) added once per Hub as sample canon. */
export function ensureStory(db: Db, now = new Date()) {
  ensureStoryTables(db);
  if (seeded.has(db)) return;
  seeded.add(db);
  ensureCharacters(db, now);
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'story_pilot_seed'").get()) return;
  const at = now.toISOString();
  tx(db, () => {
    const ids = new Map<string, string>();
    for (const c of PILOT_CHARACTERS) {
      // The photo library may already know this name: the story profile goes on that row.
      const had = db.prepare("SELECT id FROM characters WHERE name = ? COLLATE NOCASE").get(c.name) as { id: string } | undefined;
      const id = had?.id ?? c.id;
      if (!had)
        db.prepare(
          "INSERT OR IGNORE INTO characters (id, name, aliases, role, look, portrait, alt, status, origin, created_at, updated_at) VALUES (?, ?, '[]', ?, ?, '', '', 'none', 'seed', ?, ?)",
        ).run(id, c.name, c.role, c.look, at, at);
      ids.set(c.id, id);
      db.prepare(
        "INSERT OR IGNORE INTO character_profiles (character_id, steward, audience, draft, revision, sample, updated_by, updated_at) VALUES (?, ?, '[]', ?, 1, 1, 'seed', ?)",
      ).run(id, c.steward, JSON.stringify(c.profile), at);
      db.prepare(
        "INSERT OR IGNORE INTO character_revisions (character_id, number, profile, note, approved_by, approved_at) VALUES (?, 1, ?, 'Sample pilot canon', 'seed', ?)",
      ).run(id, JSON.stringify(c.profile), at);
    }
    const real = (id: string) => ids.get(id) ?? id;
    for (const e of PILOT_EPISODES)
      db.prepare(
        "INSERT OR IGNORE INTO story_episodes (id, title, summary, when_label, seq, people, changes, source, status, sample, approved_by, approved_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'seed', ?, ?)",
      ).run(
        e.id,
        e.title,
        e.summary,
        e.whenLabel,
        e.seq,
        JSON.stringify(e.people.map((p) => ({ ...p, characterId: real(p.characterId) }))),
        e.changes,
        e.source,
        e.status,
        e.status === "approved" ? "seed" : null,
        e.status === "approved" ? at : null,
        at,
        at,
      );
    for (const a of PILOT_APPEARANCES)
      db.prepare(
        "INSERT INTO story_appearances (id, character_id, episode_id, kind, type, summary, label, href, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)",
      ).run(newId("app"), real(a.characterId), a.episodeId, a.kind, a.type, a.summary, a.label, a.href, at);
    for (const m of PILOT_MOMENTS) {
      db.prepare(
        "INSERT OR IGNORE INTO story_moments (id, kind, speaker_id, featured_id, episode_id, plan_id, draft, status, revision, sample, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 1, 1, 'seed', ?, ?)",
      ).run(m.id, m.kind, real(m.speakerId), m.featuredId ? real(m.featuredId) : "", m.episodeId, PILOT_PLAN.id, JSON.stringify(m.data), at, at);
      db.prepare("INSERT OR IGNORE INTO story_moment_revisions (moment_id, number, data, approved_by, approved_at) VALUES (?, 1, ?, 'seed', ?)").run(
        m.id,
        JSON.stringify(m.data),
        at,
      );
    }
    const plan = {
      ...PILOT_PLAN.data,
      anchorId: real(PILOT_PLAN.data.anchorId),
      beats: PILOT_PLAN.data.beats.map((b) => ({ ...b, characterId: b.characterId ? real(b.characterId) : "" })),
    };
    db.prepare(
      "INSERT OR IGNORE INTO story_plans (id, title, data, status, sample, created_by, created_at, updated_at) VALUES (?, ?, ?, 'draft', 1, 'seed', ?, ?)",
    ).run(PILOT_PLAN.id, PILOT_PLAN.title, JSON.stringify(plan), at, at);
    db.prepare("INSERT INTO settings (key, value) VALUES ('story_pilot_seed', '1') ON CONFLICT (key) DO UPDATE SET value = '1'").run();
  });
}

// ---------------------------------------------------------------------------------------------
// Reading rows
// ---------------------------------------------------------------------------------------------

const charRow = (db: Db, id: unknown) =>
  idOf(id) ? (db.prepare("SELECT id, name, role, look, portrait, alt, hidden FROM characters WHERE id = ?").get(idOf(id)) as CharRow | undefined) : undefined;
const profileRow = (db: Db, id: string) => db.prepare("SELECT * FROM character_profiles WHERE character_id = ?").get(id) as ProfileRow | undefined;
const approvedProfile = (db: Db, id: string, number: number): Profile | null => {
  if (!number) return null;
  const r = db.prepare("SELECT profile FROM character_revisions WHERE character_id = ? AND number = ?").get(id, number) as { profile: string } | undefined;
  return r ? cleanProfile(JSON.parse(r.profile)) : null;
};
const episodeOf = (r: EpisodeRow): Episode & { sample: boolean } => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  whenLabel: r.when_label,
  seq: r.seq,
  people: JSON.parse(r.people) as Episode["people"],
  changes: r.changes,
  source: r.source,
  status: r.status,
  sample: Boolean(r.sample),
});
const allEpisodes = (db: Db) => (db.prepare("SELECT * FROM story_episodes ORDER BY seq, title").all() as EpisodeRow[]).map(episodeOf);
const momentRow = (db: Db, id: unknown) =>
  idOf(id) ? (db.prepare("SELECT * FROM story_moments WHERE id = ?").get(idOf(id)) as MomentRow | undefined) : undefined;
const momentData = (r: Pick<MomentRow, "draft">): MomentData => ({ ...emptyMoment(), ...cleanMoment(JSON.parse(r.draft)) });
const revisionOf = (db: Db, momentId: string, number: number) => {
  const r = db.prepare("SELECT data, audio, approved_at FROM story_moment_revisions WHERE moment_id = ? AND number = ?").get(momentId, number) as
    { data: string; audio: string; approved_at: string } | undefined;
  return r ? { data: cleanMoment(JSON.parse(r.data)), audio: JSON.parse(r.audio) as Audio, approvedAt: r.approved_at } : null;
};
const guideRow = (db: Db, id: string) =>
  db.prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE id = ?").get(id) as GuideRow | undefined;

type DocPage = {
  id: string;
  title: string;
  sections?: { id: string; title: string; blocks?: { id: string; type: string; title?: string; heading?: string; prompt?: string }[] }[];
};
const pagesOf = (json: string): DocPage[] => {
  try {
    return ((JSON.parse(json) as { pages?: DocPage[] }).pages ?? []).filter((p) => p && typeof p.id === "string");
  } catch {
    return [];
  }
};
const blockLabel = (b: { type: string; title?: string; heading?: string; prompt?: string }) => {
  const words = (b.title || b.heading || b.prompt || "").replace(/<[^>]+>/g, "").slice(0, 60);
  return `${BLOCK_LABELS[b.type as BlockType] ?? b.type}${words ? `: ${words}` : ""}`;
};
/** The published document a learner reads, or the draft where nothing is published yet. */
const guideDoc = (db: Db, g: GuideRow) => {
  const rev = g.revision_id ? (db.prepare("SELECT doc FROM magazine_revisions WHERE id = ?").get(g.revision_id) as { doc: string } | undefined) : undefined;
  return pagesOf(rev?.doc ?? g.draft);
};

/**
  Cards a moment can sit on. A full-screen presenter video and a listening card have no room beside them, so the
  player shows nothing extra there: they aren't offered, and a placement on one is refused.
*/
const roomOnCard = (c: { type: string; visual?: { kind?: string; video?: { orientation?: string; src?: string; provider?: string } } }) =>
  c.type !== "listen" &&
  !(c.visual?.kind === "presenter" && c.visual.video?.orientation === "portrait" && (Boolean(c.visual.video.src) || c.visual.video.provider === "youtube"));

/** Where a placement sits, in words, and whether that place still exists. */
function placeLabel(db: Db, p: Pick<PlacementRow, "kind" | "ref" | "place">) {
  if (p.kind === "topic") {
    const l = lessonBySlug(p.ref);
    const card = l?.nodes[p.place];
    return {
      title: l?.title ?? p.ref,
      where: card ? card.heading || card.label || card.id : "A card that’s no longer there",
      found: Boolean(card),
      href: `/topics/${p.ref}?card=${p.place}`,
    };
  }
  const g = guideRow(db, p.ref);
  if (!g) return { title: p.ref, where: "A course that’s no longer there", found: false, href: "" };
  for (const page of guideDoc(db, g)) {
    if (p.place === `page:${page.id}`) return { title: g.title, where: `${page.title}: top of the page`, found: true, href: `/magazine/${g.slug}/${page.id}` };
    for (const s of page.sections ?? [])
      for (const b of s.blocks ?? [])
        if (b.id === p.place) return { title: g.title, where: `${page.title}: ${blockLabel(b)}`, found: true, href: `/magazine/${g.slug}/${page.id}` };
  }
  return { title: g.title, where: "A block that’s no longer there", found: false, href: `/magazine/${g.slug}` };
}

function castOf(db: Db): CastMember[] {
  const chars = db
    .prepare(
      "SELECT c.id, c.name, c.role, p.audience, p.draft, p.revision FROM character_profiles p JOIN characters c ON c.id = p.character_id ORDER BY c.name",
    )
    .all() as {
    id: string;
    name: string;
    role: string;
    audience: string;
    draft: string;
    revision: number;
  }[];
  const episodes = allEpisodes(db).filter((e) => e.status === "approved");
  return chars.map((c) => ({
    id: c.id,
    name: c.name,
    host: c.role === "coordinator" || c.role === "worker",
    approved: c.revision > 0,
    audience: audiences(JSON.parse(c.audience)),
    profile: approvedProfile(db, c.id, c.revision) ?? cleanProfile(JSON.parse(c.draft)),
    episodes: episodes.filter((e) => e.people.some((p) => p.characterId === c.id)),
    appearances: (db.prepare("SELECT COUNT(*) AS n FROM story_appearances WHERE character_id = ? AND status = 'active'").get(c.id) as { n: number }).n,
  }));
}

/**
  For AI proposals (server/storyAssist): everyone with a story profile, their approved profile version, and every
  episode. The caller keeps to what is approved; nothing here is a draft passed off as canon.
*/
export function assistCanon(db: Db, actor: User, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const revisions = new Map(
    (db.prepare("SELECT character_id, revision FROM character_profiles").all() as { character_id: string; revision: number }[]).map((r) => [
      r.character_id,
      r.revision,
    ]),
  );
  return { cast: castOf(db), revisions, episodes: allEpisodes(db) };
}

/**
  Who may change shared canon. Where the steward is a named person in the Hub, it's them or a superadmin; where it's
  a team ("Partner Enablement"), any learning author, as for the rest of publishing.
*/
export function mayApprove(db: Db, actor: User, steward: string) {
  if (!steward || isSuperadmin(actor) || steward === actor.id || steward.toLowerCase() === actor.name.toLowerCase()) return true;
  return !db.prepare("SELECT 1 FROM users WHERE id = ? OR name = ? COLLATE NOCASE").get(steward, steward);
}

/** Everything live that leans on a character: where they appear and every placed moment they speak or feature in. */
function impactOf(db: Db, characterId: string) {
  const appearances = (db.prepare("SELECT * FROM story_appearances WHERE character_id = ? AND status = 'active'").all(characterId) as AppearanceRow[]).map(
    (a) => `Appearance: ${appearanceLabel(db, a).label}`,
  );
  const placed = (
    db
      .prepare(
        "SELECT p.*, m.kind AS mkind FROM story_placements p JOIN story_moments m ON m.id = p.moment_id WHERE p.status = 'active' AND (m.speaker_id = ? OR m.featured_id = ?)",
      )
      .all(characterId, characterId) as (PlacementRow & { mkind: MomentKind })[]
  ).map((p) => {
    const l = placeLabel(db, p);
    return `${MOMENT_KINDS[p.mkind]} in ${l.title} (${l.where})`;
  });
  return [...appearances, ...placed];
}

function appearanceLabel(db: Db, a: AppearanceRow) {
  if (a.kind === "topic") return { label: lessonBySlug(a.ref)?.title ?? a.ref, href: `/topics/${a.ref}`, found: Boolean(lessonBySlug(a.ref)) };
  if (a.kind === "other") return { label: a.label, href: a.href, found: true };
  const g = guideRow(db, a.ref);
  const page = g && a.kind === "page" ? guideDoc(db, g).find((p) => p.id === a.page_id) : undefined;
  return {
    label: g ? `${g.title}${page ? `: ${page.title}` : ""}` : a.ref,
    href: g ? `/magazine/${g.slug}${page ? `/${page.id}` : ""}` : "",
    found: Boolean(g),
  };
}

// ---------------------------------------------------------------------------------------------
// Authors: the library
// ---------------------------------------------------------------------------------------------

export function storyLibrary(db: Db, actor: User, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const episodes = allEpisodes(db);
  const rows = db
    .prepare(
      "SELECT c.id, c.name, c.role, c.portrait, c.alt, p.steward, p.audience, p.draft, p.revision, p.sample FROM characters c LEFT JOIN character_profiles p ON p.character_id = c.id ORDER BY c.name",
    )
    .all() as (CharRow & Partial<ProfileRow>)[];
  const withStory = rows.filter((r) => r.draft);
  return {
    voiceReady: ttsConfig().configured,
    characters: withStory.map((r) => {
      const draft = cleanProfile(JSON.parse(r.draft!));
      const approved = approvedProfile(db, r.id, r.revision ?? 0);
      const mine = episodes.filter((e) => e.status === "approved" && e.people.some((p) => p.characterId === r.id));
      return {
        id: r.id,
        name: r.name,
        portrait: r.portrait,
        narrativeRole: draft.narrativeRole,
        summary: draft.summary,
        provenance: draft.provenance,
        steward: r.steward ?? "",
        audience: audiences(JSON.parse(r.audience ?? "[]")),
        approved: Boolean(approved),
        changed: Boolean(approved) && JSON.stringify(approved) !== JSON.stringify(draft),
        sample: Boolean(r.sample),
        lastEvent: mine.at(-1)?.title ?? "",
        appearances: (db.prepare("SELECT COUNT(*) AS n FROM story_appearances WHERE character_id = ? AND status = 'active'").get(r.id) as { n: number }).n,
        moments: (db.prepare("SELECT COUNT(*) AS n FROM story_moments WHERE speaker_id = ? AND status != 'retired'").get(r.id) as { n: number }).n,
      };
    }),
    /** People in the photo library with no story yet. */
    others: rows.filter((r) => !r.draft).map((r) => ({ id: r.id, name: r.name })),
    episodes,
    plans: (db.prepare("SELECT * FROM story_plans ORDER BY updated_at DESC").all() as PlanRow[]).map((p) => {
      const d = { ...emptyPlan(), ...cleanPlan(JSON.parse(p.data)) };
      return {
        id: p.id,
        title: p.title,
        mode: d.mode,
        target: d.target,
        anchor: rows.find((r) => r.id === d.anchorId)?.name ?? "",
        sample: Boolean(p.sample),
        updatedAt: p.updated_at,
        refKind: p.ref_kind,
        ref: p.ref,
      };
    }),
  };
}
export type StoryLibrary = ReturnType<typeof storyLibrary>;

const momentSummary = (db: Db, m: MomentRow) => {
  const draft = momentData(m);
  const rev = m.revision ? revisionOf(db, m.id, m.revision) : null;
  return {
    id: m.id,
    kind: m.kind,
    title: draft.title || MOMENT_KINDS[m.kind],
    status: m.status,
    revision: m.revision,
    changed: Boolean(rev) && JSON.stringify(rev!.data) !== JSON.stringify(draft),
    sample: Boolean(m.sample),
    placements: (db.prepare("SELECT COUNT(*) AS n FROM story_placements WHERE moment_id = ? AND status = 'active'").get(m.id) as { n: number }).n,
    audio: rev?.audio.script || Object.keys(rev?.audio.answers ?? {}).length ? (rev?.audio.checked ? "checked" : "unchecked") : "none",
  };
};

export function characterDetail(db: Db, actor: User, id: unknown, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const c = charRow(db, id);
  const p = c && profileRow(db, c.id);
  if (!c || !p) throw new HttpError(404, "That character has no story profile.");
  const draft = { ...emptyProfile(), ...cleanProfile(JSON.parse(p.draft)) };
  const approved = approvedProfile(db, c.id, p.revision);
  const episodes = allEpisodes(db);
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    portrait: c.portrait,
    look: c.look,
    steward: p.steward,
    audience: audiences(JSON.parse(p.audience)),
    sample: Boolean(p.sample),
    draft,
    approved,
    revision: p.revision,
    revisions: db.prepare("SELECT number, note, approved_at AS approvedAt FROM character_revisions WHERE character_id = ? ORDER BY number DESC").all(c.id) as {
      number: number;
      note: string;
      approvedAt: string;
    }[],
    problems: profileProblems(draft),
    changes: profileChanges(approved, draft),
    impact: impactOf(db, c.id),
    canApprove: mayApprove(db, actor, p.steward),
    episodes: episodes.filter((e) => e.people.some((x) => x.characterId === c.id)),
    allEpisodes: episodes.map((e) => ({ id: e.id, title: e.title, seq: e.seq, status: e.status })),
    cast: db.prepare("SELECT c.id, c.name FROM character_profiles p JOIN characters c ON c.id = p.character_id ORDER BY c.name").all() as {
      id: string;
      name: string;
    }[],
    appearances: (
      db.prepare("SELECT * FROM story_appearances WHERE character_id = ? AND status = 'active' ORDER BY created_at").all(c.id) as AppearanceRow[]
    ).map((a) => ({
      id: a.id,
      episodeId: a.episode_id,
      kind: a.kind,
      format: FORMATS[a.kind],
      type: a.type,
      summary: a.summary,
      version: a.version,
      ...appearanceLabel(db, a),
    })),
    moments: (db.prepare("SELECT * FROM story_moments WHERE speaker_id = ? OR featured_id = ? ORDER BY created_at").all(c.id, c.id) as MomentRow[]).map(
      (m) => ({ ...momentSummary(db, m), speaks: m.speaker_id === c.id }),
    ),
    voiceReady: ttsConfig().configured,
    narrator: narratorName(),
  };
}
export type CharacterDetail = ReturnType<typeof characterDetail>;

export function momentDetail(db: Db, actor: User, id: unknown, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const m = momentRow(db, id);
  if (!m) throw new HttpError(404, "That story moment isn’t here.");
  const speaker = charRow(db, m.speaker_id);
  const sp = profileRow(db, m.speaker_id);
  const draft = momentData(m);
  const rev = m.revision ? revisionOf(db, m.id, m.revision) : null;
  const episodes = allEpisodes(db);
  const ep = episodes.find((e) => e.id === m.episode_id);
  const voice = approvedProfile(db, m.speaker_id, sp?.revision ?? 0)?.voice;
  return {
    id: m.id,
    kind: m.kind,
    status: m.status,
    revision: m.revision,
    sample: Boolean(m.sample),
    speaker: { id: m.speaker_id, name: speaker?.name ?? m.speaker_id, portrait: speaker?.portrait ?? "", role: speaker?.role ?? "" },
    featuredId: m.featured_id,
    episodeId: m.episode_id,
    planId: m.plan_id,
    draft,
    approved: rev?.data ?? null,
    approvedAt: rev?.approvedAt ?? null,
    changed: Boolean(rev) && JSON.stringify(rev!.data) !== JSON.stringify(draft),
    problems: momentProblems(m.kind, draft, { speakerApproved: Boolean(sp?.revision), episodeApproved: ep ? ep.status === "approved" : null }),
    script: scriptOf(m.kind, draft),
    audio: rev?.audio ?? {},
    voice: {
      ready: ttsConfig().configured,
      name: voice?.id
        ? voice.name || "The character’s chosen voice"
        : `${narratorName()} (the Hub’s narrator: no voice is set on ${speaker?.name ?? "this character"}’s profile)`,
    },
    placements: (db.prepare("SELECT * FROM story_placements WHERE moment_id = ? AND status = 'active' ORDER BY placed_at").all(m.id) as PlacementRow[]).map(
      (p) => ({
        id: p.id,
        kind: p.kind,
        revision: p.revision,
        position: p.position,
        behind: p.revision < m.revision,
        contentVersion: p.content_version,
        ...placeLabel(db, p),
      }),
    ),
    cast: db.prepare("SELECT c.id, c.name FROM character_profiles p JOIN characters c ON c.id = p.character_id ORDER BY c.name").all() as {
      id: string;
      name: string;
    }[],
    episodes: episodes.map((e) => ({ id: e.id, title: e.title, status: e.status })),
  };
}
export type MomentDetail = ReturnType<typeof momentDetail>;

/** Where a moment can be placed: every Topic card, and every page and block of every course that isn't archived. */
export function storyPlaces(db: Db, actor: User) {
  requireAuthor(actor);
  return {
    topics: lessons.map((l) => ({
      ref: l.slug,
      title: l.title,
      places: ordered(l)
        .filter(roomOnCard)
        .map((c) => ({ id: c.id, label: c.heading || c.label || c.id })),
    })),
    guides: (
      db
        .prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE status != 'archived' ORDER BY title")
        .all() as GuideRow[]
    ).map((g) => ({
      ref: g.id,
      title: `${g.title}${g.status === "published" ? "" : " (draft)"}`,
      places: guideDoc(db, g).flatMap((p) => [
        { id: `page:${p.id}`, label: `${p.title}: top of the page` },
        ...(p.sections ?? []).flatMap((s) => (s.blocks ?? []).map((b) => ({ id: b.id, label: `${p.title}: ${blockLabel(b)}` }))),
      ]),
    })),
  };
}

export function planDetail(db: Db, actor: User, id: unknown, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const row = idOf(id) ? (db.prepare("SELECT * FROM story_plans WHERE id = ?").get(idOf(id)) as PlanRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That story plan isn’t here.");
  const data = { ...emptyPlan(), ...cleanPlan(JSON.parse(row.data)) };
  const cast = castOf(db);
  const episodes = allEpisodes(db);
  const moments = (db.prepare("SELECT * FROM story_moments WHERE status != 'retired' ORDER BY created_at").all() as MomentRow[]).map((m) => ({
    id: m.id,
    kind: m.kind,
    status: m.status,
    title: momentData(m).title || MOMENT_KINDS[m.kind],
    speakerId: m.speaker_id,
    planId: m.plan_id,
  }));
  const anchor = cast.find((c) => c.id === data.anchorId);
  const guide = row.ref_kind === "course" && row.ref ? guideRow(db, row.ref) : undefined;
  return {
    id: row.id,
    title: row.title,
    sample: Boolean(row.sample),
    themeId: row.theme_id,
    guide: guide ? { id: guide.id, title: guide.title } : null,
    data,
    cast: cast.map((c) => ({ id: c.id, name: c.name, approved: c.approved, summary: c.profile.summary })),
    anchor: anchor
      ? {
          id: anchor.id,
          name: anchor.name,
          summary: anchor.profile.summary,
          facts: anchor.profile.facts.map((f) => f.text),
          episodes: anchor.episodes.map((e) => ({ title: e.title, whenLabel: e.whenLabel, summary: e.summary })),
          appearances: (db.prepare("SELECT * FROM story_appearances WHERE character_id = ? AND status = 'active'").all(anchor.id) as AppearanceRow[]).map(
            (a) => ({ format: FORMATS[a.kind], ...appearanceLabel(db, a) }),
          ),
        }
      : null,
    suggestions: suggestCharacters(
      { behaviour: `${data.purpose} ${data.decision}`, situation: data.perspective, tension: data.tension, audience: data.audience },
      cast,
    ),
    warnings: continuityCheck(data, cast, episodes, moments),
    outline: outlineFor(data, BLOCK_LABELS),
    episodes: episodes.map((e) => ({ id: e.id, title: e.title, status: e.status })),
    moments,
  };
}
export type PlanDetail = ReturnType<typeof planDetail>;

// ---------------------------------------------------------------------------------------------
// Authors: changes
// ---------------------------------------------------------------------------------------------

/** Checks a Topic card or a Magazine page or block is really there, and reads the content version being pinned to. */
function placeTarget(db: Db, kind: unknown, ref: unknown, place: unknown) {
  const r = str(ref, 80);
  const pl = str(place, 80);
  if (kind === "topic") {
    const l = lessonBySlug(r);
    if (!l || !l.nodes[pl]) throw new HttpError(400, "Choose a card in a Topic.");
    if (!roomOnCard(l.nodes[pl]))
      throw new HttpError(400, "That card is a full-screen video or a listening card, with no room beside it. Choose the card before or after.");
    return { kind: "topic" as const, ref: r, place: pl, version: l.version };
  }
  const g = guideRow(db, r);
  if (!g || g.status === "archived") throw new HttpError(400, "Choose a page or block in a Magazine course.");
  const ok = guideDoc(db, g).some((p) => pl === `page:${p.id}` || (p.sections ?? []).some((s) => (s.blocks ?? []).some((b) => b.id === pl)));
  if (!ok) throw new HttpError(400, "That place isn’t in the course as learners read it. Publish the course first, or choose another place.");
  return { kind: "guide" as const, ref: g.id, place: pl, version: g.revision_id ?? "draft" };
}

export function storyAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureStory(db, now);
  const at = now.toISOString();
  const needChar = () => {
    const c = charRow(db, input.id);
    const p = c && profileRow(db, c.id);
    if (!c || !p) throw new HttpError(404, "That character has no story profile.");
    return { c, p };
  };
  const needMoment = () => {
    const m = momentRow(db, input.id);
    if (!m) throw new HttpError(404, "That story moment isn’t here.");
    return m;
  };
  const people = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .slice(0, 8)
      .map((x) => ({
        characterId: idOf((x as { characterId?: unknown })?.characterId),
        role: ((x as { role?: string })?.role ?? "") in CAST_ROLES ? ((x as { role: CastRole }).role as CastRole) : ("supporting" as CastRole),
      }))
      .filter((x) => x.characterId && profileRow(db, x.characterId));

  return tx(db, () => {
    switch (input.action) {
      case "start-profile": {
        let c = charRow(db, input.id);
        if (!c) {
          const name = str(input.name, 60);
          if (name.length < 2) throw new HttpError(400, "Give the character a name.");
          if (db.prepare("SELECT 1 FROM characters WHERE name = ? COLLATE NOCASE").get(name))
            throw new HttpError(409, `${name} is already in the character library. Start their story from there.`);
          const cid = `${
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || "character"
          }-${randomUUID().slice(0, 4)}`;
          db.prepare(
            "INSERT INTO characters (id, name, aliases, role, look, portrait, alt, status, origin, created_at, updated_at) VALUES (?, ?, '[]', 'other', '', '', '', 'none', 'author', ?, ?)",
          ).run(cid, name, at, at);
          c = charRow(db, cid)!;
        }
        if (!profileRow(db, c.id))
          db.prepare("INSERT INTO character_profiles (character_id, steward, draft, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)").run(
            c.id,
            actor.name,
            JSON.stringify(emptyProfile()),
            actor.id,
            at,
          );
        return { id: c.id };
      }
      case "save-profile": {
        const { c } = needChar();
        db.prepare("UPDATE character_profiles SET draft = ?, steward = ?, audience = ?, updated_by = ?, updated_at = ? WHERE character_id = ?").run(
          JSON.stringify(cleanProfile(input.profile)),
          str(input.steward, 120),
          JSON.stringify(audiences(input.audience)),
          actor.id,
          at,
          c.id,
        );
        return { id: c.id };
      }
      case "approve-profile": {
        const { c, p } = needChar();
        if (!mayApprove(db, actor, p.steward)) throw new HttpError(403, `${p.steward} is ${c.name}’s steward. Ask them to approve the change.`);
        const draft = cleanProfile(JSON.parse(p.draft));
        const problems = profileProblems(draft);
        if (problems.length) throw new HttpError(400, `Not yet. ${problems.join(" ")}`);
        const approved = approvedProfile(db, c.id, p.revision);
        const changes = profileChanges(approved, draft);
        const note = str(input.note, 400);
        // Changing shared history is an editorial act: it needs its reason on the record.
        if (approved && changes.length && note.length < 10)
          throw new HttpError(400, "Say why the approved story is changing. Everything that already tells it keeps the version it was approved with.");
        if (approved && !changes.length && JSON.stringify(approved) === JSON.stringify(draft))
          throw new HttpError(400, "Nothing has changed since the approved version.");
        const number = p.revision + 1;
        db.prepare(
          "INSERT INTO character_revisions (character_id, number, profile, audience, note, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(c.id, number, JSON.stringify(draft), p.audience, note, actor.id, at);
        db.prepare("UPDATE character_profiles SET revision = ?, sample = 0, updated_by = ?, updated_at = ? WHERE character_id = ?").run(
          number,
          actor.id,
          at,
          c.id,
        );
        audit(db, {
          actor: actor.id,
          event: "story.canon_approved",
          entity: `character:${c.id}`,
          next: { revision: number, changes: changes.length },
          reason: note || undefined,
          at: now,
        });
        return { id: c.id, revision: number, impact: impactOf(db, c.id) };
      }
      case "save-episode": {
        const title = str(input.title, 120);
        if (title.length < 3) throw new HttpError(400, "Give the episode a title.");
        const cast = people(input.people);
        if (!cast.length) throw new HttpError(400, "An episode needs at least one character with a story profile.");
        const seq = Number.isFinite(Number(input.seq)) ? Number(input.seq) : 0;
        const fields = [
          title,
          str(input.summary, 600),
          str(input.whenLabel, 80),
          seq,
          JSON.stringify(cast),
          str(input.changes, 400),
          str(input.source, 300),
          at,
        ];
        const eid = idOf(input.episodeId);
        if (eid) {
          const done = db
            .prepare(
              "UPDATE story_episodes SET title = ?, summary = ?, when_label = ?, seq = ?, people = ?, changes = ?, source = ?, updated_at = ? WHERE id = ?",
            )
            .run(...fields, eid);
          if (!done.changes) throw new HttpError(404, "That episode isn’t here.");
          audit(db, { actor: actor.id, event: "story.episode_saved", entity: `episode:${eid}`, next: { title, seq }, at: now });
          return { episodeId: eid };
        }
        const fresh = newId("ep");
        db.prepare(
          "INSERT INTO story_episodes (title, summary, when_label, seq, people, changes, source, updated_at, id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(...fields, fresh, actor.id, at);
        return { episodeId: fresh };
      }
      case "episode-status": {
        const eid = idOf(input.episodeId);
        const e = db.prepare("SELECT * FROM story_episodes WHERE id = ?").get(eid) as EpisodeRow | undefined;
        if (!e) throw new HttpError(404, "That episode isn’t here.");
        const status = input.status === "approved" || input.status === "retired" ? input.status : "draft";
        if (status === "approved" && e.summary.length < 20)
          throw new HttpError(400, "Write a summary that makes sense on its own before approving the episode.");
        db.prepare("UPDATE story_episodes SET status = ?, approved_by = ?, approved_at = ?, sample = 0, updated_at = ? WHERE id = ?").run(
          status,
          status === "approved" ? actor.id : null,
          status === "approved" ? at : null,
          at,
          e.id,
        );
        audit(db, { actor: actor.id, event: `story.episode_${status}`, entity: `episode:${e.id}`, previous: { status: e.status }, at: now });
        return { episodeId: e.id };
      }
      case "save-appearance": {
        const { c } = needChar();
        const eid = idOf(input.episodeId);
        if (!db.prepare("SELECT 1 FROM story_episodes WHERE id = ?").get(eid)) throw new HttpError(400, "Choose the episode this appearance tells.");
        const kind = input.kind === "topic" || input.kind === "course" || input.kind === "page" ? input.kind : "other";
        const ref = str(input.ref, 80);
        let version = "";
        let pageId = "";
        if (kind === "topic") {
          const l = lessonBySlug(ref);
          if (!l) throw new HttpError(400, "Choose a published Topic.");
          version = l.version;
        } else if (kind !== "other") {
          const g = guideRow(db, ref);
          if (!g || g.status === "archived") throw new HttpError(400, "Choose a Magazine course.");
          version = g.revision_id ?? "draft";
          if (kind === "page") {
            pageId = str(input.pageId, 60);
            if (!guideDoc(db, g).some((p) => p.id === pageId)) throw new HttpError(400, "Choose a page of that course.");
          }
        }
        const href = kind === "other" && /^\/[\w\-/?=&.]*$/.test(str(input.href, 200)) ? str(input.href, 200) : "";
        if (kind === "other" && (!href || !str(input.label, 120)))
          throw new HttpError(400, "Give the place a name and a Hub path, such as /play/coordinators-day.");
        db.prepare(
          "INSERT INTO story_appearances (id, character_id, episode_id, kind, ref, page_id, version, type, summary, label, href, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          newId("app"),
          c.id,
          eid,
          kind,
          kind === "other" ? "" : ref,
          pageId,
          version,
          (str(input.type, 20) in CAST_ROLES ? str(input.type, 20) : "focus") as CastRole,
          str(input.summary, 300),
          str(input.label, 120),
          href,
          actor.id,
          at,
        );
        return { id: c.id };
      }
      case "remove-appearance": {
        db.prepare("UPDATE story_appearances SET status = 'retired' WHERE id = ?").run(idOf(input.appearanceId));
        return {};
      }
      case "save-moment": {
        const kind = typeof input.kind === "string" && input.kind in MOMENT_KINDS ? (input.kind as MomentKind) : null;
        const speaker = idOf(input.speakerId);
        const data = JSON.stringify(cleanMoment(input.data));
        const mid = idOf(input.id);
        if (mid) {
          const m = needMoment();
          // The kind and the speaker are what a moment is: they don't change under an approved revision.
          db.prepare("UPDATE story_moments SET featured_id = ?, episode_id = ?, draft = ?, updated_at = ? WHERE id = ?").run(
            idOf(input.featuredId),
            idOf(input.episodeId),
            data,
            at,
            m.id,
          );
          return { id: m.id };
        }
        if (!kind) throw new HttpError(400, "Choose what kind of moment this is.");
        if (!profileRow(db, speaker)) throw new HttpError(400, "Choose who speaks: a character with a story profile.");
        const fresh = newId("mo");
        db.prepare(
          "INSERT INTO story_moments (id, kind, speaker_id, featured_id, episode_id, plan_id, draft, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(fresh, kind, speaker, idOf(input.featuredId), idOf(input.episodeId), idOf(input.planId), data, actor.id, at, at);
        return { id: fresh };
      }
      case "approve-moment": {
        const m = needMoment();
        const draft = momentData(m);
        const sp = profileRow(db, m.speaker_id);
        const ep = m.episode_id
          ? (db.prepare("SELECT status FROM story_episodes WHERE id = ?").get(m.episode_id) as { status: string } | undefined)
          : undefined;
        const problems = momentProblems(m.kind, draft, { speakerApproved: Boolean(sp?.revision), episodeApproved: ep ? ep.status === "approved" : null });
        if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
        const was = m.revision ? revisionOf(db, m.id, m.revision) : null;
        if (was && JSON.stringify(was.data) === JSON.stringify(draft) && m.status === "approved")
          throw new HttpError(400, "Nothing has changed since the approved version.");
        const number = m.revision + 1;
        // A new revision starts with no recording: audio belongs to the exact words it was made from.
        db.prepare("INSERT INTO story_moment_revisions (moment_id, number, data, approved_by, approved_at) VALUES (?, ?, ?, ?, ?)").run(
          m.id,
          number,
          JSON.stringify(draft),
          actor.id,
          at,
        );
        db.prepare("UPDATE story_moments SET status = 'approved', revision = ?, sample = 0, updated_at = ? WHERE id = ?").run(number, at, m.id);
        audit(db, { actor: actor.id, event: "story.moment_approved", entity: `moment:${m.id}`, next: { revision: number, kind: m.kind }, at: now });
        const behind = (
          db.prepare("SELECT * FROM story_placements WHERE moment_id = ? AND status = 'active' AND revision < ?").all(m.id, number) as PlacementRow[]
        ).map((p) => {
          const l = placeLabel(db, p);
          return `${l.title} (${l.where}) still shows version ${p.revision}`;
        });
        return { id: m.id, revision: number, impact: behind };
      }
      case "moment-status": {
        const m = needMoment();
        const status = input.status === "retired" ? "retired" : m.revision ? "approved" : "draft";
        db.prepare("UPDATE story_moments SET status = ?, updated_at = ? WHERE id = ?").run(status, at, m.id);
        audit(db, { actor: actor.id, event: `story.moment_${status === "retired" ? "retired" : "restored"}`, entity: `moment:${m.id}`, at: now });
        return { id: m.id };
      }
      case "check-audio":
      case "remove-audio": {
        const m = needMoment();
        const rev = m.revision ? revisionOf(db, m.id, m.revision) : null;
        if (!rev) throw new HttpError(400, "There’s no approved version yet.");
        const audio: Audio = input.action === "remove-audio" ? {} : { ...rev.audio, checked: input.on === false ? null : { by: actor.id, at } };
        if (input.action === "check-audio" && !rev.audio.script && !Object.keys(rev.audio.answers ?? {}).length)
          throw new HttpError(400, "There’s no recording to check.");
        db.prepare("UPDATE story_moment_revisions SET audio = ? WHERE moment_id = ? AND number = ?").run(JSON.stringify(audio), m.id, m.revision);
        audit(db, {
          actor: actor.id,
          event: input.action === "remove-audio" ? "story.audio_removed" : "story.audio_checked",
          entity: `moment:${m.id}`,
          next: { revision: m.revision },
          at: now,
        });
        return { id: m.id };
      }
      case "place": {
        const m = needMoment();
        if (m.status !== "approved" || !m.revision)
          throw new HttpError(400, "Approve the moment before placing it: learners only ever see an approved version.");
        const t = placeTarget(db, input.kind, input.ref, input.place);
        const position = input.position === "after" && t.kind === "guide" && !t.place.startsWith("page:") ? "after" : "before";
        db.prepare(
          `INSERT INTO story_placements (id, moment_id, revision, kind, ref, place, position, content_version, placed_by, placed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (moment_id, kind, ref, place) DO UPDATE SET revision = excluded.revision, position = excluded.position, content_version = excluded.content_version, status = 'active', placed_by = excluded.placed_by, placed_at = excluded.placed_at`,
        ).run(newId("pl"), m.id, m.revision, t.kind, t.ref, t.place, position, t.version, actor.id, at);
        audit(db, {
          actor: actor.id,
          event: "story.moment_placed",
          entity: `moment:${m.id}`,
          next: { kind: t.kind, ref: t.ref, place: t.place, revision: m.revision },
          at: now,
        });
        return { id: m.id };
      }
      case "unplace":
      case "repin": {
        const p = db.prepare("SELECT * FROM story_placements WHERE id = ?").get(idOf(input.placementId)) as PlacementRow | undefined;
        if (!p) throw new HttpError(404, "That placement isn’t here.");
        const m = momentRow(db, p.moment_id)!;
        if (input.action === "unplace") db.prepare("UPDATE story_placements SET status = 'retired' WHERE id = ?").run(p.id);
        else db.prepare("UPDATE story_placements SET revision = ?, placed_by = ?, placed_at = ? WHERE id = ?").run(m.revision, actor.id, at, p.id);
        audit(db, {
          actor: actor.id,
          event: input.action === "unplace" ? "story.moment_unplaced" : "story.placement_updated",
          entity: `moment:${m.id}`,
          previous: { revision: p.revision },
          next: { ref: p.ref, place: p.place, revision: m.revision },
          at: now,
        });
        return { id: m.id };
      }
      case "save-plan": {
        const title = str(input.title, 160);
        if (title.length < 4) throw new HttpError(400, "Give the plan a title.");
        const data = cleanPlan(input.data);
        // Choosing against the suggestion is fine; the reason goes on the record.
        const pid = idOf(input.id);
        if (pid) {
          const done = db.prepare("UPDATE story_plans SET title = ?, data = ?, updated_at = ? WHERE id = ?").run(title, JSON.stringify(data), at, pid);
          if (!done.changes) throw new HttpError(404, "That story plan isn’t here.");
          return { id: pid };
        }
        const fresh = newId("plan");
        if (!data.beats.length && data.mode === "story") data.beats = starterBeats();
        db.prepare("INSERT INTO story_plans (id, title, theme_id, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          fresh,
          title,
          idOf(input.themeId),
          JSON.stringify(data),
          actor.id,
          at,
          at,
        );
        return { id: fresh };
      }
      case "plan-from-theme": {
        // Only what the theme's owner has already written down: the behaviour, the barrier and who it's for.
        const t = db.prepare("SELECT id, title, roles, diagnosis FROM pd_themes WHERE id = ?").get(idOf(input.themeId)) as
          { id: string; title: string; roles: string; diagnosis: string } | undefined;
        if (!t) throw new HttpError(404, "That theme isn’t on the Problem desk.");
        const had = db.prepare("SELECT id FROM story_plans WHERE theme_id = ?").get(t.id) as { id: string } | undefined;
        if (had) return { id: had.id };
        const d = JSON.parse(t.diagnosis) as { situation?: string; role?: string; observed?: string; desired?: string; barriers?: { text?: string }[] };
        const data: PlanData = {
          ...emptyPlan(),
          purpose: d.desired ? `${d.role || t.roles || "People"} ${d.desired}${d.situation ? `, when ${d.situation}` : ""}.` : "",
          tension: [d.observed ? `Now: ${d.observed}.` : "", ...(d.barriers ?? []).map((b) => b.text ?? "")].filter(Boolean).join(" "),
          decision: d.desired ?? "",
          beats: starterBeats(),
        };
        const fresh = newId("plan");
        db.prepare("INSERT INTO story_plans (id, title, theme_id, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
          fresh,
          `Story for: ${t.title}`.slice(0, 160),
          t.id,
          JSON.stringify(data),
          actor.id,
          at,
          at,
        );
        return { id: fresh };
      }
      case "delete-plan": {
        db.prepare("DELETE FROM story_plans WHERE id = ? AND sample = 0").run(idOf(input.id));
        return {};
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

/**
  Starts a Magazine draft from a plan's outline: a page for each beat, with the beat's text as a note to write from.
  An ordinary draft. Nothing is published, and the blocks the outline suggests are still the author's to add.
*/
export function courseFromPlan(db: Db, actor: User, planId: unknown, now: Date) {
  const plan = planDetail(db, actor, planId, now);
  if (plan.guide) return { guideId: plan.guide.id };
  if (plan.warnings.some((w) => w.level === "block")) throw new HttpError(400, "Fix the blocked continuity item first.");
  const rid = (p: string) => `${p}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const pages = plan.outline.map((s) => ({
    id: rid("page"),
    title: s.title,
    purpose: `${s.beat}. ${s.blocks.map((b) => `Suggested: ${b.label}.`).join(" ")}`.slice(0, 300),
    template: s.pattern,
    kind: "content",
    required: true,
    sections: [
      { id: rid("sec"), title: s.beat, blocks: [{ id: rid("blk"), type: "text", body: plan.data.beats.find((b) => b.id === s.beatId)?.text || s.title }] },
    ],
  }));
  const guide = createGuide(
    db,
    actor,
    { title: plan.title.slice(0, 80), standfirst: plan.data.purpose.slice(0, 200), ...(pages.length ? { doc: { schema: 2, pages } } : { template: "decide" }) },
    now,
  );
  db.prepare("UPDATE story_plans SET ref_kind = 'course', ref = ?, updated_at = ? WHERE id = ?").run(guide.id, now.toISOString(), plan.id);
  return { guideId: guide.id };
}

/**
  Records the approved script (and each approved answer) in the speaker's voice, as Hub uploads kept against this
  exact revision. Only the approved fictional words are sent to the provider. The recording isn't played to anyone
  until an author has listened and confirmed it matches.
*/
export async function generateStoryAudio(db: Db, actor: User, momentId: unknown, now: Date) {
  requireAuthor(actor);
  ensureStory(db, now);
  const m = momentRow(db, momentId);
  const rev = m?.revision ? revisionOf(db, m.id, m.revision) : null;
  if (!m || !rev || m.status !== "approved") throw new HttpError(400, "Approve the script first: audio is made from approved words only.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'story.audio_generated' AND at > ?").get(actor.id, since) as {
    n: number;
  };
  if (recent.n >= AUDIO_PER_HOUR) throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  const speaker = charRow(db, m.speaker_id);
  const voice = approvedProfile(db, m.speaker_id, profileRow(db, m.speaker_id)?.revision ?? 0)?.voice.id || undefined;
  const clips: { key: string; text: string }[] = [];
  const script = scriptOf(m.kind, rev.data);
  // A transmission with a video carries its own sound.
  if (script && !(m.kind === "opening_transmission" && rev.data.video.src)) clips.push({ key: "script", text: script });
  for (const q of rev.data.questions) clips.push({ key: q.id, text: q.answer });
  if (!clips.length) throw new HttpError(400, "There’s nothing to record.");
  const audio: Audio = {
    voice: voice ?? "narrator",
    voiceName: narratorName(voice),
    at: now.toISOString(),
    by: actor.id,
    script: null,
    answers: {},
    checked: null,
  };
  let characters = 0;
  for (const c of clips) {
    const made = await narration(c.text, voice);
    const saved = await saveUpload(
      db,
      actor,
      new File([new Uint8Array(made.audio)], `Story – ${speaker?.name ?? "character"} – ${c.key}.mp3`, { type: "audio/mpeg" }),
      { width: 0, height: 0 },
      now,
    );
    const seconds = made.words?.length ? Math.round(made.words[made.words.length - 1].end * 10) / 10 : (mp3Seconds(made.audio) ?? 0);
    const clip = { src: saved.src, seconds, hash: textHash(`${voice ?? "narrator"}|${c.text}`) };
    if (c.key === "script") audio.script = clip;
    else audio.answers![c.key] = clip;
    characters += c.text.length;
  }
  db.prepare("UPDATE story_moment_revisions SET audio = ? WHERE moment_id = ? AND number = ?").run(JSON.stringify(audio), m.id, m.revision);
  audit(db, {
    actor: actor.id,
    event: "story.audio_generated",
    entity: `moment:${m.id}`,
    next: { revision: m.revision, clips: clips.length, characters, voice: audio.voiceName },
    at: now,
  });
  return { id: m.id, clips: clips.length };
}

// ---------------------------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------------------------

const mayMeet = (db: Db, user: User, characterId: string) => {
  const p = profileRow(db, characterId);
  if (!p || !p.revision) return false;
  const a = audiences(JSON.parse(p.audience));
  return canAuthor(user) || !a.length || a.includes(user.audience);
};

/** The approved moments placed in one Topic or one Magazine course, each at the revision its placement pinned. */
export function storyFor(db: Db, user: User, input: { topic?: unknown; guide?: unknown }, now = new Date()): { moments: PlacedMoment[] } {
  ensureStory(db, now);
  const topic = str(input.topic, 80);
  const guide = str(input.guide, 80);
  let rows: PlacementRow[] = [];
  if (topic) {
    if (!lessonBySlug(topic)) return { moments: [] };
    rows = db.prepare("SELECT * FROM story_placements WHERE kind = 'topic' AND ref = ? AND status = 'active' ORDER BY placed_at").all(topic) as PlacementRow[];
  } else if (guide) {
    const g =
      guideRow(db, guide) ??
      (db.prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE slug = ?").get(guide) as GuideRow | undefined);
    // Outside the audience looks the same as nothing being there.
    if (!g || g.status === "archived" || !canRead(user, g)) return { moments: [] };
    rows = db.prepare("SELECT * FROM story_placements WHERE kind = 'guide' AND ref = ? AND status = 'active' ORDER BY placed_at").all(g.id) as PlacementRow[];
  }
  const moments: PlacedMoment[] = [];
  for (const p of rows) {
    const m = momentRow(db, p.moment_id);
    const rev = m && m.status === "approved" ? revisionOf(db, m.id, p.revision) : null;
    const speaker = m && charRow(db, m.speaker_id);
    if (!m || !rev || !speaker || !mayMeet(db, user, m.speaker_id)) continue;
    const featured = m.featured_id && mayMeet(db, user, m.featured_id) ? charRow(db, m.featured_id) : undefined;
    const d = rev.data;
    const checked = Boolean(rev.audio.checked);
    moments.push({
      placementId: p.id,
      momentId: m.id,
      revision: p.revision,
      kind: m.kind,
      place: p.place,
      position: p.position,
      speaker: { id: speaker.id, name: speaker.name, role: approvedProfile(db, speaker.id, profileRow(db, speaker.id)!.revision)?.narrativeRole ?? "" },
      featured: featured ? { id: featured.id, name: featured.name } : null,
      whenLabel: d.whenLabel,
      role: d.role,
      script: scriptOf(m.kind, d),
      nextAction: d.nextAction,
      instruction: d.beats.instruction,
      questions: d.questions,
      hypothetical: d.hypothetical,
      video:
        m.kind === "opening_transmission" && d.video.src && d.video.checked
          ? { src: d.video.src, poster: d.video.poster, captions: d.video.captions, endFrame: d.video.endFrame }
          : null,
      audio: {
        script: checked ? (rev.audio.script?.src ?? null) : null,
        answers: checked ? Object.fromEntries(Object.entries(rev.audio.answers ?? {}).map(([k, v]) => [k, v.src])) : {},
      },
    });
  }
  return { moments };
}

/**
  A character's story for a learner: who they are, and the appearances this person may open, in story order, up to
  where the moment they came from sits. Later ones are counted, and only listed when asked for. Anything outside
  the learner's access is left out entirely: no title, no summary, no count.
*/
export function characterHistory(
  db: Db,
  user: User,
  characterId: unknown,
  input: { placement?: unknown; episode?: unknown; later?: unknown },
  now = new Date(),
) {
  ensureStory(db, now);
  const c = charRow(db, characterId);
  if (!c || !mayMeet(db, user, c.id)) throw new HttpError(404, "That character isn’t here.");
  const profile = approvedProfile(db, c.id, profileRow(db, c.id)!.revision)!;
  const episodes = new Map(
    allEpisodes(db)
      .filter((e) => e.status === "approved")
      .map((e) => [e.id, e]),
  );
  const placement = idOf(input.placement)
    ? (db.prepare("SELECT * FROM story_placements WHERE id = ?").get(idOf(input.placement)) as PlacementRow | undefined)
    : undefined;
  // Where the learner is in the story: the moment they came from, or (from Ava Relay) the episode their page sits at.
  const context = placement ? episodes.get(momentRow(db, placement.moment_id)?.episode_id ?? "") : episodes.get(idOf(input.episode));
  const items: HistoryItem[] = [];
  for (const a of db.prepare("SELECT * FROM story_appearances WHERE character_id = ? AND status = 'active'").all(c.id) as AppearanceRow[]) {
    const e = episodes.get(a.episode_id);
    if (!e) continue;
    let href = "";
    if (a.kind === "topic") {
      if (!lessonBySlug(a.ref) || missionLock(db, user, a.ref, now)) continue;
      href = `/topics/${a.ref}`;
    } else if (a.kind === "other") href = a.href;
    else {
      const g = guideRow(db, a.ref);
      if (!g || g.status !== "published" || !g.revision_id || !canRead(user, g)) continue;
      href = `/magazine/${g.slug}${a.kind === "page" && a.page_id ? `/${a.page_id}` : ""}`;
    }
    items.push({
      id: a.id,
      episodeId: e.id,
      seq: e.seq,
      whenLabel: e.whenLabel,
      title: e.title,
      summary: a.summary || e.summary,
      format: FORMATS[a.kind],
      href,
      role: a.type,
    });
  }
  const { upTo, later } = splitHistory(items, context ? context.seq : null);
  return {
    character: {
      id: c.id,
      name: c.name,
      narrativeRole: profile.narrativeRole,
      summary: profile.summary,
      matters: profile.matters,
      fictional: profile.provenance === "fictional" ? "A fictional character" : "A fictional character, based on a reviewed composite",
    },
    context: context ? { title: context.title, whenLabel: context.whenLabel } : null,
    upTo,
    laterCount: later.length,
    later: input.later === true || input.later === "1" ? later : [],
  };
}
export type CharacterHistory = ReturnType<typeof characterHistory>;

/**
  What the story report (server/storyReport) is built on: who has a story, every moment and where it's placed, every
  appearance and whether its link still opens, and every plan with what the rules say about it. No learner data.
*/
export function reportBasis(db: Db, actor: User, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const cast = castOf(db);
  const episodes = allEpisodes(db);
  const momentRows = db.prepare("SELECT * FROM story_moments ORDER BY created_at").all() as MomentRow[];
  const moments = momentRows.map((m) => ({
    id: m.id,
    kind: m.kind,
    title: momentData(m).title || MOMENT_KINDS[m.kind],
    status: m.status,
    revision: m.revision,
    speakerId: m.speaker_id,
    featuredId: m.featured_id,
    episodeId: m.episode_id,
    planId: m.plan_id,
  }));
  const placements = (db.prepare("SELECT * FROM story_placements WHERE status = 'active' ORDER BY placed_at").all() as PlacementRow[]).map((pl) => {
    const m = momentRows.find((x) => x.id === pl.moment_id);
    return {
      id: pl.id,
      momentId: pl.moment_id,
      revision: pl.revision,
      kind: pl.kind,
      ref: pl.ref,
      place: pl.place,
      behind: Boolean(m && pl.revision < m.revision),
      ...placeLabel(db, pl),
    };
  });
  const appearances = (db.prepare("SELECT * FROM story_appearances WHERE status = 'active'").all() as AppearanceRow[]).map((ap) => {
    const label = appearanceLabel(db, ap);
    // A link learners can't follow: the Topic has gone, or the course isn't published.
    const g = ap.kind === "course" || ap.kind === "page" ? guideRow(db, ap.ref) : undefined;
    const open = ap.kind === "other" ? true : ap.kind === "topic" ? Boolean(lessonBySlug(ap.ref)) : Boolean(g && g.status === "published" && g.revision_id);
    return { id: ap.id, characterId: ap.character_id, episodeId: ap.episode_id, format: FORMATS[ap.kind], label: label.label, open };
  });
  const forRules = moments
    .filter((m) => m.status !== "retired")
    .map((m) => ({ id: m.id, kind: m.kind, status: m.status, title: m.title, speakerId: m.speakerId, planId: m.planId }));
  const plans = (db.prepare("SELECT * FROM story_plans ORDER BY created_at").all() as PlanRow[]).map((row) => {
    const data = { ...emptyPlan(), ...cleanPlan(JSON.parse(row.data)) };
    const fits = suggestCharacters(
      { behaviour: `${data.purpose} ${data.decision}`, situation: data.perspective, tension: data.tension, audience: data.audience },
      cast,
    ).fits;
    const guide = row.ref_kind === "course" && row.ref ? guideRow(db, row.ref) : undefined;
    return {
      id: row.id,
      title: row.title,
      sample: Boolean(row.sample),
      themeId: row.theme_id,
      guide: guide ? { id: guide.id, title: guide.title, published: guide.status === "published" } : null,
      mode: data.mode,
      anchorId: data.anchorId,
      /** The character the rules rank first for this brief, when one connects at all. */
      topFit: fits[0] && fits[0].score > 0 ? fits[0].id : "",
      openWarnings: continuityCheck(data, cast, episodes, forRules).filter((w) => !data.resolved[w.id]).length,
      /** The plan promises a decision, and nothing at its choice beat lets the learner practise one. */
      choiceUnpractised:
        data.mode === "story" &&
        data.beats.some((x) => x.kind === "choice" && (x.text || x.action)) &&
        !data.beats.some((x) => x.kind === "choice" && x.evidence !== "explanation"),
    };
  });
  return {
    characters: cast.map((c) => ({ id: c.id, name: c.name, approved: c.approved })),
    episodes: episodes.map((e) => ({ id: e.id, title: e.title, whenLabel: e.whenLabel, seq: e.seq, status: e.status })),
    moments,
    placements,
    appearances,
    plans,
  };
}

/**
  Approved canon for Ava Relay (server/relay): Ava herself, and the people an author chose for a page, each at the
  approved profile version chosen (or the current one if that has gone). Episodes come only up to where the page
  sits in the story; with no episode chosen, none are given. A person outside the learner's audience is left out.
*/
export function relayCanon(db: Db, user: User, input: { picks: { id: string; revision: number }[]; episode: string }, now = new Date()) {
  ensureStory(db, now);
  const approved = allEpisodes(db).filter((e) => e.status === "approved");
  const at = approved.find((e) => e.id === input.episode) ?? null;
  const person = (id: string, revision: number) => {
    const c = charRow(db, id);
    const row = c && profileRow(db, c.id);
    if (!c || !row || !row.revision || !mayMeet(db, user, c.id)) return null;
    const number = revision > 0 && revision <= row.revision ? revision : row.revision;
    const profile = approvedProfile(db, c.id, number) ?? approvedProfile(db, c.id, row.revision);
    if (!profile) return null;
    return { id: c.id, name: c.name, portrait: c.hidden ? "" : (c.portrait ?? ""), revision: number, current: row.revision, profile };
  };
  const ava = person("ava", 0);
  const people = input.picks
    .filter((p) => p.id !== "ava")
    .flatMap((p) => {
      const found = person(p.id, p.revision);
      if (!found) return [];
      const episodes = at ? approved.filter((e) => e.seq <= at.seq && e.people.some((x) => x.characterId === found.id)) : [];
      return [{ ...found, episodes: episodes.map((e) => ({ id: e.id, title: e.title, whenLabel: e.whenLabel, summary: e.summary, changes: e.changes })) }];
    });
  return {
    ava,
    people,
    episode: at ? { id: at.id, title: at.title, whenLabel: at.whenLabel, seq: at.seq } : null,
    /** How many approved episodes sit later in the story than this page: held back, and only ever counted. */
    later: at ? approved.filter((e) => e.seq > at.seq).length : 0,
  };
}
export type RelayCanon = ReturnType<typeof relayCanon>;

/** For the Magazine editor's Ava Relay settings: the approved people and episodes an author can choose from. */
export function relayChoices(db: Db, actor: User, now = new Date()) {
  requireAuthor(actor);
  ensureStory(db, now);
  const people = (
    db.prepare("SELECT character_id, revision FROM character_profiles WHERE revision > 0").all() as { character_id: string; revision: number }[]
  ).flatMap((r) => {
    const c = charRow(db, r.character_id);
    const profile = c && approvedProfile(db, c.id, r.revision);
    return c && profile ? [{ id: c.id, name: c.name, revision: r.revision, role: profile.narrativeRole, facts: profile.facts.map((f) => f.text) }] : [];
  });
  return {
    ava: people.find((x) => x.id === "ava") ?? null,
    people: people.filter((x) => x.id !== "ava"),
    episodes: allEpisodes(db)
      .filter((e) => e.status === "approved")
      .map((e) => ({ id: e.id, title: e.title, whenLabel: e.whenLabel, seq: e.seq, people: e.people.map((x) => x.characterId) })),
  };
}

/** One engagement event. Sending it again with the same key records nothing new. */
export function recordStoryEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureStory(db, now);
  const event = STORY_EVENTS.find((e) => e === input.event);
  if (!event) throw new HttpError(400, "Unknown event.");
  const p = idOf(input.placementId)
    ? (db.prepare("SELECT * FROM story_placements WHERE id = ?").get(idOf(input.placementId)) as PlacementRow | undefined)
    : undefined;
  const m = p ? momentRow(db, p.moment_id) : undefined;
  const occurred = typeof input.at === "string" && !Number.isNaN(Date.parse(input.at)) ? new Date(input.at).toISOString() : now.toISOString();
  const key = typeof input.key === "string" && /^[A-Za-z0-9-]{8,100}$/.test(input.key) ? `${user.id}:${input.key}` : null;
  const done = db
    .prepare(
      "INSERT OR IGNORE INTO story_events (at, received_at, user_id, audience, event, character_id, moment_id, revision, kind, ref, place, detail, idem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      occurred,
      now.toISOString(),
      user.id,
      user.audience,
      event,
      idOf(input.characterId) || m?.speaker_id || "",
      m?.id ?? "",
      p?.revision ?? 0,
      p?.kind ?? "",
      p?.ref ?? "",
      p?.place ?? "",
      str(input.detail, 80),
      key,
    );
  return { recorded: Boolean(done.changes) };
}
