import "server-only";
import { stories, type Story } from "@/content/stories";
import type { Db } from "./db";

/*
  News stories edited in admin. The site reads the shared `stories` list, so published edits are
  swapped into it, new stories added, and drafts and deleted stories taken out, whenever the
  database is opened (as lessons are in lessonRegistry).
*/

// Taken once, before any edits are swapped in, and kept across code reloads: re-copying the shared
// list later would capture the edited stories as "originals".
const shared = globalThis as unknown as { __storyOriginals?: Story[] };
const originals = (shared.__storyOriginals ??= stories.slice());
let signature: string | null = null;

export function syncStories(db: Db) {
  const rows = db.prepare("SELECT slug, data, status, updated_at, deleted_at FROM authored_stories ORDER BY created_at").all() as {
    slug: string;
    data: string;
    status: string;
    updated_at: string;
    deleted_at: string | null;
  }[];
  const sig = rows.map((r) => `${r.slug}@${r.updated_at}${r.status}${r.deleted_at ? "x" : ""}`).join("|");
  if (sig === signature) return;
  signature = sig;
  const hidden = new Set(rows.filter((r) => r.deleted_at || r.status !== "published").map((r) => r.slug));
  const live = new Map(rows.filter((r) => !hidden.has(r.slug)).map((r) => [r.slug, JSON.parse(r.data) as Story]));
  const next = originals.filter((s) => !hidden.has(s.slug)).map((s) => live.get(s.slug) ?? s);
  for (const [slug, s] of live) if (!originals.some((o) => o.slug === slug)) next.push(s);
  stories.splice(0, stories.length, ...next);
}

/** The story as it shipped in the content file, before any edits. */
export const originalStory = (slug: string) => originals.find((s) => s.slug === slug);
/** Every story that shipped with the site. */
export const originalStories = () => originals.slice();

/** Reload after a change, even if the signature looks the same (e.g. within the same millisecond). */
export function refreshStories(db: Db) {
  // null, not "": with nothing saved the signature is "" and the sync would think nothing changed.
  signature = null;
  syncStories(db);
}
