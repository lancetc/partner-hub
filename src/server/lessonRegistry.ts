import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import type { Db } from "./db";

/*
  Lessons authors have published from the editor. The rest of the app reads the shared `lessons`
  list, so published versions are swapped into it (and brand-new lessons added) whenever the
  database is opened. Deleted lessons are taken out of it. Each server bundle has its own copy of
  the list, so each one keeps in step.
*/

const originals = lessons.slice();
let signature: string | null = null;

export function syncPublishedLessons(db: Db) {
  const rows = db
    .prepare("SELECT slug, published, published_at, deleted_at FROM authored_lessons WHERE published IS NOT NULL OR deleted_at IS NOT NULL ORDER BY created_at")
    .all() as { slug: string; published: string | null; published_at: string | null; deleted_at: string | null }[];
  const sig = rows.map((r) => `${r.slug}@${r.published_at}${r.deleted_at ? "x" : ""}`).join("|");
  if (sig === signature) return;
  signature = sig;
  const deleted = new Set(rows.filter((r) => r.deleted_at).map((r) => r.slug));
  const published = new Map(rows.filter((r) => r.published && !r.deleted_at).map((r) => [r.slug, JSON.parse(r.published!) as Lesson]));
  const next = originals.filter((l) => !deleted.has(l.slug)).map((l) => published.get(l.slug) ?? l);
  for (const [slug, l] of published) if (!originals.some((o) => o.slug === slug)) next.push(l);
  lessons.splice(0, lessons.length, ...next);
}

/** The lesson as it shipped in the content files, before any edits. */
export const originalLesson = (slug: string) => originals.find((l) => l.slug === slug);

/** Reload the live lessons even though nothing was published (e.g. a picture they use was replaced). */
export function refreshPublishedLessons(db: Db) {
  signature = "";
  syncPublishedLessons(db);
}
