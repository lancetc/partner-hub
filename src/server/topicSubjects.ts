import "server-only";
import { lessons } from "@/content/lessons";
import { isSubject, type SubjectId } from "@/lib/subjects";
import { audit, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";

/*
  Each topic's subject, for browsing the Learning page. Kept apart from the topic's content so it
  can be set or changed straight away, without publishing a new version.
*/

export function topicSubjects(db: Db): Record<string, SubjectId> {
  const rows = db.prepare("SELECT slug, subject FROM topic_subjects").all() as { slug: string; subject: string }[];
  return Object.fromEntries(rows.filter((r) => isSubject(r.subject)).map((r) => [r.slug, r.subject as SubjectId]));
}

export function setTopicSubject(db: Db, actor: User, slug: string, subject: string | null, now: Date) {
  if (!canAuthor(actor)) throw new HttpError(403, "Only learning authors can set a topic’s subject.");
  if (subject !== null && !isSubject(subject)) throw new HttpError(400, "Choose one of the subjects.");
  const exists = lessons.some((l) => l.slug === slug) || db.prepare("SELECT 1 FROM authored_lessons WHERE slug = ?").get(slug);
  if (!exists) throw new HttpError(404, "Topic not found.");
  if (subject === null) db.prepare("DELETE FROM topic_subjects WHERE slug = ?").run(slug);
  else
    db.prepare(
      "INSERT INTO topic_subjects (slug, subject, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET subject = excluded.subject, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    ).run(slug, subject, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "topic.subject_set", entity: `lesson:${slug}`, next: { subject }, at: now });
  return { slug, subject };
}

/** When each topic was first published (for "Newest first"), from its version history. */
export function topicDates(db: Db): Record<string, string> {
  const rows = db.prepare("SELECT slug, MIN(published_at) AS at FROM lesson_versions GROUP BY slug").all() as { slug: string; at: string }[];
  return Object.fromEntries(rows.map((r) => [r.slug, r.at]));
}
