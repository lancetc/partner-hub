import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Card } from "@/content/lessons";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { editorLesson } from "./authoredLessons";

/*
  Review comments, like Articulate Rise's Review: an author switches on a private link for a lesson,
  and anyone with it (no hub account) gives their name and email once, then reads the latest saved
  draft and comments on individual cards. Comments are threads: reviewers and authors reply, and
  authors resolve them. Each comment keeps a fingerprint of its card, so the author can see when a
  card has changed since it was commented on.
*/

export const MAX_REVIEW_COMMENT = 2000;
const PER_HOUR = 40;

/** Who is commenting: a reviewer from a link, or a signed-in author. */
export type Reviewer = { kind: "reviewer"; id: string; name: string } | { kind: "author"; user: User };

type LinkRow = { token: string; lesson_slug: string; created_by: string; created_at: string; revoked_at: string | null };
type CommentRow = {
  id: number;
  lesson_slug: string;
  card_id: string;
  parent_id: number | null;
  reviewer_id: string | null;
  user_id: string | null;
  text: string;
  card_hash: string;
  card_heading: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  deleted_at: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  user_name: string | null;
  resolver_name: string | null;
};

/** A card's content, ignoring where it leads, so re-linking cards doesn't count as a change. */
export function cardHash(card: Card) {
  const rest = { ...card, next: undefined };
  return createHash("sha1").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

function draftOf(db: Db, slug: string) {
  const d = editorLesson(db, slug);
  if (!d) throw new HttpError(404, "This lesson isn’t available for review.");
  return d.lesson;
}

const activeLink = (db: Db, slug: string) =>
  db.prepare("SELECT * FROM review_links WHERE lesson_slug = ? AND revoked_at IS NULL ORDER BY created_at DESC").get(slug) as LinkRow | undefined;

/** The lesson a review link opens, or undefined when it's switched off or the lesson has gone. */
export function linkLesson(db: Db, token: string) {
  if (!/^[\w-]{16,64}$/.test(token)) return undefined;
  const link = db.prepare("SELECT * FROM review_links WHERE token = ? AND revoked_at IS NULL").get(token) as LinkRow | undefined;
  if (!link || !editorLesson(db, link.lesson_slug)) return undefined;
  return link.lesson_slug;
}

export function requireLink(db: Db, token: string) {
  const slug = linkLesson(db, token);
  if (!slug) throw new HttpError(404, "This review link isn’t active. Ask the person who sent it for a new one.");
  return slug;
}

/** The reviewer kept in this browser, if they've joined. */
export function reviewerById(db: Db, id: string | undefined): Reviewer | undefined {
  if (!id) return undefined;
  const r = db.prepare("SELECT id, name FROM reviewers WHERE id = ?").get(id) as { id: string; name: string } | undefined;
  return r && { kind: "reviewer", id: r.id, name: r.name };
}

/** Someone opening a review link gives their name and email. Returns the secret kept in their browser. */
export function joinReview(db: Db, token: string, input: { name?: unknown; email?: unknown }, now: Date) {
  requireLink(db, token);
  const name = String(input.name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (name.length < 2) throw new HttpError(400, "Add your name, so the author knows who the comments are from.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Add an email address the author can reach you on.");
  const id = randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO reviewers (id, name, email, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    name,
    email,
    now.toISOString(),
    now.toISOString(),
  );
  return { id, name };
}

/** For the editor: the lesson's review link (if on) and who has joined through it. */
export function reviewSharing(db: Db, actor: User, slug: string) {
  requireAuthor(actor);
  draftOf(db, slug);
  const link = activeLink(db, slug);
  const reviewers = db
    .prepare(
      `SELECT r.name, r.email, COUNT(c.id) AS comments, MAX(c.created_at) AS last_comment
         FROM review_comments c JOIN reviewers r ON r.id = c.reviewer_id
        WHERE c.lesson_slug = ? AND c.deleted_at IS NULL GROUP BY r.id ORDER BY last_comment DESC`,
    )
    .all(slug) as { name: string; email: string; comments: number; last_comment: string }[];
  return {
    link: link ? { token: link.token, path: `/review/${link.token}`, since: link.created_at } : null,
    reviewers: reviewers.map((r) => ({ name: r.name, email: r.email, comments: r.comments, lastComment: r.last_comment })),
  };
}

/** Switch the review link on (a new address if there isn't one) or off (it stops working for everyone). */
export function setReviewLink(db: Db, actor: User, slug: string, on: boolean, now: Date) {
  requireAuthor(actor);
  draftOf(db, slug);
  const link = activeLink(db, slug);
  if (on && !link) {
    const token = randomBytes(18).toString("base64url");
    db.prepare("INSERT INTO review_links (token, lesson_slug, created_by, created_at) VALUES (?, ?, ?, ?)").run(token, slug, actor.id, now.toISOString());
    audit(db, { actor: actor.id, event: "review_link.on", entity: `lesson:${slug}`, at: now });
  }
  if (!on && link) {
    db.prepare("UPDATE review_links SET revoked_at = ?, revoked_by = ? WHERE lesson_slug = ? AND revoked_at IS NULL").run(now.toISOString(), actor.id, slug);
    audit(db, { actor: actor.id, event: "review_link.off", entity: `lesson:${slug}`, at: now });
  }
  return reviewSharing(db, actor, slug);
}

const SELECT = `SELECT c.*, r.name AS reviewer_name, r.email AS reviewer_email, u.name AS user_name, ru.name AS resolver_name
  FROM review_comments c
  LEFT JOIN reviewers r ON r.id = c.reviewer_id
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN users ru ON ru.id = c.resolved_by`;

const isMine = (who: Reviewer, r: Pick<CommentRow, "reviewer_id" | "user_id">) =>
  who.kind === "reviewer" ? r.reviewer_id === who.id : r.user_id === who.user.id;

/**
  Every comment on a lesson, oldest first, with whether its card has changed or gone since.
  Reviewers' email addresses are shown to authors only.
*/
export function reviewComments(db: Db, who: Reviewer, slug: string) {
  const lesson = draftOf(db, slug);
  const rows = db.prepare(`${SELECT} WHERE c.lesson_slug = ? AND c.deleted_at IS NULL ORDER BY c.created_at, c.id`).all(slug) as CommentRow[];
  const author = who.kind === "author";
  const hashes = new Map(Object.values(lesson.nodes).map((n) => [n.id, cardHash(n)]));
  const comments = rows
    // A reply whose thread was deleted goes with it.
    .filter((r) => !r.parent_id || rows.some((p) => p.id === r.parent_id && !p.parent_id))
    .map((r) => {
      const now = hashes.get(r.card_id);
      return {
        id: r.id,
        card: r.card_id,
        parent: r.parent_id,
        text: r.text,
        by: r.reviewer_id
          ? { name: r.reviewer_name ?? "Reviewer", role: "Reviewer" as const, email: author ? (r.reviewer_email ?? undefined) : undefined }
          : { name: r.user_name ?? "Author", role: "Author" as const },
        at: r.created_at,
        heading: r.card_heading,
        mine: isMine(who, r),
        resolved: r.resolved_at ? { at: r.resolved_at, by: r.resolver_name ?? "An author" } : null,
        cardGone: now === undefined,
        changed: now !== undefined && now !== r.card_hash,
      };
    });
  return { comments, canResolve: author, me: who.kind === "reviewer" ? who.name : who.user.name };
}

export function postReviewComment(db: Db, who: Reviewer, slug: string, input: { card?: unknown; text?: unknown; parent?: unknown }, now: Date) {
  const lesson = draftOf(db, slug);
  const text = String(input.text ?? "").trim();
  if (text.length < 2) throw new HttpError(400, "Write your comment first.");
  if (text.length > MAX_REVIEW_COMMENT) throw new HttpError(400, `Keep a comment to ${MAX_REVIEW_COMMENT} characters.`);
  let cardId = String(input.card ?? "");
  let parent: number | null = null;
  if (input.parent !== undefined && input.parent !== null) {
    const p = db.prepare("SELECT * FROM review_comments WHERE id = ? AND lesson_slug = ? AND deleted_at IS NULL").get(Number(input.parent), slug) as
      CommentRow | undefined;
    if (!p) throw new HttpError(404, "That comment has been deleted.");
    // Replies stay one level deep, on the thread's first comment.
    parent = p.parent_id ?? p.id;
    cardId = p.card_id;
  }
  const card = lesson.nodes[cardId];
  if (!card && !parent) throw new HttpError(404, "That card isn’t in the lesson any more.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (
    who.kind === "reviewer"
      ? db.prepare("SELECT COUNT(*) AS n FROM review_comments WHERE reviewer_id = ? AND created_at > ?").get(who.id, since)
      : db.prepare("SELECT COUNT(*) AS n FROM review_comments WHERE user_id = ? AND created_at > ?").get(who.user.id, since)
  ) as { n: number };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of comments in an hour. Take a short break and try again.");
  db.prepare(
    "INSERT INTO review_comments (lesson_slug, card_id, parent_id, reviewer_id, user_id, text, card_hash, card_heading, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    slug,
    cardId,
    parent,
    who.kind === "reviewer" ? who.id : null,
    who.kind === "author" ? who.user.id : null,
    text,
    card ? cardHash(card) : "",
    (card?.heading || card?.label || "").slice(0, 160),
    now.toISOString(),
  );
  if (who.kind === "reviewer") db.prepare("UPDATE reviewers SET last_seen_at = ? WHERE id = ?").run(now.toISOString(), who.id);
  return reviewComments(db, who, slug);
}

function commentOn(db: Db, slug: string, id: number) {
  const c = db.prepare("SELECT * FROM review_comments WHERE id = ? AND lesson_slug = ? AND deleted_at IS NULL").get(id, slug) as CommentRow | undefined;
  if (!c) throw new HttpError(404, "That comment has already been deleted.");
  return c;
}

/** People delete their own comments; deleting the first comment removes the whole thread. */
export function deleteReviewComment(db: Db, who: Reviewer, slug: string, id: number, now: Date) {
  const c = commentOn(db, slug, id);
  if (!isMine(who, c)) throw new HttpError(403, "You can only delete your own comments.");
  db.prepare("UPDATE review_comments SET deleted_at = ? WHERE id = ?").run(now.toISOString(), id);
  return reviewComments(db, who, slug);
}

/** Authors mark a thread resolved once it's dealt with, or reopen it. */
export function resolveReviewComment(db: Db, actor: User, slug: string, id: number, resolved: boolean, now: Date) {
  requireAuthor(actor);
  const c = commentOn(db, slug, id);
  const root = c.parent_id ?? c.id;
  db.prepare("UPDATE review_comments SET resolved_at = ?, resolved_by = ? WHERE id = ?").run(
    resolved ? now.toISOString() : null,
    resolved ? actor.id : null,
    root,
  );
  return reviewComments(db, { kind: "author", user: actor }, slug);
}
