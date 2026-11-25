import "server-only";
import type { Db } from "./db";
import { readExciter, type Exciter } from "@/lib/pathExciter";

/*
  Where each Discovery Path's Discovery Exciter is kept (docs/discovery-exciter.md): one row per path, apart from the
  path's own fields, so saving the path never touches it and it never touches the description. Plus the learners'
  listening events. Made here, like the recording queue, so a database opened before they existed has them when needed.
*/

const ready = new WeakSet<Db>();
export function ensureExciterStore(db: Db) {
  if (ready.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS path_exciters (
    path_id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS path_intro_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, path_id TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS path_intro_events_path ON path_intro_events (path_id, at);`);
  ready.add(db);
}

/** A path's Exciter as stored, or undefined for none. */
export function storedExciter(db: Db, pathId: string): Exciter | undefined {
  ensureExciterStore(db);
  const row = db.prepare("SELECT doc FROM path_exciters WHERE path_id = ?").get(pathId) as { doc: string } | undefined;
  if (!row) return undefined;
  try {
    return readExciter(JSON.parse(row.doc));
  } catch {
    return undefined;
  }
}

/** Every stored Exciter, by path. */
export function storedExciters(db: Db): Map<string, Exciter> {
  ensureExciterStore(db);
  const out = new Map<string, Exciter>();
  for (const r of db.prepare("SELECT path_id, doc FROM path_exciters").all() as { path_id: string; doc: string }[]) {
    try {
      const n = readExciter(JSON.parse(r.doc));
      if (n) out.set(r.path_id, n);
    } catch {
      // A damaged row reads as no Exciter rather than breaking the list.
    }
  }
  return out;
}

/** Saves (or, with undefined, removes) a path's Exciter. Checked on the way in, like on the way out. */
export function writeExciter(db: Db, pathId: string, n: Exciter | undefined, by: string, now: Date) {
  ensureExciterStore(db);
  const clean = n && readExciter({ ...n, updatedAt: now.toISOString() });
  if (!clean) {
    db.prepare("DELETE FROM path_exciters WHERE path_id = ?").run(pathId);
    return undefined;
  }
  db.prepare(
    `INSERT INTO path_exciters (path_id, doc, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(path_id) DO UPDATE SET doc = excluded.doc, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(pathId, JSON.stringify(clean), by, now.toISOString());
  return clean;
}

export type SeedResult = "created" | "replaced" | "kept" | "same";
/**
  Gives a path a starting Exciter script, as a draft for the author to review (the migration of existing paths, and the
  ALIS builder). Idempotent, and never over an author's work: it writes only when there's no Exciter yet, or replaces
  an earlier seed that's still an unrecorded draft. An approved, recorded, AI-written or edited script is kept.
*/
export function seedExciter(db: Db, pathId: string, script: string, by: string, now: Date): SeedResult {
  const n = storedExciter(db, pathId);
  const outcome = seedOutcome(n, script);
  const words = script.trim();
  if (outcome === "created") writeExciter(db, pathId, { script: words, status: "draft", version: 1, source: "seed" }, by, now);
  if (outcome === "replaced" && n) writeExciter(db, pathId, { ...n, script: words, version: (n.version ?? 1) + 1 }, by, now);
  return outcome;
}

/** What seeding this script would do to this Exciter (for a dry run). */
export function seedOutcome(n: Exciter | undefined, script: string): SeedResult {
  const words = script.trim();
  if (!words) return "kept";
  if (!n) return "created";
  const w = n.next ?? n;
  if (w.script.trim() === words) return "same";
  if (n.next || n.status !== "draft" || n.source !== "seed" || n.audio) return "kept";
  return "replaced";
}
