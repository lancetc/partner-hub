import "server-only";
import { randomBytes } from "node:crypto";
import { lessonBySlug, lessons } from "@/content/lessons";
import { applyFacts } from "@/lib/facts";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { missionSlugs } from "./challenges";
import { factValues } from "./facts";

/*
  Public topics: a link (shown as a QR code beside "Enrol in this topic") that opens one topic on any
  phone without signing in. Like public learning paths, nothing about the person is recorded; the hub
  only counts, anonymously, how often it was opened and finished. The link is long enough that it
  can't be guessed, so a topic is only open to people who were shown its code.
*/

type LinkRow = { token: string; lesson_slug: string; revoked_at: string | null };

const activeLink = (db: Db, slug: string) =>
  db.prepare("SELECT * FROM public_topic_links WHERE lesson_slug = ? AND revoked_at IS NULL ORDER BY created_at DESC").get(slug) as LinkRow | undefined;

const published = (slug: string) => lessons.some((l) => l.slug === slug && l.track !== "reinforcement");

/** The topic's public link, made the first time someone asks for its QR code. */
export function topicLink(db: Db, actor: User, slug: string, now: Date) {
  if (!published(slug)) throw new HttpError(404, "Topic not found.");
  // A mission opens on its day for the people in the challenge, so it can't be handed out early.
  if (missionSlugs(db).has(slug)) throw new HttpError(409, "This topic is a challenge mission, so it can’t be opened publicly.");
  const link = activeLink(db, slug);
  if (link) return link.token;
  const token = randomBytes(9).toString("base64url");
  db.prepare("INSERT INTO public_topic_links (token, lesson_slug, created_by, created_at) VALUES (?, ?, ?, ?)").run(token, slug, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "public_topic_link.on", entity: `lesson:${slug}`, at: now });
  return token;
}

/** The topic a public link opens, or undefined when it's switched off or the topic has gone. */
export function publicTopicSlug(db: Db, token: string) {
  if (!/^[\w-]{10,64}$/.test(token)) return undefined;
  const r = db.prepare("SELECT lesson_slug FROM public_topic_links WHERE token = ? AND revoked_at IS NULL").get(token) as { lesson_slug: string } | undefined;
  return r && published(r.lesson_slug) ? r.lesson_slug : undefined;
}

/** The topic itself, with shared facts filled in. */
export function publicTopicLesson(db: Db, token: string) {
  const slug = publicTopicSlug(db, token);
  return slug ? applyFacts(lessonBySlug(slug)!, factValues(db)) : undefined;
}

/** One anonymous count: the topic opened, or finished ("topic"; "path" also counts as finished, for the shared player). */
export function recordTopicEvent(db: Db, token: string, kind: unknown, now: Date) {
  const slug = publicTopicSlug(db, token);
  if (!slug) throw new HttpError(404, "This link isn’t active any more.");
  if (kind !== "opened" && kind !== "topic" && kind !== "path") throw new HttpError(400, "Unknown event.");
  // The player sends "topic" and then "path" for a one-topic link; count finishing once.
  if (kind === "path") return { ok: true };
  db.prepare("INSERT INTO public_topic_events (token, lesson_slug, kind, at) VALUES (?, ?, ?, ?)").run(token, slug, kind === "topic" ? "finished" : "opened", now.toISOString());
  return { ok: true };
}

/** The active public link for a topic, for its QR code. */
export function publicTopicToken(db: Db, slug: string) {
  const link = activeLink(db, slug);
  if (!link) throw new HttpError(404, "This topic doesn’t have a public link yet.");
  return link.token;
}
