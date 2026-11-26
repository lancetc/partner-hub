import "server-only";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";

/*
  The "Featured" tag (the owner, Nov 2026): a yellow tag over the picture on a Magazine course's card or a Discovery
  Path's card, ticked in its settings. Any number can carry it, and it shows straight away, without publishing. Kept as
  one site setting per kind (the tagged ids), so it needs no change to the database. Separate from the homepage
  spotlight (server/activityCatalogue featuredGuideId), which is one course at a time.
*/

export type FeaturedKind = "guide" | "path";
const KEYS: Record<FeaturedKind, string> = { guide: "magazine_featured_tags", path: "path_featured_tags" };
const TABLES: Record<FeaturedKind, string> = { guide: "magazine_guides", path: "learning_paths" };

/** The courses (or paths) tagged Featured. */
export function featuredTags(db: Db, kind: FeaturedKind = "guide"): Set<string> {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEYS[kind]) as { value: string } | undefined;
  try {
    const ids = row ? (JSON.parse(row.value) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Tags or untags a course (or a path). Authors only; audited. */
export function setFeaturedTag(db: Db, actor: User, id: string, on: boolean, now: Date, kind: FeaturedKind = "guide") {
  requireAuthor(actor);
  if (!db.prepare(`SELECT 1 FROM ${TABLES[kind]} WHERE id = ?`).get(id)) throw new HttpError(404, kind === "path" ? "Path not found." : "Guide not found.");
  const tags = featuredTags(db, kind);
  const before = tags.has(id);
  if (on) tags.add(id);
  else tags.delete(id);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    KEYS[kind],
    JSON.stringify([...tags]),
  );
  if (before !== on)
    audit(db, {
      actor: actor.id,
      event: `${kind === "path" ? "path" : "magazine"}.featured_tag`,
      entity: `${kind}:${id}`,
      previous: before,
      next: on,
      at: now,
    });
  return on;
}
