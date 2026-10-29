import "server-only";
import type { Db } from "./db";
import { HttpError, type User } from "./auth";

/*
  Lesson progress on the server, so it follows people between devices. Each device keeps its own
  copy and sends changes through its outbox; the copy saved most recently wins.
*/

const MAX_BYTES = 200_000;

export function readProgress(db: Db, user: User) {
  const rows = db.prepare("SELECT slug, attempt, saved_at FROM lesson_progress WHERE user_id = ?").all(user.id) as {
    slug: string;
    attempt: string;
    saved_at: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.slug, { attempt: JSON.parse(r.attempt) as unknown, savedAt: r.saved_at }]));
}

/** Keeps the newer of what's stored and what's sent. Returns whether this save was kept. */
export function saveProgress(db: Db, user: User, slug: string, attempt: unknown, savedAt: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug ?? "")) throw new HttpError(400, "Which topic?");
  if (!attempt || typeof attempt !== "object") throw new HttpError(400, "Expected topic progress.");
  const when = new Date(savedAt);
  if (Number.isNaN(when.getTime())) throw new HttpError(400, "Expected when it was saved.");
  const json = JSON.stringify(attempt);
  if (json.length > MAX_BYTES) throw new HttpError(413, "That progress is too large to save.");
  const existing = db.prepare("SELECT saved_at FROM lesson_progress WHERE user_id = ? AND slug = ?").get(user.id, slug) as { saved_at: string } | undefined;
  if (existing && existing.saved_at >= when.toISOString()) return { kept: false };
  db.prepare(
    `INSERT INTO lesson_progress (user_id, slug, attempt, saved_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, slug) DO UPDATE SET attempt = excluded.attempt, saved_at = excluded.saved_at`,
  ).run(user.id, slug, json, when.toISOString());
  return { kept: true };
}
