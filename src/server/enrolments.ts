import "server-only";
import { lessons } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { missionSlugs } from "./challenges";
import { enrolInPath, leavePath } from "./learningPaths";

/*
  Self-enrolment: anyone signed in can add a learning path or a single topic to their own Learning
  page. A path they enrol in sits beside their assigned ones (administrators see them on it, marked
  self-enrolled); a topic goes under "Your topics" and shows in the topic's completion report.
  Challenge missions can't be enrolled in: they open one a day, from the challenge page.
*/

/** Topics that can be enrolled in: the published catalogue, not spaced follow ups or challenge missions. */
function enrollable(db: Db, slug: string) {
  const l = lessons.find((x) => x.slug === slug && x.track !== "reinforcement");
  if (!l || missionSlugs(db).has(slug)) throw new HttpError(404, "Topic not found.");
  return l;
}

export function enrolInTopic(db: Db, user: User, slug: string, now: Date) {
  enrollable(db, slug);
  const r = db.prepare("INSERT OR IGNORE INTO topic_enrolments (user_id, lesson_slug, enrolled_at) VALUES (?, ?, ?)").run(user.id, slug, now.toISOString());
  if (r.changes) audit(db, { actor: user.id, event: "topic.self_enrolled", entity: `lesson:${slug}`, at: now });
  return { enrolled: true };
}

export function leaveTopic(db: Db, user: User, slug: string, now: Date) {
  const r = db.prepare("DELETE FROM topic_enrolments WHERE user_id = ? AND lesson_slug = ?").run(user.id, slug);
  if (r.changes) audit(db, { actor: user.id, event: "topic.self_unenrolled", entity: `lesson:${slug}`, reason: "Left by the learner; progress is kept.", at: now });
  return { enrolled: false };
}

/** The topics this person has enrolled in, newest first. Topics since unpublished drop out. */
export function myTopicEnrolments(db: Db, user: User) {
  const live = new Set(lessons.filter((l) => l.track !== "reinforcement").map((l) => l.slug));
  return (
    db.prepare("SELECT lesson_slug, enrolled_at FROM topic_enrolments WHERE user_id = ? ORDER BY enrolled_at DESC").all(user.id) as {
      lesson_slug: string;
      enrolled_at: string;
    }[]
  )
    .filter((r) => live.has(r.lesson_slug))
    .map((r) => ({ slug: r.lesson_slug, enrolledAt: r.enrolled_at }));
}

export type EnrolAction = { kind: "path" | "topic"; id: string; action: "enrol" | "leave" };

/** Enrol in, or leave, a path or a topic. */
export function enrolment(db: Db, user: User, b: EnrolAction, now: Date) {
  if (typeof b?.id !== "string" || !b.id) throw new HttpError(400, "Say which path or topic.");
  if (b.action !== "enrol" && b.action !== "leave") throw new HttpError(400, "Unknown action.");
  if (b.kind === "path") return b.action === "enrol" ? enrolInPath(db, user, b.id, missionSlugs(db), now) : leavePath(db, user, b.id, now);
  if (b.kind === "topic") return b.action === "enrol" ? enrolInTopic(db, user, b.id, now) : leaveTopic(db, user, b.id, now);
  throw new HttpError(400, "Enrol in a path or a topic.");
}
