import "server-only";
import type { Db } from "./db";
import { HttpError, type User } from "./auth";
import { getLesson } from "./lessonStore";

/*
  Confidence rating cards: 1 to 5 stars per person. The server only sends the average and spread
  to someone who has rated, so nobody is swayed by how others answered.
*/

function ratingCard(db: Db, slug: string, cardId: string) {
  const card = getLesson(db, slug)?.nodes[cardId];
  if (!card || card.type !== "rating") throw new HttpError(404, "Rating not found.");
  return card;
}

export type RatingResult = { mine: number | null; results: { average: number; total: number; counts: number[] } | null };

export function ratingResults(db: Db, user: User, slug: string, cardId: string): RatingResult {
  ratingCard(db, slug, cardId);
  const mine =
    (
      db.prepare("SELECT stars FROM rating_votes WHERE lesson_slug = ? AND card_id = ? AND user_id = ?").get(slug, cardId, user.id) as
        { stars: number } | undefined
    )?.stars ?? null;
  if (mine === null) return { mine, results: null };
  const rows = db.prepare("SELECT stars, COUNT(*) AS n FROM rating_votes WHERE lesson_slug = ? AND card_id = ? GROUP BY stars").all(slug, cardId) as {
    stars: number;
    n: number;
  }[];
  // counts[0] is one star, counts[4] five.
  const counts = [1, 2, 3, 4, 5].map((s) => rows.find((r) => r.stars === s)?.n ?? 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const average = Math.round((counts.reduce((a, n, i) => a + n * (i + 1), 0) / total) * 10) / 10;
  return { mine, results: { average, total, counts } };
}

export function rate(db: Db, user: User, slug: string, cardId: string, stars: number, now: Date) {
  ratingCard(db, slug, cardId);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, "Choose from one to five stars.");
  db.prepare(
    `INSERT INTO rating_votes (lesson_slug, card_id, user_id, stars, rated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(lesson_slug, card_id, user_id) DO UPDATE SET stars = excluded.stars, rated_at = excluded.rated_at`,
  ).run(slug, cardId, user.id, stars, now.toISOString());
  return ratingResults(db, user, slug, cardId);
}
