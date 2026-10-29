import "server-only";
import type { Lesson } from "@/content/lessons";
import { diffLessons } from "@/lib/lessonDiff";
import type { Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";

/*
  Version history. Every publish keeps a copy of the lesson with a note of what changed and whether
  it was a minor fix or an important change. Versions can be compared and restored. The first time
  a lesson from the content files is published, its original is kept too, as the starting point.
*/

type Row = { slug: string; version: string; content: string; notes: string; kind: "minor" | "important"; published_by: string; published_at: string };

export function recordVersion(
  db: Db,
  slug: string,
  lesson: Lesson,
  opts: { notes: string; kind: "minor" | "important"; by: string; at: string; baseline?: Lesson | null; baselineAt?: string | null },
) {
  const has = db.prepare("SELECT 1 FROM lesson_versions WHERE slug = ? LIMIT 1").get(slug);
  // The version learners had before history was kept.
  if (!has && opts.baseline && opts.baseline.version !== lesson.version)
    db.prepare(
      "INSERT OR IGNORE INTO lesson_versions (slug, version, content, notes, kind, published_by, published_at) VALUES (?, ?, ?, ?, 'minor', ?, ?)",
    ).run(
      slug,
      opts.baseline.version,
      JSON.stringify(opts.baseline),
      "The topic as it was before version history began.",
      "content files",
      opts.baselineAt ?? "",
    );
  db.prepare(
    `INSERT INTO lesson_versions (slug, version, content, notes, kind, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug, version) DO UPDATE SET content = excluded.content, notes = excluded.notes, kind = excluded.kind, published_by = excluded.published_by, published_at = excluded.published_at`,
  ).run(slug, lesson.version, JSON.stringify(lesson), opts.notes.trim().slice(0, 1000), opts.kind, opts.by, opts.at);
}

const ordered = (db: Db, slug: string) => db.prepare("SELECT * FROM lesson_versions WHERE slug = ? ORDER BY published_at, rowid").all(slug) as Row[];

export function listVersions(db: Db, actor: User, slug: string) {
  requireAuthor(actor);
  const names = new Map((db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const rows = ordered(db, slug);
  return rows
    .map((r, i) => ({
      version: r.version,
      notes: r.notes,
      kind: r.kind,
      by: names.get(r.published_by) ?? r.published_by,
      at: r.published_at || null,
      changes: diffLessons(i ? (JSON.parse(rows[i - 1].content) as Lesson) : null, JSON.parse(r.content) as Lesson),
      latest: i === rows.length - 1,
    }))
    .reverse();
}

export function versionContent(db: Db, slug: string, version: string) {
  const row = db.prepare("SELECT content FROM lesson_versions WHERE slug = ? AND version = ?").get(slug, version) as { content: string } | undefined;
  if (!row) throw new HttpError(404, "That version isn’t in the history.");
  return JSON.parse(row.content) as Lesson;
}

/** Important changes published after the version someone completed, newest first. */
export function importantChangesSince(db: Db, slug: string, version: string) {
  const rows = ordered(db, slug);
  const from = rows.findIndex((r) => r.version === version);
  if (from < 0) return [];
  return rows
    .slice(from + 1)
    .filter((r) => r.kind === "important")
    .map((r) => ({ version: r.version, notes: r.notes, at: r.published_at }))
    .reverse();
}
