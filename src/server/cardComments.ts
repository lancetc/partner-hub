import "server-only";
import { commentsOn } from "@/lib/cardComments";
import type { Db } from "./db";
import { audit } from "./db";
import { canAuthor, canReport, HttpError, type User } from "./auth";
import { getLesson } from "./lessonStore";

/*
  Comments on lesson cards. Authors turn them on card by card; then anyone taking the lesson can
  read them and add their own: local know-how, tips, questions. Authors and organisation admins
  can pin a useful comment to the top or hide one (admins only for their own organisation's
  people). Everyone can delete their own.
*/

export const MAX_COMMENT = 600;
const PER_HOUR = 15;

type Row = {
  id: number;
  lesson_slug: string;
  card_id: string;
  user_id: string;
  text: string;
  created_at: string;
  updated_at: string;
  hidden_at: string | null;
  pinned_at: string | null;
  name: string;
  service_role: string | null;
  audience: string;
  org_id: string;
  role: string;
};

function commentCard(db: Db, slug: string, cardId: string) {
  const card = getLesson(db, slug)?.nodes[cardId];
  if (!card) throw new HttpError(404, "Card not found.");
  if (!commentsOn(card)) throw new HttpError(403, "Comments aren’t turned on for this card.");
  return card;
}

/** First name and what they do, so readers know whose experience it is. */
const byline = (r: Row) => {
  const first = r.name.split(" ")[0];
  const what =
    r.audience === "staff"
      ? "Trilogy Care"
      : r.service_role === "coordinator" || r.audience === "coordinator"
        ? "Coordinator"
        : r.service_role
          ? `${r.service_role[0].toUpperCase()}${r.service_role.slice(1)} partner`
          : r.role === "org_admin"
            ? "Partner manager"
            : "Partner";
  return { name: first, what, staff: r.audience === "staff" };
};

const canModerate = (actor: User, r: Pick<Row, "org_id">) => canAuthor(actor) || (canReport(actor) && r.org_id === actor.org_id);

const SELECT = `SELECT c.*, u.name, u.service_role, u.audience, u.org_id, u.role FROM card_comments c JOIN users u ON u.id = c.user_id`;

export function readComments(db: Db, user: User, slug: string, cardId: string) {
  commentCard(db, slug, cardId);
  const rows = db
    .prepare(
      `${SELECT} WHERE c.lesson_slug = ? AND c.card_id = ? AND c.hidden_at IS NULL ORDER BY c.pinned_at IS NULL, c.pinned_at DESC, c.created_at DESC, c.id DESC`,
    )
    .all(slug, cardId) as Row[];
  return {
    comments: rows.map((r) => ({
      id: r.id,
      text: r.text,
      by: byline(r),
      at: r.created_at,
      pinned: Boolean(r.pinned_at),
      mine: r.user_id === user.id,
      canHide: r.user_id !== user.id && canModerate(user, r),
      canPin: canModerate(user, r),
    })),
    canPost: true,
  };
}

export function postComment(db: Db, user: User, slug: string, cardId: string, text: string, now: Date) {
  commentCard(db, slug, cardId);
  const clean = (text ?? "").trim().replace(/\n{3,}/g, "\n\n");
  if (clean.length < 3) throw new HttpError(400, "Write a few words first.");
  if (clean.length > MAX_COMMENT) throw new HttpError(400, `Keep it under ${MAX_COMMENT} characters.`);
  const since = new Date(now.getTime() - 3600_000).toISOString();
  // The hour up to now (not anything dated later, such as demo comments).
  const recent = (
    db.prepare("SELECT COUNT(*) AS n FROM card_comments WHERE user_id = ? AND created_at >= ? AND created_at <= ?").get(user.id, since, now.toISOString()) as {
      n: number;
    }
  ).n;
  if (recent >= PER_HOUR) throw new HttpError(429, "That’s a lot of comments for one hour. Try again later.");
  const at = now.toISOString();
  db.prepare("INSERT INTO card_comments (lesson_slug, card_id, user_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    slug,
    cardId,
    user.id,
    clean,
    at,
    at,
  );
  return readComments(db, user, slug, cardId);
}

function getRow(db: Db, id: number) {
  const r = db.prepare(`${SELECT} WHERE c.id = ? AND c.hidden_at IS NULL`).get(id) as Row | undefined;
  if (!r) throw new HttpError(404, "Comment not found.");
  return r;
}

/** Your own comment: gone for good. */
export function deleteComment(db: Db, user: User, id: number, now: Date) {
  const r = getRow(db, id);
  if (r.user_id !== user.id) throw new HttpError(403, "You can only delete your own comments.");
  db.prepare("DELETE FROM card_comments WHERE id = ?").run(id);
  audit(db, { actor: user.id, event: "comment.deleted", entity: `lesson:${r.lesson_slug}:${r.card_id}`, at: now });
  return readComments(db, user, r.lesson_slug, r.card_id);
}

/** Someone else's comment, by a moderator: hidden from everyone but kept on record. */
export function hideComment(db: Db, actor: User, id: number, now: Date) {
  const r = getRow(db, id);
  if (!canModerate(actor, r)) throw new HttpError(403, "Only learning authors and organisation admins can hide comments.");
  db.prepare("UPDATE card_comments SET hidden_at = ?, hidden_by = ? WHERE id = ?").run(now.toISOString(), actor.id, id);
  audit(db, { actor: actor.id, event: "comment.hidden", entity: `card_comment:${id}`, previous: { by: r.user_id, text: r.text }, at: now });
  return readComments(db, actor, r.lesson_slug, r.card_id);
}

/** Pin a useful comment to the top of the card's comments, or unpin it. */
export function pinComment(db: Db, actor: User, id: number, on: boolean, now: Date) {
  const r = getRow(db, id);
  if (!canModerate(actor, r)) throw new HttpError(403, "Only learning authors and organisation admins can pin comments.");
  db.prepare("UPDATE card_comments SET pinned_at = ?, pinned_by = ? WHERE id = ?").run(on ? now.toISOString() : null, on ? actor.id : null, id);
  audit(db, { actor: actor.id, event: on ? "comment.pinned" : "comment.unpinned", entity: `card_comment:${id}`, at: now });
  return readComments(db, actor, r.lesson_slug, r.card_id);
}
