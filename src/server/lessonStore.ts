import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import type { Db } from "./db";

/*
  Master lessons live in the content files. Spaced learning variations written by Claude are
  stored in the database until an author approves them. Both are read through here.
*/

export type GeneratedRow = {
  slug: string;
  master_slug: string;
  stage: string;
  status: "draft" | "approved";
  content: string;
  model: string | null;
  created_at: string;
  approved_at: string | null;
};

export function getLesson(db: Db, slug: string): (Lesson & { generated?: { status: string; master: string; stage: string } }) | undefined {
  const fixed = lessons.find((l) => l.slug === slug);
  if (fixed) return fixed;
  const row = db.prepare("SELECT * FROM generated_lessons WHERE slug = ?").get(slug) as GeneratedRow | undefined;
  if (!row) return undefined;
  return { ...(JSON.parse(row.content) as Lesson), generated: { status: row.status, master: row.master_slug, stage: row.stage } };
}

export function generatedFor(db: Db, master: string) {
  return db.prepare("SELECT * FROM generated_lessons WHERE master_slug = ? ORDER BY CASE stage WHEN 'Recall' THEN 1 WHEN 'Apply' THEN 2 WHEN 'Refresh' THEN 3 ELSE 4 END").all(master) as GeneratedRow[];
}

export type LessonSetting = { slug: string; spaced: number; signoff: number; path_id: string | null; updated_at: string | null };

export function lessonSetting(db: Db, slug: string) {
  return db.prepare("SELECT * FROM lesson_settings WHERE slug = ?").get(slug) as LessonSetting | undefined;
}

/** True when the master lesson's spaced learning checkbox is ticked. */
export const isSpaced = (db: Db, slug: string) => Boolean(lessonSetting(db, slug)?.spaced);
