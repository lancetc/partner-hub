import "server-only";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { editorLesson } from "./authoredLessons";
import { getRow } from "./learningPaths";
import { setReviewLink } from "./reviews";

/*
  A review link for a whole learning path. Reviewers give their name and email once, then see the
  path's topics in order. Each topic opens through its own topic review link, which is switched on
  with the path's, so comments sit with the topic in its Comments tab, where authors already read them.
*/

type LinkRow = { token: string; path_id: string; created_by: string; created_at: string; revoked_at: string | null };

const activeLink = (db: Db, pathId: string) =>
  db.prepare("SELECT * FROM path_review_links WHERE path_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").get(pathId) as LinkRow | undefined;

const slugsOf = (db: Db, pathId: string) =>
  (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(pathId) as { lesson_slug: string }[])
    .map((r) => r.lesson_slug)
    // Topics that have since gone can't be reviewed.
    .filter((s) => editorLesson(db, s));

const topicLink = (db: Db, slug: string) =>
  (
    db.prepare("SELECT token FROM review_links WHERE lesson_slug = ? AND revoked_at IS NULL ORDER BY created_at DESC").get(slug) as
      { token: string } | undefined
  )?.token;

/** The path a review link opens, or undefined when it's switched off or the path has gone. */
export function linkPath(db: Db, token: string) {
  if (!/^[\w-]{16,64}$/.test(token)) return undefined;
  const link = db.prepare("SELECT * FROM path_review_links WHERE token = ? AND revoked_at IS NULL").get(token) as LinkRow | undefined;
  const path = link && (db.prepare("SELECT id FROM learning_paths WHERE id = ? AND archived = 0").get(link.path_id) as { id: string } | undefined);
  return path?.id;
}

export function requirePathLink(db: Db, token: string) {
  const id = linkPath(db, token);
  if (!id) throw new HttpError(404, "This review link isn’t active. Ask the person who sent it for a new one.");
  return id;
}

/** What a reviewer sees on the path's review page: its topics in order, each with the address that opens it for review. */
export function pathReview(db: Db, token: string) {
  const p = getRow(db, requirePathLink(db, token));
  return {
    name: p.name,
    description: p.description,
    topics: slugsOf(db, p.id).map((slug) => {
      const l = editorLesson(db, slug)!.lesson;
      const t = topicLink(db, slug);
      const comments = (db.prepare("SELECT COUNT(*) AS n FROM review_comments WHERE lesson_slug = ? AND deleted_at IS NULL").get(slug) as { n: number }).n;
      return { slug, title: l.title, summary: l.summary, minutes: l.minutes, href: t ? `/review/${t}?path=${token}` : null, comments };
    }),
  };
}

/**
  This Mac's addresses on the local network (Wi-Fi and wired can both be on), for links copied while
  the author is on localhost, which wouldn't open for anyone else. Empty when there's no network.
*/
export function networkOrigins(host: string | null) {
  const [name, port] = (host ?? "").split(":");
  if (name !== "localhost" && name !== "127.0.0.1") return [];
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => `http://${a!.address}${port ? `:${port}` : ""}`);
}

/** For the path editor: the path's review link (if on), and who has commented on its topics. */
export function pathReviewSharing(db: Db, actor: User, pathId: string) {
  requireAuthor(actor);
  getRow(db, pathId);
  const link = activeLink(db, pathId);
  const slugs = slugsOf(db, pathId);
  const reviewers = slugs.length
    ? (db
        .prepare(
          `SELECT r.name, r.email, COUNT(c.id) AS comments FROM review_comments c JOIN reviewers r ON r.id = c.reviewer_id
            WHERE c.deleted_at IS NULL AND c.lesson_slug IN (${slugs.map(() => "?").join(",")}) GROUP BY r.id ORDER BY MAX(c.created_at) DESC`,
        )
        .all(...slugs) as { name: string; email: string; comments: number }[])
    : [];
  return { link: link ? { path: `/review/path/${link.token}`, since: link.created_at } : null, topics: slugs.length, reviewers };
}

/**
  Switch the path's review link on (a new address if there isn't one) or off. Switching on also
  switches on each topic's own review link; switching off leaves those alone, since they may have
  been sent out separately.
*/
export function setPathReviewLink(db: Db, actor: User, pathId: string, on: boolean, now: Date) {
  requireAuthor(actor);
  getRow(db, pathId);
  const link = activeLink(db, pathId);
  if (on) {
    const slugs = slugsOf(db, pathId);
    if (!slugs.length) throw new HttpError(409, "Add topics to this path before sharing it for review.");
    for (const slug of slugs) if (!topicLink(db, slug)) setReviewLink(db, actor, slug, true, now);
    if (!link) {
      const token = randomBytes(18).toString("base64url");
      db.prepare("INSERT INTO path_review_links (token, path_id, created_by, created_at) VALUES (?, ?, ?, ?)").run(token, pathId, actor.id, now.toISOString());
      audit(db, { actor: actor.id, event: "path_review_link.on", entity: `learning_path:${pathId}`, at: now });
    }
  }
  if (!on && link) {
    db.prepare("UPDATE path_review_links SET revoked_at = ?, revoked_by = ? WHERE path_id = ? AND revoked_at IS NULL").run(now.toISOString(), actor.id, pathId);
    audit(db, { actor: actor.id, event: "path_review_link.off", entity: `learning_path:${pathId}`, at: now });
  }
  return pathReviewSharing(db, actor, pathId);
}
