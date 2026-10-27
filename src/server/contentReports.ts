import "server-only";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { getLesson } from "./lessonStore";

/* Learners flag a card that looks wrong or out of date; authors see it in Content review and resolve it. */

const PER_HOUR = 10;

export function reportCard(db: Db, user: User, slug: string, cardId: string, text: string, now: Date) {
  const lesson = getLesson(db, slug);
  if (!lesson?.nodes[cardId]) throw new HttpError(404, "Card not found.");
  const clean = (text ?? "").trim();
  if (clean.length < 5) throw new HttpError(400, "Say a little about what looks wrong.");
  if (clean.length > 600) throw new HttpError(400, "Keep it under 600 characters.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (db.prepare("SELECT COUNT(*) AS n FROM content_reports WHERE user_id = ? AND created_at >= ?").get(user.id, since) as { n: number }).n;
  if (recent >= PER_HOUR) throw new HttpError(429, "Thanks, that’s a lot of reports for one hour. Try again later.");
  db.prepare("INSERT INTO content_reports (lesson_slug, card_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)").run(slug, cardId, user.id, clean, now.toISOString());
  audit(db, { actor: user.id, event: "content.reported", entity: `lesson:${slug}:${cardId}`, at: now });
  return { ok: true };
}

type Row = { id: number; lesson_slug: string; card_id: string; user_id: string; text: string; created_at: string; status: string; name: string };

export function openReports(db: Db) {
  return (
    db
      .prepare("SELECT r.*, u.name FROM content_reports r JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.created_at DESC")
      .all() as Row[]
  ).map((r) => ({ id: r.id, slug: r.lesson_slug, cardId: r.card_id, text: r.text, by: r.name.split(" ")[0], at: r.created_at }));
}

export function resolveReport(db: Db, actor: User, id: number, resolution: string, now: Date) {
  requireAuthor(actor);
  const row = db.prepare("SELECT id FROM content_reports WHERE id = ? AND status = 'open'").get(id);
  if (!row) throw new HttpError(404, "That report is already dealt with.");
  db.prepare("UPDATE content_reports SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ? WHERE id = ?").run(
    actor.id,
    now.toISOString(),
    (resolution ?? "").trim().slice(0, 300),
    id,
  );
  audit(db, { actor: actor.id, event: "content.report_resolved", entity: `content_report:${id}`, at: now });
}
