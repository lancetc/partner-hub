import "server-only";
import type { Db } from "./db";
import { HttpError, type User } from "./auth";
import { getLesson } from "./lessonStore";

/* Poll cards: a vote per person, and everyone's answers shown back as percentages. */

function pollCard(db: Db, slug: string, cardId: string) {
  const lesson = getLesson(db, slug);
  const card = lesson?.nodes[cardId];
  if (!card || card.type !== "poll") throw new HttpError(404, "Poll not found.");
  return card;
}

export function pollResults(db: Db, user: User, slug: string, cardId: string) {
  const card = pollCard(db, slug, cardId);
  const rows = db.prepare("SELECT option_id, COUNT(*) AS n FROM poll_votes WHERE lesson_slug = ? AND card_id = ? GROUP BY option_id").all(slug, cardId) as { option_id: string; n: number }[];
  const mine = (db.prepare("SELECT option_id FROM poll_votes WHERE lesson_slug = ? AND card_id = ? AND user_id = ?").get(slug, cardId, user.id) as { option_id: string } | undefined)?.option_id ?? null;
  const counts = Object.fromEntries(card.options.map((o) => [o.id, rows.find((r) => r.option_id === o.id)?.n ?? 0]));
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), mine };
}

export function vote(db: Db, user: User, slug: string, cardId: string, optionId: string, now: Date) {
  const card = pollCard(db, slug, cardId);
  if (!card.options.some((o) => o.id === optionId)) throw new HttpError(400, "Pick one of the options.");
  db.prepare(
    `INSERT INTO poll_votes (lesson_slug, card_id, user_id, option_id, voted_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(lesson_slug, card_id, user_id) DO UPDATE SET option_id = excluded.option_id, voted_at = excluded.voted_at`,
  ).run(slug, cardId, user.id, optionId, now.toISOString());
  return pollResults(db, user, slug, cardId);
}
