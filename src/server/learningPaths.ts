import "server-only";
import { lessons } from "@/content/lessons";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, requireReporter, type User } from "./auth";

/*
  Learning paths: a named set of lessons in order that an administrator assigns to people.
  Separate from spaced learning, which runs on its own after a single lesson.
*/

type PathRow = {
  id: string;
  name: string;
  description: string;
  audience: string;
  in_order: number;
  allow_skip: number;
  archived: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type AssignmentRow = { id: number; path_id: string; user_id: string; due_date: string | null; assigned_by: string; assigned_at: string };

export type PathInput = {
  name: string;
  description?: string;
  audience?: string;
  inOrder?: boolean;
  /** Let people on this path move on before a card's audio, video or activity is finished (for testers). */
  allowSkip?: boolean;
  lessons: string[];
};

/** Lessons that can go in a path: the catalogue, not spaced follow ups. */
const catalogue = () => lessons.filter((l) => l.track !== "reinforcement");
/** The lesson list shown in the path builder's checklist. */
export const catalogueInfo = () => catalogue().map((l) => ({ slug: l.slug, title: l.title, summary: l.summary, minutes: l.minutes, track: l.track }));
const lessonInfo = (slug: string) => {
  const l = catalogue().find((x) => x.slug === slug);
  return l ? { slug, title: l.title, minutes: l.minutes, track: l.track } : { slug, title: "Lesson no longer available", minutes: 0, track: null };
};

const slugsFor = (db: Db, pathId: string) =>
  (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(pathId) as { lesson_slug: string }[]).map(
    (r) => r.lesson_slug,
  );

const completedSlugs = (db: Db, userId: string) =>
  new Map(
    (
      db.prepare("SELECT lesson_slug, MIN(completed_at) AS at FROM lesson_completions WHERE user_id = ? GROUP BY lesson_slug").all(userId) as {
        lesson_slug: string;
        at: string;
      }[]
    ).map((r) => [r.lesson_slug, r.at]),
  );

function progress(db: Db, userId: string, slugs: string[], inOrder: boolean) {
  const done = completedSlugs(db, userId);
  const next = slugs.findIndex((s) => !done.has(s));
  const steps = slugs.map((s, i) => ({
    ...lessonInfo(s),
    completedAt: done.get(s) ?? null,
    // In-order paths open one lesson at a time; the rest wait for the one before.
    locked: inOrder && next !== -1 && i > next,
  }));
  const completed = steps.filter((s) => s.completedAt).length;
  return { steps, completed, total: slugs.length, nextSlug: next === -1 ? null : slugs[next], done: next === -1 && slugs.length > 0 };
}

/** People an administrator can assign: learners in their organisation, or anyone for Trilogy authors. */
export function assignableUsers(db: Db, actor: User) {
  requireReporter(actor);
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.audience, u.service_role, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.role = 'learner' ${canAuthor(actor) ? "" : "AND u.org_id = ?"} ORDER BY u.name`,
    )
    .all(...(canAuthor(actor) ? [] : [actor.org_id])) as { id: string; name: string; audience: string; service_role: string | null; org: string }[];
  return rows;
}

const inScope = (db: Db, actor: User, userId: string) => assignableUsers(db, actor).some((u) => u.id === userId);

function getRow(db: Db, id: string) {
  const row = db.prepare("SELECT * FROM learning_paths WHERE id = ? AND archived = 0").get(id) as PathRow | undefined;
  if (!row) throw new HttpError(404, "Learning path not found.");
  return row;
}

function requireEditor(actor: User, row: PathRow) {
  requireReporter(actor);
  if (!canAuthor(actor) && row.created_by !== actor.id) throw new HttpError(403, "Only the person who made this path, or a learning author, can change it.");
}

function validate(input: PathInput) {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Give the learning path a name.");
  if (name.length > 120) throw new HttpError(400, "Keep the name under 120 characters.");
  // A path can be saved with no lessons while it's being planned; it can't be assigned until it has some.
  if (!Array.isArray(input.lessons)) throw new HttpError(400, "Lessons must be a list.");
  if (new Set(input.lessons).size !== input.lessons.length) throw new HttpError(400, "Each lesson can only appear once in a path.");
  const unknown = input.lessons.filter((s) => !catalogue().some((l) => l.slug === s));
  if (unknown.length) throw new HttpError(400, `Unknown lesson: ${unknown.join(", ")}.`);
  return {
    name,
    description: (input.description ?? "").trim().slice(0, 500),
    audience: (input.audience ?? "").trim().slice(0, 120),
    inOrder: input.inOrder !== false,
    allowSkip: input.allowSkip === true,
    lessons: input.lessons,
  };
}

/** Assignments the actor may see: everyone for authors, their organisation for organisation admins. */
function visibleAssignments(db: Db, actor: User, pathId: string) {
  const rows = db
    .prepare(
      `SELECT a.*, u.name, u.org_id, o.name AS org FROM learning_path_assignments a JOIN users u ON u.id = a.user_id JOIN orgs o ON o.id = u.org_id
       WHERE a.path_id = ? ${canAuthor(actor) ? "" : "AND u.org_id = ?"} ORDER BY u.name`,
    )
    .all(...(canAuthor(actor) ? [pathId] : [pathId, actor.org_id])) as (AssignmentRow & { name: string; org: string })[];
  return rows;
}

export function listLearningPaths(db: Db, actor: User) {
  requireReporter(actor);
  const rows = db.prepare("SELECT * FROM learning_paths WHERE archived = 0 ORDER BY name").all() as PathRow[];
  return rows.map((p) => {
    const slugs = slugsFor(db, p.id);
    const people = visibleAssignments(db, actor, p.id).map((a) => progress(db, a.user_id, slugs, Boolean(p.in_order)));
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      audience: p.audience,
      inOrder: Boolean(p.in_order),
      allowSkip: Boolean(p.allow_skip),
      lessons: slugs.map(lessonInfo),
      minutes: slugs.reduce((n, s) => n + lessonInfo(s).minutes, 0),
      assigned: people.length,
      finished: people.filter((x) => x.done).length,
      canEdit: canAuthor(actor) || p.created_by === actor.id,
    };
  });
}

export function learningPathDetail(db: Db, actor: User, id: string) {
  requireReporter(actor);
  const p = getRow(db, id);
  const slugs = slugsFor(db, id);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    audience: p.audience,
    inOrder: Boolean(p.in_order),
    allowSkip: Boolean(p.allow_skip),
    lessons: slugs,
    canEdit: canAuthor(actor) || p.created_by === actor.id,
    assignments: visibleAssignments(db, actor, id).map((a) => ({
      userId: a.user_id,
      name: a.name,
      org: a.org,
      dueDate: a.due_date,
      assignedAt: a.assigned_at,
      ...progress(db, a.user_id, slugs, Boolean(p.in_order)),
    })),
    people: assignableUsers(db, actor),
    catalogue: catalogueInfo(),
  };
}

export function createLearningPath(db: Db, actor: User, input: PathInput, now: Date) {
  requireReporter(actor);
  const v = validate(input);
  const base =
    v.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "path";
  let id = `lp-${base}`;
  for (let n = 2; db.prepare("SELECT 1 FROM learning_paths WHERE id = ?").get(id); n++) id = `lp-${base}-${n}`;
  const at = now.toISOString();
  tx(db, () => {
    db.prepare(
      "INSERT INTO learning_paths (id, name, description, audience, in_order, allow_skip, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, v.name, v.description, v.audience, v.inOrder ? 1 : 0, v.allowSkip ? 1 : 0, actor.id, at, at);
    v.lessons.forEach((s, i) => db.prepare("INSERT INTO learning_path_lessons VALUES (?, ?, ?)").run(id, i, s));
    audit(db, { actor: actor.id, event: "learning_path.created", entity: `learning_path:${id}`, next: v, at: now });
  });
  return { id };
}

export function updateLearningPath(db: Db, actor: User, id: string, input: PathInput, now: Date) {
  const row = getRow(db, id);
  requireEditor(actor, row);
  const v = validate(input);
  const previous = {
    name: row.name,
    description: row.description,
    audience: row.audience,
    inOrder: Boolean(row.in_order),
    allowSkip: Boolean(row.allow_skip),
    lessons: slugsFor(db, id),
  };
  tx(db, () => {
    db.prepare("UPDATE learning_paths SET name = ?, description = ?, audience = ?, in_order = ?, allow_skip = ?, updated_at = ? WHERE id = ?").run(
      v.name,
      v.description,
      v.audience,
      v.inOrder ? 1 : 0,
      v.allowSkip ? 1 : 0,
      now.toISOString(),
      id,
    );
    db.prepare("DELETE FROM learning_path_lessons WHERE path_id = ?").run(id);
    v.lessons.forEach((s, i) => db.prepare("INSERT INTO learning_path_lessons VALUES (?, ?, ?)").run(id, i, s));
    audit(db, { actor: actor.id, event: "learning_path.updated", entity: `learning_path:${id}`, previous, next: v, at: now });
  });
}

/** Archiving hides the path; assignments and completions stay on record. */
export function archiveLearningPath(db: Db, actor: User, id: string, now: Date) {
  const row = getRow(db, id);
  requireEditor(actor, row);
  db.prepare("UPDATE learning_paths SET archived = 1, updated_at = ? WHERE id = ?").run(now.toISOString(), id);
  audit(db, { actor: actor.id, event: "learning_path.archived", entity: `learning_path:${id}`, at: now });
}

export function assignLearningPath(db: Db, actor: User, id: string, userIds: string[], dueDate: string | null, now: Date) {
  getRow(db, id);
  requireReporter(actor);
  if (!Array.isArray(userIds) || !userIds.length) throw new HttpError(400, "Choose at least one person.");
  if (!slugsFor(db, id).length) throw new HttpError(409, "Add lessons to this path before assigning it.");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new HttpError(400, "Use a date like 2026-11-30.");
  const outside = userIds.filter((u) => !inScope(db, actor, u));
  if (outside.length) throw new HttpError(403, "You can only assign people in your organisation.");
  const at = now.toISOString();
  tx(db, () => {
    for (const u of userIds) {
      db.prepare(
        `INSERT INTO learning_path_assignments (path_id, user_id, due_date, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path_id, user_id) DO UPDATE SET due_date = excluded.due_date`,
      ).run(id, u, dueDate, actor.id, at);
    }
    audit(db, { actor: actor.id, event: "learning_path.assigned", entity: `learning_path:${id}`, next: { userIds, dueDate }, at: now });
  });
}

export function unassignLearningPath(db: Db, actor: User, id: string, userId: string, now: Date) {
  getRow(db, id);
  requireReporter(actor);
  if (!inScope(db, actor, userId)) throw new HttpError(403, "You can only change assignments in your organisation.");
  db.prepare("DELETE FROM learning_path_assignments WHERE path_id = ? AND user_id = ?").run(id, userId);
  audit(db, {
    actor: actor.id,
    event: "learning_path.unassigned",
    entity: `learning_path:${id}`,
    previous: { userId },
    reason: "Removed by an administrator; completions are kept.",
    at: now,
  });
}

/** The learner's own assigned paths with progress, the next lesson and any due date. */
export function myLearningPaths(db: Db, user: User) {
  const rows = db
    .prepare(
      "SELECT a.due_date, p.* FROM learning_path_assignments a JOIN learning_paths p ON p.id = a.path_id WHERE a.user_id = ? AND p.archived = 0 ORDER BY a.due_date IS NULL, a.due_date, p.name",
    )
    .all(user.id) as (PathRow & { due_date: string | null })[];
  // Paths still being planned (no lessons yet) stay out of the learner's view.
  return rows
    .filter((p) => slugsFor(db, p.id).length)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      inOrder: Boolean(p.in_order),
      dueDate: p.due_date,
      ...progress(db, user.id, slugsFor(db, p.id), Boolean(p.in_order)),
    }));
}

/**
  True when the person is assigned a live learning path that includes this lesson and allows
  skipping: they can move on before audio, video or a required activity is finished.
*/
export function canSkipHolds(db: Db, userId: string, lessonSlug: string) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM learning_path_assignments a
         JOIN learning_paths p ON p.id = a.path_id AND p.archived = 0 AND p.allow_skip = 1
         JOIN learning_path_lessons l ON l.path_id = p.id AND l.lesson_slug = ?
         WHERE a.user_id = ? LIMIT 1`,
      )
      .get(lessonSlug, userId),
  );
}
