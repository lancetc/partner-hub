import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { originalLesson, syncPublishedLessons } from "./lessonRegistry";

/*
  Saving lessons from the editor. Save draft keeps the author's work without changing what learners
  see; Publish makes the draft live as a new version. Discard throws away unpublished changes.
*/

type Row = {
  slug: string;
  draft: string;
  published: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
  published_at: string | null;
  deleted_at: string | null;
};

const TRACKS: Lesson["track"][] = ["core", "partner", "coordinator", "briefing"];
const MAX_BYTES = 2_000_000;

const row = (db: Db, slug: string) => db.prepare("SELECT * FROM authored_lessons WHERE slug = ?").get(slug) as Row | undefined;

export type LessonStatus = {
  /** `unpublished`: saved but never live. `changes`: live, with saved changes not yet published. */
  state: "unpublished" | "live" | "changes";
  version: string;
  updatedAt: string | null;
  publishedAt: string | null;
};

function statusOf(r: Row | undefined, slug: string): LessonStatus {
  const live = r?.published ? (JSON.parse(r.published) as Lesson) : originalLesson(slug);
  return {
    state: !live ? "unpublished" : r && r.draft !== r.published ? "changes" : "live",
    version: live?.version ?? "0.1",
    updatedAt: r?.updated_at ?? null,
    publishedAt: r?.published_at ?? null,
  };
}

/** What the editor opens: the latest saved draft, else the live lesson. */
export function editorLesson(db: Db, slug: string) {
  const r = row(db, slug);
  if (r?.deleted_at) return undefined;
  const lesson = r ? (JSON.parse(r.draft) as Lesson) : lessons.find((l) => l.slug === slug && l.track !== "reinforcement");
  if (!lesson) return undefined;
  return { lesson, status: statusOf(r, slug) };
}

/** Saved lessons that have never been published, for the admin list. */
export function unpublishedLessons(db: Db) {
  return (db.prepare("SELECT * FROM authored_lessons WHERE published IS NULL AND deleted_at IS NULL ORDER BY created_at DESC").all() as Row[]).map(
    (r) => JSON.parse(r.draft) as Lesson,
  );
}

export function lessonStatus(db: Db, slug: string) {
  return statusOf(row(db, slug), slug);
}

function validate(input: Lesson, slug: string): Lesson {
  if (!input || typeof input !== "object" || !input.nodes || typeof input.nodes !== "object") throw new HttpError(400, "That doesn’t look like a lesson.");
  const title = String(input.title ?? "").trim();
  if (!title) throw new HttpError(400, "Give the lesson a title.");
  const ids = Object.keys(input.nodes);
  if (!ids.length) throw new HttpError(400, "Add at least one card.");
  if (!input.nodes[input.start]) throw new HttpError(400, "The lesson’s first card is missing.");
  for (const id of ids) if (input.nodes[id]?.id !== id) throw new HttpError(400, `Card “${id}” is damaged. Reload the editor and try again.`);
  if (!TRACKS.includes(input.track)) throw new HttpError(400, "Choose who the lesson is for.");
  const lesson = { ...input, slug, title: title.slice(0, 160) };
  if (JSON.stringify(lesson).length > MAX_BYTES) throw new HttpError(413, "This lesson is too large to save. Use uploaded images rather than pasted ones.");
  return lesson;
}

const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "lesson";

const taken = (db: Db, slug: string) =>
  lessons.some((l) => l.slug === slug) || Boolean(row(db, slug)) || Boolean(db.prepare("SELECT 1 FROM generated_lessons WHERE slug = ?").get(slug));

/** First save of a new lesson: its address comes from the title and never changes after. */
export function createLesson(db: Db, actor: User, input: Lesson, now: Date) {
  requireAuthor(actor);
  const base = slugify(String(input?.title ?? ""));
  let slug = base;
  for (let n = 2; taken(db, slug); n++) slug = `${base}-${n}`;
  const lesson = validate({ ...input, version: "0.1" }, slug);
  const at = now.toISOString();
  db.prepare("INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)").run(
    slug,
    JSON.stringify(lesson),
    actor.id,
    at,
    actor.id,
    at,
  );
  audit(db, { actor: actor.id, event: "lesson.created", entity: `lesson:${slug}`, at: now });
  return { slug, status: lessonStatus(db, slug) };
}

export function saveDraft(db: Db, actor: User, slug: string, input: Lesson, now: Date) {
  requireAuthor(actor);
  const existing = row(db, slug);
  const live = lessons.find((l) => l.slug === slug && l.track !== "reinforcement");
  if ((!existing && !live) || existing?.deleted_at) throw new HttpError(404, "Lesson not found.");
  const lesson = validate(input, slug);
  const at = now.toISOString();
  if (existing)
    db.prepare("UPDATE authored_lessons SET draft = ?, updated_by = ?, updated_at = ? WHERE slug = ?").run(JSON.stringify(lesson), actor.id, at, slug);
  else
    db.prepare("INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)").run(
      slug,
      JSON.stringify(lesson),
      actor.id,
      at,
      actor.id,
      at,
    );
  // A content-file lesson edited for the first time is still live as it was: keep that as its published copy.
  if (!existing && live)
    db.prepare("UPDATE authored_lessons SET published = ?, published_at = ? WHERE slug = ?").run(JSON.stringify(originalLesson(slug) ?? live), null, slug);
  audit(db, { actor: actor.id, event: "lesson.saved", entity: `lesson:${slug}`, at: now });
  return { slug, status: lessonStatus(db, slug) };
}

/** 1.0-demo → 1.1, 1.4 → 1.5; a lesson's first publish is 1.0. */
export function nextVersion(current: string | undefined, firstPublish: boolean) {
  if (firstPublish) return "1.0";
  const m = /^(\d+)\.(\d+)/.exec(current ?? "");
  return m ? `${m[1]}.${Number(m[2]) + 1}` : "1.1";
}

export function publishLesson(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const r = row(db, slug);
  if (r?.deleted_at) throw new HttpError(404, "Lesson not found.");
  if (!r) throw new HttpError(409, "Save the lesson before publishing it.");
  const live = r.published ? (JSON.parse(r.published) as Lesson) : undefined;
  const draft = JSON.parse(r.draft) as Lesson;
  const lesson = { ...draft, version: nextVersion(live?.version, !live) };
  const at = now.toISOString();
  db.prepare("UPDATE authored_lessons SET draft = ?, published = ?, published_at = ?, updated_at = ?, updated_by = ? WHERE slug = ?").run(
    JSON.stringify(lesson),
    JSON.stringify(lesson),
    at,
    at,
    actor.id,
    slug,
  );
  audit(db, { actor: actor.id, event: "lesson.published", entity: `lesson:${slug}`, previous: live?.version ?? null, next: lesson.version, at: now });
  syncPublishedLessons(db);
  return { slug, version: lesson.version, status: lessonStatus(db, slug) };
}

/** Throw away saved changes: back to the live version, or delete a lesson that was never published. */
export function discardDraft(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const r = row(db, slug);
  if (!r) throw new HttpError(404, "Nothing saved to discard.");
  if (r.published)
    db.prepare("UPDATE authored_lessons SET draft = published, updated_at = ?, updated_by = ? WHERE slug = ?").run(now.toISOString(), actor.id, slug);
  else db.prepare("DELETE FROM authored_lessons WHERE slug = ?").run(slug);
  audit(db, { actor: actor.id, event: "lesson.discarded", entity: `lesson:${slug}`, at: now });
  return { slug, deleted: !r.published };
}

/** Learning paths (not archived) that include the lesson. */
function pathsWith(db: Db, slug: string) {
  return (
    db
      .prepare(
        "SELECT DISTINCT p.name FROM learning_path_lessons l JOIN learning_paths p ON p.id = l.path_id AND p.archived = 0 WHERE l.lesson_slug = ? ORDER BY p.name",
      )
      .all(slug) as { name: string }[]
  ).map((r) => r.name);
}

/**
  Delete a lesson: learners no longer see it, and it leaves the admin list and path picker.
  Progress, completions and the lesson itself stay on record, so it can be restored. A lesson
  that's part of a learning path has to come out of the path first.
*/
export function deleteLesson(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const r = row(db, slug);
  const live = lessons.find((l) => l.slug === slug && l.track !== "reinforcement");
  if ((!r && !live) || r?.deleted_at) throw new HttpError(404, "Lesson not found.");
  const paths = pathsWith(db, slug);
  if (paths.length)
    throw new HttpError(
      409,
      `This lesson is in ${paths.length === 1 ? "the learning path" : "the learning paths"} ${paths.map((p) => `“${p}”`).join(", ")}. Take it out of ${paths.length === 1 ? "that path" : "those paths"} first.`,
    );
  const at = now.toISOString();
  if (r) db.prepare("UPDATE authored_lessons SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE slug = ?").run(at, at, actor.id, slug);
  else {
    const json = JSON.stringify(originalLesson(slug) ?? live);
    db.prepare(
      "INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at, published_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)",
    ).run(slug, json, json, actor.id, at, actor.id, at, at);
  }
  // No new spaced learning follow ups start from a deleted lesson; anyone part way through carries on.
  db.prepare("UPDATE lesson_settings SET spaced = 0, updated_at = ?, updated_by = ? WHERE slug = ?").run(at, actor.id, slug);
  audit(db, { actor: actor.id, event: "lesson.deleted", entity: `lesson:${slug}`, at: now });
  syncPublishedLessons(db);
  return { slug };
}

export function restoreLesson(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const r = row(db, slug);
  if (!r?.deleted_at) throw new HttpError(404, "That lesson isn’t deleted.");
  db.prepare("UPDATE authored_lessons SET deleted_at = NULL, updated_at = ?, updated_by = ? WHERE slug = ?").run(now.toISOString(), actor.id, slug);
  audit(db, { actor: actor.id, event: "lesson.restored", entity: `lesson:${slug}`, at: now });
  syncPublishedLessons(db);
  return { slug };
}

/** Deleted lessons, newest first, for the admin list's restore section. */
export function deletedLessons(db: Db) {
  return (db.prepare("SELECT * FROM authored_lessons WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all() as Row[]).map((r) => {
    const l = JSON.parse(r.published ?? r.draft) as Lesson;
    return { slug: r.slug, title: l.title, cards: Object.keys(l.nodes).length, deletedAt: r.deleted_at!, published: Boolean(r.published) };
  });
}
