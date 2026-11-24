import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Card } from "@/content/lessons";
import type { Db } from "./db";

import { HttpError, requireAuthor, type User } from "./auth";
import { editorLesson } from "./authoredLessons";

/*
  Review comments, like Articulate Rise's Review, for people signed in to the hub: they give their name once,
  then comment on individual cards of a topic. (There are no review links for people outside the hub.) Comments are threads: reviewers and authors reply, and
  authors resolve them. Each comment keeps a fingerprint of its card, so the author can see when a
  card has changed since it was commented on.
*/

export const MAX_REVIEW_COMMENT = 2000;
const PER_HOUR = 40;

/** Who is commenting: a named reviewer, or a signed-in author. */
export type Reviewer = { kind: "reviewer"; id: string; name: string } | { kind: "author"; user: User };

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
  if (!d) throw new HttpError(404, "This topic isn’t available for review.");
  return d.lesson;
}

/** The reviewer kept in this browser, if they've joined. */
export function reviewerById(db: Db, id: string | undefined): Reviewer | undefined {
  if (!id) return undefined;
  const r = db.prepare("SELECT id, name FROM reviewers WHERE id = ?").get(id) as { id: string; name: string } | undefined;
  return r && { kind: "reviewer", id: r.id, name: r.name };
}

/** A new named reviewer. Comments on a topic ask only for a name. */
export function addReviewer(db: Db, input: { name?: unknown; email?: unknown }, now: Date, { emailOptional = false } = {}) {
  const name = String(input.name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (name.length < 2) throw new HttpError(400, "Add your name, so the author knows who the comments are from.");
  if (!(emailOptional && !email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Add an email address the author can reach you on.");
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
  if (!card && !parent) throw new HttpError(404, "That card isn’t in the topic any more.");
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

/**
  For the admin Comments page: every topic that has review comments, most recent activity first,
  each with its comments as the editor's Comments tab shows them. Topics deleted since are left out.
*/
export function allReviewComments(db: Db, actor: User) {
  requireAuthor(actor);
  const slugs = db
    .prepare("SELECT lesson_slug AS slug, MAX(created_at) AS latest FROM review_comments WHERE deleted_at IS NULL GROUP BY lesson_slug ORDER BY latest DESC")
    .all() as { slug: string; latest: string }[];
  const topics = slugs.flatMap(({ slug, latest }) => {
    const found = editorLesson(db, slug);
    if (!found) return [];
    return [{ slug, title: found.lesson.title, latest, comments: reviewComments(db, { kind: "author", user: actor }, slug).comments }];
  });
  const open = topics.reduce((n, t) => n + t.comments.filter((c) => !c.parent && !c.resolved).length, 0);
  return { topics, open };
}
