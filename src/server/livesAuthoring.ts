import "server-only";
import { randomUUID } from "node:crypto";
import {
  ARC_MOVES,
  BIBLE_SECTIONS,
  cleanArc,
  cleanBible,
  cleanCast,
  cleanEpisode,
  cleanId,
  cleanLifeEvent,
  cleanLivesSettings,
  consistencyCheck,
  EPISODE_MOVES,
  episodeProblems,
  isOut,
  type Arc,
  type ArcState,
  type Bible,
  type DiaryAudio,
  type Episode,
  type EpisodeState,
} from "@/lib/livesInProgress";
import { speechCost, textHash } from "@/lib/magazineNarration";
import { DIGITAL_GROUPS, DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { ensureCharacters } from "./characters";
import { catalogueInfo } from "./learningPaths";
import { mp3Seconds, openaiReady, openaiSpeechModel } from "./openaiText";
import { narration, ttsConfig } from "./tts";
import { saveUpload } from "./uploads";
import {
  approvedBible,
  arcOf,
  bibleFromIntroduction,
  ensureLives,
  episodeOf,
  lifeEvents,
  livesDemoEnabled,
  livesSettings,
  memberArcs,
  memberCast,
  memberEpisodes,
  notifyFollowers,
  publishDueEpisodes,
  SETTINGS_KEY,
  type ArcRow,
  type EpisodeRow,
} from "./livesInProgress";

/*
  Lives in Progress for authors (Admin → Lives in Progress, docs/lives-in-progress.md): Character Bibles with
  approved versions, the supporting cast, the Life Event Bank, Story Arcs and their episodes through draft, review,
  approval, scheduling and publication, audio diaries, the memory settings and the report.

  Nothing a learner wrote is shown here: the report counts conversations and memories, never their words.
*/

const newId = (p: string) => `${p}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const DIARY_PER_HOUR = 40;

const memberName = (db: Db, id: string) => (db.prepare("SELECT name FROM characters WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;
const userName = (db: Db, id: string | null) =>
  !id ? "" : id === "seed" ? "Demo content" : ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id);

function requireMember(db: Db, id: unknown) {
  const memberId = cleanId(id);
  if (!memberId || !DIGITAL_MEMBERS.some((m) => m.id === memberId)) throw new HttpError(404, "That digital member isn’t here.");
  return memberId;
}

const episodeRow = (db: Db, id: unknown) => db.prepare("SELECT * FROM lip_episodes WHERE id = ?").get(cleanId(id)) as EpisodeRow | undefined;
const arcRow = (db: Db, id: unknown) => db.prepare("SELECT * FROM lip_arcs WHERE id = ?").get(cleanId(id)) as ArcRow | undefined;

// ---------------------------------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------------------------------

/** Everything the admin page needs: members and their Bibles' state, arcs with episodes, cast, events, settings. */
export function livesAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureLives(db, now);
  ensureCharacters(db);
  publishDueEpisodes(db, now);
  const chars = new Map(
    (db.prepare("SELECT id, name, portrait, hidden FROM characters").all() as { id: string; name: string; portrait: string; hidden: number }[]).map((c) => [
      c.id,
      c,
    ]),
  );
  const bibles = new Map(
    (
      db.prepare("SELECT character_id, draft, approved, version, approved_at FROM lip_bibles").all() as {
        character_id: string;
        draft: string;
        approved: string | null;
        version: number;
        approved_at: string | null;
      }[]
    ).map((b) => [b.character_id, b]),
  );
  const arcs = (db.prepare("SELECT * FROM lip_arcs ORDER BY member_id, created_at").all() as ArcRow[]).map(arcOf);
  const episodes = (db.prepare("SELECT * FROM lip_episodes ORDER BY arc_id, number").all() as EpisodeRow[]).map(episodeOf);
  const members = DIGITAL_MEMBERS.filter((m) => chars.get(m.id) && !chars.get(m.id)!.hidden).map((m) => {
    const b = bibles.get(m.id);
    const live = episodes.filter((e) => e.memberId === m.id && isOut(e, now)).sort((a, z) => a.publishAt.localeCompare(z.publishAt));
    return {
      id: m.id,
      name: chars.get(m.id)!.name,
      portrait: chars.get(m.id)!.portrait,
      group: DIGITAL_GROUPS.find((g) => g.id === m.group)?.label ?? "",
      bible: !b ? "none" : !b.approved ? "draft" : b.approved !== b.draft ? "changed" : "approved",
      bibleVersion: b?.version ?? 0,
      arcs: arcs.filter((a) => a.memberId === m.id && a.status !== "archived").length,
      live: live.at(-1) ? { number: live.at(-1)!.number, title: live.at(-1)!.title } : null,
    };
  });
  const castAll = (
    db.prepare("SELECT id, member_id, data, sample FROM lip_cast WHERE archived = 0 ORDER BY member_id, rowid").all() as {
      id: string;
      member_id: string;
      data: string;
      sample: number;
    }[]
  ).map((r) => ({ ...JSON.parse(r.data), id: r.id, memberId: r.member_id, sample: Boolean(r.sample) }));
  const memory = db
    .prepare("SELECT COUNT(*) AS memories, COUNT(DISTINCT user_id) AS learners FROM lip_memories WHERE expires_at > ?")
    .get(now.toISOString()) as {
    memories: number;
    learners: number;
  };
  return {
    members,
    arcs: arcs.map((a) => {
      const eps = episodes.filter((e) => e.arcId === a.id);
      return {
        ...a,
        memberName: chars.get(a.memberId)?.name ?? a.memberId,
        authorName: userName(db, a.author),
        approvedByName: userName(db, a.approvedBy),
        episodes: eps.map((e) => ({ ...e, approvedByName: userName(db, e.approvedBy), hearable: Boolean(e.audio?.checked) })),
        issues: consistencyCheck({ bible: approvedBible(db, a.memberId), cast: castAll.filter((c) => c.memberId === a.memberId), episodes: eps }),
      };
    }),
    cast: castAll,
    events: lifeEvents(db),
    settings: livesSettings(db),
    demo: { enabled: livesDemoEnabled(), seeded: Boolean(db.prepare("SELECT 1 FROM settings WHERE key = 'lives_demo_seed'").get()) },
    voice: voiceStatus(),
    links: learningLinks(db),
    memory,
  };
}

function voiceStatus() {
  const { apiKey, modelId } = ttsConfig();
  return { elevenlabs: Boolean(apiKey), openai: openaiReady(), elevenModel: modelId, openaiModel: openaiSpeechModel() };
}

/** Learning an episode can link to: published Topics, Magazine courses and Discovery Paths. */
function learningLinks(db: Db) {
  const topics = catalogueInfo(db)
    .filter((l) => !l.draft && l.track !== "reinforcement")
    .map((l) => ({ kind: "topic" as const, title: l.title, href: `/topics/${l.slug}` }));
  const magazine = (
    db.prepare("SELECT slug, title FROM magazine_guides WHERE status = 'published' ORDER BY title").all() as { slug: string; title: string }[]
  ).map((g) => ({ kind: "magazine" as const, title: g.title, href: `/magazine/${g.slug}` }));
  const paths = (db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { id: string; name: string }[]).map((p) => ({
    kind: "path" as const,
    title: p.name,
    href: `/discovery/${p.id}`,
  }));
  return [...topics, ...magazine, ...paths];
}

// ---------------------------------------------------------------------------------------------
// Character Bibles
// ---------------------------------------------------------------------------------------------

/** One member's Bible: the working draft (or one started from their introduction), the approved version and its history. */
export function livesBible(db: Db, actor: User, memberIdRaw: unknown, now: Date) {
  requireAuthor(actor);
  ensureLives(db, now);
  const memberId = requireMember(db, memberIdRaw);
  const r = db.prepare("SELECT * FROM lip_bibles WHERE character_id = ?").get(memberId) as
    | {
        draft: string;
        approved: string | null;
        version: number;
        approved_by: string | null;
        approved_at: string | null;
        updated_at: string;
        updated_by: string;
      }
    | undefined;
  const draft = r ? cleanBible(JSON.parse(r.draft)) : bibleFromIntroduction(db, memberId);
  const approved = r?.approved ? cleanBible(JSON.parse(r.approved)) : null;
  return {
    memberId,
    name: memberName(db, memberId),
    draft,
    approved,
    saved: Boolean(r),
    version: r?.version ?? 0,
    approvedBy: userName(db, r?.approved_by ?? null),
    approvedAt: r?.approved_at ?? null,
    changes: approved ? bibleChanges(approved, draft) : [],
    versions: (
      db.prepare("SELECT version, note, approved_by, approved_at FROM lip_bible_versions WHERE character_id = ? ORDER BY version DESC").all(memberId) as {
        version: number;
        note: string;
        approved_by: string;
        approved_at: string;
      }[]
    ).map((v) => ({ version: v.version, note: v.note, by: userName(db, v.approved_by), at: v.approved_at })),
    cast: memberCast(db, memberId),
  };
}

/** What a draft changes from the approved Bible, field by field, so whoever approves it knows. */
export function bibleChanges(approved: Bible, draft: Bible): string[] {
  const out: string[] = [];
  for (const s of BIBLE_SECTIONS)
    for (const [k, label] of s.fields) {
      const a = (approved[s.key] as Record<string, string>)[k];
      const d = (draft[s.key] as Record<string, string>)[k];
      if (a !== d) out.push(`${s.label} · ${label}${!a ? " added" : !d ? " removed" : " changed"}`);
    }
  if (approved.media.voiceId !== draft.media.voiceId) out.push("The voice changed: every recording keeps its old voice until it’s made again.");
  if (approved.media.portrait !== draft.media.portrait) out.push("The permanent profile image changed.");
  if (approved.media.delivery !== draft.media.delivery) out.push("How the voice is delivered changed.");
  if (approved.media.visualGuide !== draft.media.visualGuide) out.push("The visual guide changed.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/**
  Every change an author makes, by `action`. Each is audited. Learners see only approved Bibles and episodes that are
  out; nothing here publishes an episode before its time except "publish now" on an approved one.
*/
export function livesAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureLives(db, now);
  const at = now.toISOString();
  const action = String(input.action ?? "");
  const log = (event: string, entity: string, next?: unknown, previous?: unknown, reason?: string) =>
    audit(db, { actor: actor.id, event: `lives.${event}`, entity, next, previous, reason, at: now });

  switch (action) {
    // ---- Bibles ----
    case "bible.save": {
      const memberId = requireMember(db, input.memberId);
      const data = JSON.stringify(cleanBible(input.bible));
      db.prepare(
        `INSERT INTO lip_bibles (character_id, draft, version, updated_by, updated_at) VALUES (?, ?, 0, ?, ?)
         ON CONFLICT (character_id) DO UPDATE SET draft = excluded.draft, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      ).run(memberId, data, actor.id, at);
      log("bible_saved", `member:${memberId}`);
      return livesBible(db, actor, memberId, now);
    }
    case "bible.approve": {
      const memberId = requireMember(db, input.memberId);
      const r = db.prepare("SELECT draft, approved, version FROM lip_bibles WHERE character_id = ?").get(memberId) as
        { draft: string; approved: string | null; version: number } | undefined;
      if (!r) throw new HttpError(400, "Save the Bible first.");
      const draft = cleanBible(JSON.parse(r.draft));
      if (!draft.identity.fullName || !draft.personality.traits) throw new HttpError(400, "Add at least their name and their traits before approving.");
      const note = String(input.note ?? "")
        .trim()
        .slice(0, 300);
      const changes = r.approved ? bibleChanges(cleanBible(JSON.parse(r.approved)), draft) : ["First approved version."];
      if (r.approved && !changes.length) throw new HttpError(400, "Nothing has changed since the approved version.");
      if (r.approved && !note) throw new HttpError(400, "Say why the approved Bible is changing: it changes how the character speaks to everyone.");
      const version = r.version + 1;
      tx(db, () => {
        db.prepare("UPDATE lip_bibles SET approved = draft, version = ?, approved_by = ?, approved_at = ? WHERE character_id = ?").run(
          version,
          actor.id,
          at,
          memberId,
        );
        db.prepare("INSERT INTO lip_bible_versions (character_id, version, data, note, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?)").run(
          memberId,
          version,
          r.draft,
          note,
          actor.id,
          at,
        );
      });
      log("bible_approved", `member:${memberId}`, { version, changes }, undefined, note);
      return livesBible(db, actor, memberId, now);
    }

    // ---- Supporting cast ----
    case "cast.save": {
      const memberId = requireMember(db, input.memberId);
      const c = cleanCast(input.cast, memberId);
      if (!c.name || !c.relation) throw new HttpError(400, "Give them a name and say how they’re connected.");
      const id = c.id && db.prepare("SELECT 1 FROM lip_cast WHERE id = ? AND member_id = ?").get(c.id, memberId) ? c.id : newId("cast");
      db.prepare(
        `INSERT INTO lip_cast (id, member_id, data, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at, archived = 0`,
      ).run(id, memberId, JSON.stringify({ ...c, id }), actor.id, at);
      log("cast_saved", `cast:${id}`);
      return { id };
    }
    case "cast.archive": {
      const id = cleanId(input.id);
      db.prepare("UPDATE lip_cast SET archived = 1, updated_by = ?, updated_at = ? WHERE id = ?").run(actor.id, at, id);
      log("cast_archived", `cast:${id}`);
      return { id };
    }

    // ---- Life Event Bank ----
    case "event.save": {
      const e = cleanLifeEvent(input.event);
      if (!e.title || !e.summary) throw new HttpError(400, "Give the event a title and a summary.");
      const id = e.id && db.prepare("SELECT 1 FROM lip_life_events WHERE id = ?").get(e.id) ? e.id : newId("le");
      db.prepare(
        `INSERT INTO lip_life_events (id, data, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at, archived = 0`,
      ).run(id, JSON.stringify({ ...e, id }), actor.id, at);
      log("event_saved", `life_event:${id}`);
      return { id };
    }
    case "event.archive": {
      const id = cleanId(input.id);
      db.prepare("UPDATE lip_life_events SET archived = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(input.restore === true ? 0 : 1, actor.id, at, id);
      log(input.restore === true ? "event_restored" : "event_archived", `life_event:${id}`);
      return { id };
    }

    // ---- Arcs ----
    case "arc.save": {
      const a = cleanArc(input.arc);
      const existing = a.id ? arcRow(db, a.id) : undefined;
      const memberId = existing?.member_id ?? requireMember(db, a.memberId);
      if (!a.title) throw new HttpError(400, "Give the arc a title.");
      const id = existing?.id ?? newId("arc");
      const data = JSON.stringify({ ...a, id, memberId });
      tx(db, () => {
        if (a.primary) db.prepare("UPDATE lip_arcs SET is_primary = 0 WHERE member_id = ? AND id != ?").run(memberId, id);
        if (existing)
          db.prepare(
            "UPDATE lip_arcs SET data = ?, is_primary = ?, status = CASE WHEN status = 'approved' THEN 'draft' ELSE status END, updated_at = ? WHERE id = ?",
          ).run(data, a.primary ? 1 : 0, at, id);
        else
          db.prepare(
            "INSERT INTO lip_arcs (id, member_id, data, status, is_primary, author, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)",
          ).run(id, memberId, data, a.primary ? 1 : 0, actor.id, at, at);
      });
      log(existing ? "arc_saved" : "arc_created", `arc:${id}`);
      return { id };
    }
    case "arc.status": {
      const r = arcRow(db, input.id);
      if (!r) throw new HttpError(404, "That arc isn’t here.");
      const to = String(input.status) as ArcState;
      if (!ARC_MOVES[r.status]?.includes(to)) throw new HttpError(400, `An arc that’s ${r.status.replace("_", " ")} can’t go to ${to.replace("_", " ")}.`);
      const a = arcOf(r);
      if ((to === "in_review" || to === "approved") && (!a.summary || !a.theme)) throw new HttpError(400, "Add the arc’s summary and central theme first.");
      db.prepare("UPDATE lip_arcs SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(
        to,
        to === "approved" ? actor.id : r.approved_by,
        to === "approved" ? at : r.approved_at,
        at,
        r.id,
      );
      log("arc_status", `arc:${r.id}`, { status: to }, { status: r.status });
      return { id: r.id, status: to };
    }
    case "arc.duplicate": {
      const r = arcRow(db, input.id);
      if (!r) throw new HttpError(404, "That arc isn’t here.");
      const a = arcOf(r);
      const id = newId("arc");
      tx(db, () => {
        const copy: Arc = { ...cleanArc(a), id, title: `${a.title} (copy)`, primary: false, startDate: "", endDate: "" };
        db.prepare("INSERT INTO lip_arcs (id, member_id, data, status, is_primary, author, created_at, updated_at) VALUES (?, ?, ?, 'draft', 0, ?, ?, ?)").run(
          id,
          a.memberId,
          JSON.stringify(copy),
          actor.id,
          at,
          at,
        );
        for (const e of memberEpisodes(db, a.memberId).filter((x) => x.arcId === a.id && x.status !== "archived")) {
          const eid = newId("ep");
          const data = { ...cleanEpisode(e), id: eid, arcId: id, publishAt: "" };
          db.prepare(
            "INSERT INTO lip_episodes (id, arc_id, member_id, number, publish_at, status, data, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, '', 'draft', ?, ?, ?, ?, ?)",
          ).run(eid, id, a.memberId, e.number, JSON.stringify(data), actor.id, at, actor.id, at);
        }
      });
      log("arc_duplicated", `arc:${id}`, { from: a.id });
      return { id };
    }

    // ---- Episodes ----
    case "episode.new": {
      const r = arcRow(db, input.arcId);
      if (!r) throw new HttpError(404, "That arc isn’t here.");
      const last = db.prepare("SELECT MAX(number) AS n, MAX(publish_at) AS at FROM lip_episodes WHERE arc_id = ?").get(r.id) as {
        n: number | null;
        at: string | null;
      };
      const id = newId("ep");
      const number = (last.n ?? 0) + 1;
      const publishAt = last.at ? new Date(Date.parse(last.at) + 7 * 86_400_000).toISOString() : "";
      const data = {
        ...cleanEpisode({ title: String(input.title ?? "").slice(0, 120) || `Episode ${number}` }),
        id,
        arcId: r.id,
        memberId: r.member_id,
        number,
        publishAt,
      };
      db.prepare(
        "INSERT INTO lip_episodes (id, arc_id, member_id, number, publish_at, status, data, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)",
      ).run(id, r.id, r.member_id, number, publishAt, JSON.stringify(data), actor.id, at, actor.id, at);
      log("episode_created", `episode:${id}`);
      return { id };
    }
    case "episode.save": {
      const r = episodeRow(db, (input.episode as { id?: unknown } | undefined)?.id);
      if (!r) throw new HttpError(404, "That episode isn’t here.");
      const e = cleanEpisode(input.episode);
      const before = episodeOf(r);
      const reason = String(input.reason ?? "")
        .trim()
        .slice(0, 300);
      // A published episode can be corrected, with a reason; anything approved goes back to draft to be approved again.
      if (r.status === "published" && !reason) throw new HttpError(400, "This episode is out. Say what you’re correcting and why.");
      if (r.status === "archived") throw new HttpError(400, "Restore the episode to a draft first.");
      const status: EpisodeState = r.status === "approved" || r.status === "scheduled" || r.status === "in_review" ? "draft" : r.status;
      const data = { ...e, id: r.id, arcId: r.arc_id, memberId: r.member_id };
      db.prepare("UPDATE lip_episodes SET number = ?, publish_at = ?, data = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
        e.number,
        e.publishAt,
        JSON.stringify(data),
        status,
        actor.id,
        at,
        r.id,
      );
      log(r.status === "published" ? "episode_corrected" : "episode_saved", `episode:${r.id}`, { status }, { status: r.status }, reason || undefined);
      return { id: r.id, status, sentBack: status !== before.status };
    }
    case "episode.status": {
      const r = episodeRow(db, input.id);
      if (!r) throw new HttpError(404, "That episode isn’t here.");
      const to = String(input.status) as EpisodeState;
      if (!EPISODE_MOVES[r.status]?.includes(to))
        throw new HttpError(400, `An episode that’s ${r.status.replace("_", " ")} can’t go to ${to.replace("_", " ")}.`);
      const e = episodeOf(r);
      if (to === "in_review" || to === "approved" || to === "scheduled" || to === "published") {
        const problems = episodeProblems(e);
        if (problems.length) throw new HttpError(400, `This episode isn’t ready yet. ${problems.join(" ")}`);
      }
      const arc = arcRow(db, r.arc_id);
      if ((to === "scheduled" || to === "published") && arc?.status !== "approved") throw new HttpError(400, "Approve the arc before its episodes go out.");
      if (to === "scheduled" && Date.parse(e.publishAt) <= now.getTime()) throw new HttpError(400, "That time has passed. Choose a later one, or publish now.");
      let publishAt = r.publish_at;
      if (to === "published" && (!publishAt || Date.parse(publishAt) > now.getTime())) publishAt = at;
      const note = String(input.note ?? "")
        .trim()
        .slice(0, 500);
      db.prepare(
        `UPDATE lip_episodes SET status = ?, publish_at = ?, review_note = CASE WHEN ? != '' THEN ? ELSE review_note END,
           approved_by = CASE WHEN ? IN ('approved','scheduled','published') AND approved_by IS NULL THEN ? WHEN ? IN ('draft','in_review') THEN NULL ELSE approved_by END,
           approved_at = CASE WHEN ? IN ('approved','scheduled','published') AND approved_at IS NULL THEN ? WHEN ? IN ('draft','in_review') THEN NULL ELSE approved_at END,
           published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
           updated_by = ?, updated_at = ? WHERE id = ?`,
      ).run(to, publishAt, note, note, to, actor.id, to, to, at, to, to, at, actor.id, at, r.id);
      log("episode_status", `episode:${r.id}`, { status: to, publishAt }, { status: r.status }, note || undefined);
      if (to === "published") notifyFollowers(db, { ...e, publishAt, status: "published" }, now);
      return { id: r.id, status: to };
    }
    case "episode.move": {
      const r = episodeRow(db, input.id);
      if (!r) throw new HttpError(404, "That episode isn’t here.");
      const dir = input.dir === "up" ? -1 : 1;
      const other = db.prepare("SELECT * FROM lip_episodes WHERE arc_id = ? AND number = ?").get(r.arc_id, r.number + dir) as EpisodeRow | undefined;
      if (!other) return { id: r.id };
      if (r.status === "published" || other.status === "published") throw new HttpError(400, "Episodes that are out keep their place.");
      const swap = (row: EpisodeRow, n: number) => {
        const d = JSON.parse(row.data) as Episode;
        db.prepare("UPDATE lip_episodes SET number = ?, data = ?, updated_at = ? WHERE id = ?").run(n, JSON.stringify({ ...d, number: n }), at, row.id);
      };
      tx(db, () => {
        swap(r, other.number);
        swap(other, r.number);
      });
      log("episode_moved", `episode:${r.id}`, { number: other.number });
      return { id: r.id };
    }
    case "episode.delete": {
      const r = episodeRow(db, input.id);
      if (!r) throw new HttpError(404, "That episode isn’t here.");
      if (r.status !== "draft") throw new HttpError(400, "Only a draft can be deleted. Archive it instead.");
      db.prepare("DELETE FROM lip_episodes WHERE id = ?").run(r.id);
      log("episode_deleted", `episode:${r.id}`, undefined, { title: episodeOf(r).title });
      return { id: r.id };
    }
    case "audio.check": {
      const r = episodeRow(db, input.id);
      const audio = r?.audio ? (JSON.parse(r.audio) as DiaryAudio) : null;
      if (!r || !audio) throw new HttpError(400, "There’s no recording to check.");
      if (input.ok !== true) throw new HttpError(400, "Tick that you’ve listened and it matches the script.");
      const checked = { ...audio, checked: { by: actor.id, at } };
      db.prepare("UPDATE lip_episodes SET audio = ? WHERE id = ?").run(JSON.stringify(checked), r.id);
      log("diary_checked", `episode:${r.id}`);
      return { id: r.id };
    }
    case "audio.remove": {
      const r = episodeRow(db, input.id);
      if (!r) throw new HttpError(404, "That episode isn’t here.");
      db.prepare("UPDATE lip_episodes SET audio = NULL WHERE id = ?").run(r.id);
      log("diary_removed", `episode:${r.id}`);
      return { id: r.id };
    }

    // ---- Settings ----
    case "settings.save": {
      const previous = livesSettings(db);
      const next = cleanLivesSettings({ ...previous, ...((input.settings as object) ?? {}) });
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
        SETTINGS_KEY,
        JSON.stringify(next),
      );
      if (next.retentionDays < previous.retentionDays) {
        // Shorter keeping applies to what's already kept, too.
        const rows = db.prepare("SELECT id, updated_at, expires_at FROM lip_memories").all() as { id: string; updated_at: string; expires_at: string }[];
        for (const m of rows) {
          const sooner = new Date(Date.parse(m.updated_at) + next.retentionDays * 86_400_000).toISOString();
          if (sooner < m.expires_at) db.prepare("UPDATE lip_memories SET expires_at = ? WHERE id = ?").run(sooner, m.id);
        }
        db.prepare("DELETE FROM lip_memories WHERE expires_at <= ?").run(at);
      }
      log("settings", "settings:lives", next, previous);
      return next;
    }
  }
  throw new HttpError(400, "That isn’t something this page can do.");
}

// ---------------------------------------------------------------------------------------------
// Audio diaries
// ---------------------------------------------------------------------------------------------

export type Deps = {
  speak?: (text: string, voice: string, style?: string) => Promise<{ audio: Buffer; words: { end: number }[] | null }>;
  save?: (file: File) => Promise<{ src: string }>;
};

/** What recording one diary would cost, for the author to see before anything is charged. */
export function diaryEstimate(voiceId: string, characters: number) {
  if (voiceId.startsWith("openai:")) {
    const model = openaiSpeechModel();
    const usd = speechCost(characters, "openai", model);
    return {
      provider: "OpenAI",
      model,
      characters,
      usd,
      text:
        usd === null
          ? `${characters} characters; no price on file for ${model}.`
          : `${characters} characters, about US$${usd.toFixed(3)} with ${model} (price to verify).`,
    };
  }
  const model = ttsConfig().modelId;
  // ElevenLabs bills plan credits: flash and turbo models half a credit a character, others one (to verify on the plan).
  const credits = Math.ceil(characters * (/flash|turbo/.test(model) ? 0.5 : 1));
  return {
    provider: "ElevenLabs",
    model,
    characters,
    usd: null,
    credits,
    text: `${characters} characters, about ${credits} ElevenLabs credits with ${model} (to verify on the plan).`,
  };
}

/**
  Records an episode's audio diary in the character's approved voice. Authors only; only from an approved (or
  scheduled, or published) episode's script; asks first, because it's charged: without `confirm: true` it returns
  the estimate and makes nothing. The recording is kept as a Hub upload, and the disk cache in server/tts means the
  same words in the same voice are never paid for twice. Learners hear it only after an author ticks that it matches.
*/
export async function recordDiary(db: Db, actor: User, input: { episodeId?: unknown; confirm?: unknown }, now: Date, deps: Deps = {}) {
  requireAuthor(actor);
  ensureLives(db, now);
  const r = episodeRow(db, input.episodeId);
  if (!r) throw new HttpError(404, "That episode isn’t here.");
  const e = episodeOf(r);
  if (!["approved", "scheduled", "published"].includes(e.status))
    throw new HttpError(400, "Approve the episode first: diaries are recorded from approved words only.");
  if (e.diary.length < 40) throw new HttpError(400, "There’s no diary script to record.");
  const bible = approvedBible(db, e.memberId);
  const voice = bible?.media.voiceId ?? "";
  if (!voice) throw new HttpError(400, "Choose and approve a voice in the Character Bible first, so every episode sounds like the same person.");
  const estimate = diaryEstimate(voice, e.diary.length);
  if (input.confirm !== true) return { estimate, recorded: false };
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'lives.diary_recorded' AND at > ?").get(actor.id, since) as {
    n: number;
  };
  if (recent.n >= DIARY_PER_HOUR) throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  const speak = deps.speak ?? ((text: string, v: string, style?: string) => narration(text, v, style));
  const made = await speak(e.diary, voice, voice.startsWith("openai:") ? bible?.media.delivery : undefined);
  const name = memberName(db, e.memberId);
  const file = new File([new Uint8Array(made.audio)], `Lives in Progress – ${name} – episode ${e.number}.mp3`, { type: "audio/mpeg" });
  const saved = deps.save ? await deps.save(file) : await saveUpload(db, actor, file, { width: 0, height: 0 }, now);
  const seconds = made.words?.length ? Math.round(made.words[made.words.length - 1].end * 10) / 10 : (mp3Seconds(made.audio) ?? 0);
  const audio: DiaryAudio = {
    src: saved.src,
    seconds,
    scriptHash: textHash(`${voice}|${e.diary}`),
    voice,
    voiceName: bible?.media.voiceName || voice,
    at: now.toISOString(),
    by: actor.id,
    characters: e.diary.length,
    checked: null,
  };
  db.prepare("UPDATE lip_episodes SET audio = ? WHERE id = ?").run(JSON.stringify(audio), r.id);
  audit(db, {
    actor: actor.id,
    event: "lives.diary_recorded",
    entity: `episode:${r.id}`,
    next: { characters: e.diary.length, voice: audio.voiceName, estimate: estimate.text },
    at: now,
  });
  return { estimate, recorded: true, audio };
}

/** The whole demo's recording cost, for the owner to approve before anyone presses Record. */
export function demoDiaryEstimate(db: Db, actor: User, now: Date, voiceId = ttsConfig().voiceId) {
  requireAuthor(actor);
  ensureLives(db, now);
  const rows = (db.prepare("SELECT * FROM lip_episodes WHERE sample = 1 AND status IN ('approved','scheduled','published')").all() as EpisodeRow[]).map(
    episodeOf,
  );
  const characters = rows.reduce((n, e) => n + e.diary.length, 0);
  return { episodes: rows.length, ...diaryEstimate(voiceId, characters) };
}

// ---------------------------------------------------------------------------------------------
// The report: counts only, never what anyone said
// ---------------------------------------------------------------------------------------------

/**
  Engagement with each story over a period, from what learners chose to do. All of it is voluntary: none of it is
  assigned, completes anything or shows that anyone's practice changed. Conversation counts come from the chat's
  own log (member_chat_events); their words are never read here.
*/
export function livesReport(db: Db, actor: User, now: Date, days = 30) {
  requireAuthor(actor);
  ensureLives(db, now);
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const activity = db.prepare("SELECT user_id, member_id, episode_id, kind, detail, voluntary, at FROM lip_activity WHERE at >= ?").all(since) as {
    user_id: string;
    member_id: string;
    episode_id: string | null;
    kind: string;
    detail: string;
    voluntary: number;
    at: string;
  }[];
  const chats = db
    .prepare("SELECT member_id, COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM member_chat_events WHERE kind = 'started' AND at >= ? GROUP BY member_id")
    .all(since) as { member_id: string; n: number; people: number }[];
  const members = [...new Set((db.prepare("SELECT DISTINCT member_id FROM lip_episodes").all() as { member_id: string }[]).map((r) => r.member_id))];
  const count = (m: string, kind: string) => activity.filter((a) => a.member_id === m && a.kind === kind).length;
  const people = (m: string, kind: string) => new Set(activity.filter((a) => a.member_id === m && a.kind === kind).map((a) => a.user_id)).size;
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  return {
    days,
    voluntaryNote:
      "Everything here is voluntary: Lives in Progress is never assigned and never counts towards completion. Story engagement isn’t evidence of a change in practice.",
    members: members.map((m) => {
      const eps = memberEpisodes(db, m).filter((e) => isOut(e, now));
      const views = db.prepare("SELECT user_id, episode_id, first_at, last_at FROM lip_views WHERE member_id = ?").all(m) as {
        user_id: string;
        episode_id: string;
        first_at: string;
        last_at: string;
      }[];
      // Continuation: of those who saw an episode, how many went on to see the next one once it was out.
      const continuation = eps
        .map((e) => {
          const next = eps.find((n) => n.arcId === e.arcId && n.number === e.number + 1);
          if (!next) return null;
          const saw = new Set(views.filter((v) => v.episode_id === e.id).map((v) => v.user_id));
          const went = views.filter((v) => v.episode_id === next.id && saw.has(v.user_id)).length;
          return { number: e.number, title: e.title, viewers: saw.size, continued: went };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      const byUserDays = new Map<string, Set<string>>();
      for (const a of activity.filter((x) => x.member_id === m)) byUserDays.set(a.user_id, (byUserDays.get(a.user_id) ?? new Set()).add(a.at.slice(0, 10)));
      const returning = [...byUserDays.values()].filter((d) => d.size >= 2).length;
      const gaps = [...byUserDays.values()].flatMap((d) => {
        const sorted = [...d].sort();
        return sorted.slice(1).map((day, i) => (Date.parse(day) - Date.parse(sorted[i])) / 86_400_000);
      });
      const arcs = memberArcs(db, m).filter((a) => a.status !== "archived");
      const completed = arcs.map((a) => {
        const ids = eps.filter((e) => e.arcId === a.id).map((e) => e.id);
        const users = new Map<string, number>();
        for (const v of views.filter((x) => ids.includes(x.episode_id))) users.set(v.user_id, (users.get(v.user_id) ?? 0) + 1);
        return { title: a.title, out: ids.length, caughtUp: [...users.values()].filter((n) => ids.length > 0 && n >= ids.length).length };
      });
      // Scenario decisions: how often each response was chosen. No response is scored as right or wrong here.
      const decisions = eps.flatMap((e) =>
        e.interactions
          .filter((i) => i.kind === "decide")
          .map((i) => ({
            episode: e.number,
            situation: i.body,
            options: i.options.map((o) => ({
              text: o.text,
              chosen: (
                db.prepare("SELECT COUNT(*) AS n FROM lip_decisions WHERE episode_id = ? AND interaction_id = ? AND option_id = ?").get(e.id, i.id, o.id) as {
                  n: number;
                }
              ).n,
            })),
          })),
      );
      const chat = chats.find((c) => c.member_id === m);
      return {
        id: m,
        name: memberName(db, m),
        opens: count(m, "open"),
        openers: people(m, "open"),
        episodeViews: count(m, "episode_view"),
        viewers: people(m, "episode_view"),
        audioStarts: count(m, "audio_play"),
        audioCompletes: count(m, "audio_complete"),
        transcripts: count(m, "transcript"),
        interactions: count(m, "interaction") + count(m, "decision"),
        resourceClicks: count(m, "resource"),
        followers: (db.prepare("SELECT COUNT(*) AS n FROM lip_follows WHERE member_id = ?").get(m) as { n: number }).n,
        conversations: chat?.n ?? 0,
        conversationPeople: chat?.people ?? 0,
        storyChats: count(m, "chat_start"),
        returning,
        daysBetweenVisits: median(gaps),
        continuation,
        arcs: completed,
        decisions,
      };
    }),
  };
}
