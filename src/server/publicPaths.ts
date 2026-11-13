import "server-only";
import { randomBytes } from "node:crypto";
import { lessonBySlug, lessons } from "@/content/lessons";
import { applyFacts } from "@/lib/facts";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { getRow, overview, slugsFor } from "./learningPaths";
import { missionSlugs } from "./challenges";
import { factValues } from "./facts";

/*
  Public learning paths: one link (and QR code) that anyone can open without signing in, for
  example clients. Nothing about the person is recorded. The hub only counts, anonymously, how
  often the path was opened, each topic finished and the whole path finished. The person's own
  ticks are kept on their device, which is also what stops one phone being counted twice.
*/

type LinkRow = { token: string; path_id: string; created_by: string; created_at: string; revoked_at: string | null };

export type PublicEvent = "opened" | "topic" | "path";

const activeLink = (db: Db, pathId: string) =>
  db.prepare("SELECT * FROM public_path_links WHERE path_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").get(pathId) as LinkRow | undefined;

/** The path's published topics, in order. Drafts and topics that have gone stay out. */
const publishedSlugs = (db: Db, pathId: string) => slugsFor(db, pathId).filter((s) => lessons.some((l) => l.slug === s && l.track !== "reinforcement"));

/** The path a public link opens, or undefined when the link is switched off or the path has gone. */
export function publicPathId(db: Db, token: string) {
  if (!/^[\w-]{10,64}$/.test(token)) return undefined;
  const link = db.prepare("SELECT path_id FROM public_path_links WHERE token = ? AND revoked_at IS NULL").get(token) as { path_id: string } | undefined;
  const path = link && (db.prepare("SELECT id FROM learning_paths WHERE id = ? AND archived = 0").get(link.path_id) as { id: string } | undefined);
  return path?.id;
}

function requireLink(db: Db, token: string) {
  const id = publicPathId(db, token);
  if (!id) throw new HttpError(404, "This link isn’t active any more.");
  return id;
}

/** What someone opening the public link sees: the path's overview and its published topics. */
export function publicPath(db: Db, token: string) {
  const p = getRow(db, requireLink(db, token));
  const { whoFor, whoPhoto, outcomes, reward } = overview(p);
  const topics = publishedSlugs(db, p.id).map((slug) => {
    const l = lessonBySlug(slug)!;
    return { slug, title: l.title, summary: l.summary, minutes: l.minutes };
  });
  return {
    token,
    name: p.name,
    description: p.description,
    inOrder: Boolean(p.in_order),
    whoFor,
    whoPhoto,
    outcomes,
    reward,
    minutes: topics.reduce((n, t) => n + t.minutes, 0),
    topics,
  };
}

/** One topic of a public path, with shared facts filled in. Undefined when it isn't part of the path. */
export function publicTopic(db: Db, token: string, slug: string) {
  const id = publicPathId(db, token);
  if (!id || !publishedSlugs(db, id).includes(slug)) return undefined;
  return applyFacts(lessonBySlug(slug)!, factValues(db));
}

/** Counts one anonymous event from a public link. The device sends each one once. */
export function recordPublicEvent(db: Db, token: string, kind: unknown, slug: unknown, now: Date) {
  const pathId = requireLink(db, token);
  if (kind !== "opened" && kind !== "topic" && kind !== "path") throw new HttpError(400, "Unknown event.");
  let lesson: string | null = null;
  if (kind === "topic") {
    if (typeof slug !== "string" || !publishedSlugs(db, pathId).includes(slug)) throw new HttpError(400, "That topic isn’t part of this path.");
    lesson = slug;
  }
  db.prepare("INSERT INTO public_path_events (path_id, token, kind, lesson_slug, at) VALUES (?, ?, ?, ?, ?)").run(
    pathId,
    token,
    kind,
    lesson,
    now.toISOString(),
  );
  return { ok: true };
}

/** For the path editor: the public link (if on) and the anonymous counts since the path was first made public. */
export function publicSharing(db: Db, actor: User, pathId: string) {
  requireAuthor(actor);
  getRow(db, pathId);
  const link = activeLink(db, pathId);
  const count = (kind: PublicEvent) =>
    (db.prepare("SELECT COUNT(*) AS n FROM public_path_events WHERE path_id = ? AND kind = ?").get(pathId, kind) as { n: number }).n;
  const perTopic = new Map(
    (
      db.prepare("SELECT lesson_slug, COUNT(*) AS n FROM public_path_events WHERE path_id = ? AND kind = 'topic' GROUP BY lesson_slug").all(pathId) as {
        lesson_slug: string;
        n: number;
      }[]
    ).map((r) => [r.lesson_slug, r.n]),
  );
  const last = db.prepare("SELECT MAX(at) AS at FROM public_path_events WHERE path_id = ? AND kind = 'path'").get(pathId) as { at: string | null };
  const ever = db.prepare("SELECT 1 FROM public_path_links WHERE path_id = ? LIMIT 1").get(pathId);
  return {
    link: link ? { path: `/open/${link.token}`, since: link.created_at } : null,
    topics: publishedSlugs(db, pathId).map((slug) => ({ slug, title: lessonBySlug(slug)!.title, completed: perTopic.get(slug) ?? 0 })),
    stats: ever ? { opened: count("opened"), completed: count("path"), lastCompletedAt: last.at } : null,
  };
}

/** Makes the path public (a new link if it isn't already) or private again. Switching off stops the link straight away; the counts are kept. */
export function setPublicLink(db: Db, actor: User, pathId: string, on: boolean, now: Date) {
  requireAuthor(actor);
  getRow(db, pathId);
  const link = activeLink(db, pathId);
  if (on && !link) {
    const slugs = publishedSlugs(db, pathId);
    if (!slugs.length) throw new HttpError(409, "Publish at least one of this path’s topics before making it public.");
    // A mission opens on its day for the people in the challenge, so it can't be given to everyone early.
    const missions = missionSlugs(db);
    if (slugs.some((s) => missions.has(s))) throw new HttpError(409, "This path holds challenge missions, so it can’t be made public.");
    // Short, so the QR code stays easy to scan, but far too many to guess.
    const token = randomBytes(9).toString("base64url");
    db.prepare("INSERT INTO public_path_links (token, path_id, created_by, created_at) VALUES (?, ?, ?, ?)").run(token, pathId, actor.id, now.toISOString());
    audit(db, { actor: actor.id, event: "public_path_link.on", entity: `learning_path:${pathId}`, at: now });
  }
  if (!on && link) {
    db.prepare("UPDATE public_path_links SET revoked_at = ?, revoked_by = ? WHERE path_id = ? AND revoked_at IS NULL").run(now.toISOString(), actor.id, pathId);
    audit(db, { actor: actor.id, event: "public_path_link.off", entity: `learning_path:${pathId}`, at: now });
  }
  return publicSharing(db, actor, pathId);
}

/**
  The path's public link for its QR code beside "Enrol in this path": made the first time anyone signed
  in asks for it, with the same checks as an author making it public. Authors can switch it off in admin.
*/
export function ensurePublicLink(db: Db, actor: User, pathId: string, now: Date) {
  getRow(db, pathId);
  const existing = activeLink(db, pathId);
  if (existing) return existing.token;
  const slugs = publishedSlugs(db, pathId);
  if (!slugs.length) throw new HttpError(409, "This path has no published topics yet.");
  const missions = missionSlugs(db);
  if (slugs.some((s) => missions.has(s))) throw new HttpError(409, "This path holds challenge missions, so it can’t be opened publicly.");
  const token = randomBytes(9).toString("base64url");
  db.prepare("INSERT INTO public_path_links (token, path_id, created_by, created_at) VALUES (?, ?, ?, ?)").run(token, pathId, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "public_path_link.on", entity: `learning_path:${pathId}`, next: { via: "qr" }, at: now });
  return token;
}

/** The active public link's token for a path, for its QR code. */
export function publicToken(db: Db, pathId: string) {
  const link = activeLink(db, pathId);
  if (!link) throw new HttpError(404, "This path isn’t public. Make it public first.");
  return link.token;
}
