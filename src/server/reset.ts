import "server-only";
import { allBlocks, type ResetBlock } from "@/lib/magazine";
import { cleanProgress, eligiblePosts, EVENTS, isStale, type PeerCard, type ResetEvent, type ResetProgress } from "@/lib/reset";
import { members, posts } from "@/content/community";
import { audit, ensureReset, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  The Expectation Reset (docs/expectation-reset.md), and the Community moderation it relies on.

  - Peer approaches are Community posts. The lesson refers to them by id and filters them here, on the server,
    against the Community's current moderation state, every time. Nothing is cached, so a withdrawn post is gone
    from the lesson on the next load.
  - A learner's first takes and saved phrases are theirs. Learning events record what was opened or copied,
    never the words or anything about a real participant. A copy is not a message, a record or a follow-up.
*/

const today = (now: Date) => now.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------------
// Community moderation
// ---------------------------------------------------------------------------------------------

export function withdrawnPosts(db: Db): Set<string> {
  ensureReset(db);
  return new Set((db.prepare("SELECT post_id FROM community_moderation WHERE state = 'withdrawn'").all() as { post_id: string }[]).map((r) => r.post_id));
}

/** What the Community page needs: which posts are withdrawn, and whether this person can moderate. */
export function moderation(db: Db, user: User) {
  ensureReset(db);
  const rows = db.prepare("SELECT post_id, reason, at FROM community_moderation WHERE state = 'withdrawn'").all() as {
    post_id: string;
    reason: string;
    at: string;
  }[];
  const canModerate = canAuthor(user);
  return { withdrawn: rows.map((r) => r.post_id), canModerate, reasons: canModerate ? Object.fromEntries(rows.map((r) => [r.post_id, r.reason])) : {} };
}

/** Withdraws a post from the Community (and every lesson that uses it), or puts it back. Authors only. */
export function setModeration(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  if (!canAuthor(actor)) throw new HttpError(403, "Only Community moderators can withdraw a post.");
  ensureReset(db);
  const postId = typeof input.postId === "string" ? input.postId : "";
  if (!posts.some((p) => p.id === postId)) throw new HttpError(404, "That post isn’t in the Community.");
  const state = input.state === "published" ? "published" : "withdrawn";
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  if (state === "withdrawn" && reason.length < 3) throw new HttpError(400, "Say briefly why it’s being withdrawn.");
  const prev = db.prepare("SELECT state FROM community_moderation WHERE post_id = ?").get(postId) as { state: string } | undefined;
  db.prepare(
    "INSERT INTO community_moderation (post_id, state, reason, by_user, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET state = excluded.state, reason = excluded.reason, by_user = excluded.by_user, at = excluded.at",
  ).run(postId, state, reason, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: `community.${state}`, entity: `post:${postId}`, previous: prev?.state ?? "published", next: state, reason, at: now });
  return moderation(db, actor);
}

// ---------------------------------------------------------------------------------------------
// The block
// ---------------------------------------------------------------------------------------------

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureReset(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "reset") throw new HttpError(404, "That timeline isn’t here.");
  return { edition, block };
}

const progressOf = (db: Db, user: User, guideId: string, block: ResetBlock): ResetProgress => {
  const row = db.prepare("SELECT state FROM reset_progress WHERE guide_id = ? AND block_id = ? AND user_id = ?").get(guideId, block.id, user.id) as
    { state: string } | undefined;
  return cleanProgress(block, row ? JSON.parse(row.state) : {});
};

/** The peer cards each marker may show right now, after the Community's moderation. */
export function peersFor(db: Db, block: ResetBlock, now: Date): Record<string, PeerCard[]> {
  const withdrawn = withdrawnPosts(db);
  return Object.fromEntries(block.markers.map((m) => [m.id, eligiblePosts(m, posts, members, withdrawn, today(now))]));
}

/** Everything the learner's page needs: their progress, each marker's peer cards, and which reviewed scripts are past their review date. */
export function resetState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block } = load(db, user, guideId, blockId);
  return {
    progress: progressOf(db, user, edition.guide.id, block),
    peers: peersFor(db, block, now),
    stale: block.markers.filter((m) => isStale(m, today(now))).map((m) => m.id),
    today: today(now),
  };
}

/** Saves the learner's own progress: markers opened, private first takes, saved phrases. */
export function saveReset(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const next = cleanProgress(block, input.progress);
  db.prepare(
    "INSERT INTO reset_progress (guide_id, block_id, user_id, state, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(guide_id, block_id, user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
  ).run(edition.guide.id, block.id, user.id, JSON.stringify(next), now.toISOString());
  return { progress: next };
}

/** A learning event: which marker, and which card if any. Never the words, never anything about a participant. */
export function resetEvent(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const event = input.event as ResetEvent;
  if (!EVENTS.includes(event)) throw new HttpError(400, "Unknown event.");
  const marker = block.markers.find((m) => m.id === input.marker);
  if (!marker) throw new HttpError(404, "That marker isn’t here.");
  const post = typeof input.post === "string" && marker.postIds.includes(input.post) ? input.post : null;
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    edition.guide.id,
    edition.revision.id,
    `reset.${event}`,
    block.id,
    JSON.stringify({ marker: marker.id, ...(post ? { post } : {}) }),
  );
  return { ok: true };
}

const FLAGS_PER_HOUR = 10;
/** "Flag as out of date": a reviewed script or a peer approach, for the content owner's queue. */
export function flagReset(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const marker = block.markers.find((m) => m.id === input.marker);
  if (!marker) throw new HttpError(404, "That marker isn’t here.");
  const target =
    input.target === "featured" ? "featured" : typeof input.target === "string" && marker.postIds.includes(input.target) ? `post:${input.target}` : null;
  if (!target) throw new HttpError(400, "Flag the reviewed script or one of the peer approaches.");
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 600) : "";
  if (text.length < 5) throw new HttpError(400, "Say a little about what looks out of date.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (db.prepare("SELECT COUNT(*) AS n FROM learning_flags WHERE user_id = ? AND created_at >= ?").get(user.id, since) as { n: number }).n;
  if (recent >= FLAGS_PER_HOUR) throw new HttpError(429, "Thanks, that’s a lot of flags for one hour. Try again later.");
  db.prepare("INSERT INTO learning_flags (guide_id, block_id, marker_id, target, user_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    edition.guide.id,
    block.id,
    marker.id,
    target,
    user.id,
    text,
    now.toISOString(),
  );
  resetEvent(
    db,
    user,
    guideId,
    { blockId: block.id, event: "flagged", marker: marker.id, post: target.startsWith("post:") ? target.slice(5) : undefined },
    now,
  );
  return { ok: true };
}

/** For authors: what's been opened and copied, by marker, and the open flags to review. No first takes, no names. */
export function resetStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureReset(db);
  const events = db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event LIKE 'reset.%'").all(guideId) as {
    event: string;
    detail: string;
  }[];
  const byMarker: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const m = (JSON.parse(e.detail) as { marker?: string }).marker ?? "";
    const k = e.event.slice(6);
    byMarker[m] = { ...byMarker[m], [k]: (byMarker[m]?.[k] ?? 0) + 1 };
  }
  const flags = db
    .prepare("SELECT id, block_id, marker_id, target, text, created_at FROM learning_flags WHERE guide_id = ? AND status = 'open' ORDER BY created_at DESC")
    .all(guideId) as { id: number; block_id: string; marker_id: string; target: string; text: string; created_at: string }[];
  return { byMarker, flags };
}

export function resolveFlag(db: Db, actor: User, guideId: string, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureReset(db);
  const r = db
    .prepare("UPDATE learning_flags SET status = 'resolved', resolved_at = ? WHERE id = ? AND guide_id = ? AND status = 'open'")
    .run(now.toISOString(), Number(input.flagId), guideId);
  if (!r.changes) throw new HttpError(404, "That flag isn’t open.");
  return resetStats(db, actor, guideId);
}
