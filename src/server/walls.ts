import "server-only";
import type { Db } from "./db";
import { audit } from "./db";
import { canAuthor, canReport, HttpError, type User } from "./auth";
import { getLesson } from "./lessonStore";

/*
  Insight walls. Everyone answers the same question, and the wall only opens once you've posted:
  the server never sends other people's posts to someone who hasn't. Authors and organisation
  admins can hide posts; hidden posts stay on record but leave the wall.
*/

export const MAX_POST = 600;
type PostRow = { id: number; lesson_slug: string; card_id: string; user_id: string; text: string; created_at: string; updated_at: string; hidden_at: string | null; name: string; service_role: string | null; audience: string; org_id: string };

function wallCard(db: Db, slug: string, cardId: string) {
  const card = getLesson(db, slug)?.nodes[cardId];
  if (!card || card.type !== "wall") throw new HttpError(404, "Insight wall not found.");
  return card;
}

/** Who wrote it, as others see it: first name and role, or nothing on an anonymous wall. */
const byline = (p: PostRow, anonymous: boolean) => (anonymous ? null : `${p.name.split(" ")[0]} · ${p.service_role === "coordinator" || p.audience === "coordinator" ? "Coordinator" : p.service_role ? `${p.service_role[0].toUpperCase()}${p.service_role.slice(1)} partner` : p.audience === "staff" ? "Trilogy Care" : "Partner"}`);

/** Can this person hide posts on the wall? Authors anywhere; organisation admins for their own people. */
const canModerate = (actor: User, post: PostRow) => canAuthor(actor) || (canReport(actor) && post.org_id === actor.org_id);

export function readWall(db: Db, user: User, slug: string, cardId: string) {
  const card = wallCard(db, slug, cardId);
  const rows = db
    .prepare(
      `SELECT p.*, u.name, u.service_role, u.audience, u.org_id FROM wall_posts p JOIN users u ON u.id = p.user_id
       WHERE p.lesson_slug = ? AND p.card_id = ? AND p.hidden_at IS NULL ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all(slug, cardId) as PostRow[];
  const mine = rows.find((r) => r.user_id === user.id) ?? null;
  const total = rows.length;
  // The wall opens after you post. Authors and admins can always see it, to look after it.
  const open = Boolean(mine) || canReport(user);
  const likes = new Map((db.prepare("SELECT post_id, COUNT(*) AS n FROM wall_likes GROUP BY post_id").all() as { post_id: number; n: number }[]).map((r) => [r.post_id, r.n]));
  const liked = new Set((db.prepare("SELECT post_id FROM wall_likes WHERE user_id = ?").all(user.id) as { post_id: number }[]).map((r) => r.post_id));
  const view = (p: PostRow) => ({
    id: p.id,
    text: p.text,
    by: byline(p, Boolean(card.anonymous)),
    at: p.created_at,
    edited: p.updated_at !== p.created_at,
    likes: likes.get(p.id) ?? 0,
    liked: liked.has(p.id),
    mine: p.user_id === user.id,
    canHide: canModerate(user, p),
  });
  return { prompt: card.prompt, anonymous: Boolean(card.anonymous), total, mine: mine ? view(mine) : null, posts: open ? rows.filter((r) => r.user_id !== user.id).map(view) : [], open };
}

export function postToWall(db: Db, user: User, slug: string, cardId: string, text: string, now: Date) {
  wallCard(db, slug, cardId);
  const clean = (text ?? "").trim().replace(/\s+\n/g, "\n");
  if (clean.length < 3) throw new HttpError(400, "Write a few words to share.");
  if (clean.length > MAX_POST) throw new HttpError(400, `Keep it under ${MAX_POST} characters.`);
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO wall_posts (lesson_slug, card_id, user_id, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lesson_slug, card_id, user_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
  ).run(slug, cardId, user.id, clean, at, at);
  return readWall(db, user, slug, cardId);
}

export function likePost(db: Db, user: User, postId: number, on: boolean) {
  const post = db.prepare("SELECT * FROM wall_posts WHERE id = ? AND hidden_at IS NULL").get(postId) as PostRow | undefined;
  if (!post) throw new HttpError(404, "Post not found.");
  if (post.user_id === user.id) throw new HttpError(400, "You can’t mark your own post as helpful.");
  // You can only react to posts you're allowed to see: you've posted on that wall yourself.
  if (!canReport(user) && !db.prepare("SELECT 1 FROM wall_posts WHERE lesson_slug = ? AND card_id = ? AND user_id = ?").get(post.lesson_slug, post.card_id, user.id))
    throw new HttpError(403, "Post your own answer first.");
  if (on) db.prepare("INSERT OR IGNORE INTO wall_likes VALUES (?, ?)").run(postId, user.id);
  else db.prepare("DELETE FROM wall_likes WHERE post_id = ? AND user_id = ?").run(postId, user.id);
  return readWall(db, user, post.lesson_slug, post.card_id);
}

export function hidePost(db: Db, actor: User, postId: number, now: Date) {
  const post = db.prepare("SELECT p.*, u.name, u.service_role, u.audience, u.org_id FROM wall_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?").get(postId) as PostRow | undefined;
  if (!post) throw new HttpError(404, "Post not found.");
  if (!canModerate(actor, post)) throw new HttpError(403, "Only learning authors and organisation admins can hide posts.");
  db.prepare("UPDATE wall_posts SET hidden_at = ?, hidden_by = ? WHERE id = ?").run(now.toISOString(), actor.id, postId);
  audit(db, { actor: actor.id, event: "wall.hidden", entity: `wall_post:${postId}`, previous: { by: post.user_id, text: post.text }, at: now });
  return readWall(db, actor, post.lesson_slug, post.card_id);
}
