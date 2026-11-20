import "server-only";
import { canCopy, cleanTile, EVENTS, tileProblems, tileState, type MythEvent, type MythTileData, type Tile, type TileStatus } from "@/lib/myths";
import { SEED_TILES } from "@/content/mythTiles";
import { audit, ensureMyths as ensureTables, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";

/*
  Myth vs Reality tile library (docs/myth-vs-reality.md).

  - One canonical library. A course block and the Resources page both show each tile's current approved version.
  - Approved versions are never edited. A change is a new draft version that needs its sign-off again; the
    previous approved version stays in the history (retired) and in the events that recorded it.
  - Learners never see drafts. An approved tile past its review date, or paused, shows as under review and
    can't be copied.
  - Copying is recorded as "copied", never as sent or as client contact. No names, addresses or edited message
    text are stored.
*/

type Row = {
  id: string;
  version: number;
  status: TileStatus;
  paused: number;
  data: string;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
};

const today = (now: Date) => now.toISOString().slice(0, 10);
const toTile = (r: Row): Tile => ({
  id: r.id,
  version: r.version,
  status: r.status,
  paused: Boolean(r.paused),
  data: cleanTile(JSON.parse(r.data)),
  approvedBy: r.approved_by ?? "",
  approvedAt: r.approved_at ?? "",
  updatedAt: r.updated_at,
});

const seeded = new WeakSet<object>();
/** The tables, and the four seed tiles as drafts the first time. */
export function ensureMyths(db: Db, now = new Date()) {
  ensureTables(db);
  if (seeded.has(db)) return;
  const ins = db.prepare(
    "INSERT OR IGNORE INTO myth_tiles (id, version, status, paused, data, created_by, created_at, updated_at) VALUES (?, 1, 'draft', 0, ?, 'seed', ?, ?)",
  );
  for (const t of SEED_TILES) {
    const has = db.prepare("SELECT 1 FROM myth_tiles WHERE id = ?").get(t.id);
    if (!has) ins.run(t.id, JSON.stringify(t.data), now.toISOString(), now.toISOString());
  }
  seeded.add(db);
}

const versions = (db: Db, id: string) => (db.prepare("SELECT * FROM myth_tiles WHERE id = ? ORDER BY version DESC").all(id) as Row[]).map(toTile);
const latest = (db: Db, id: string) => versions(db, id)[0];
const current = (db: Db, id: string) => versions(db, id).find((t) => t.status === "approved");
const ids = (db: Db) => (db.prepare("SELECT DISTINCT id FROM myth_tiles ORDER BY id").all() as { id: string }[]).map((r) => r.id);

/** What a reader gets: the tile, whether it's under review, and whether it can be copied today. */
const forReader = (t: Tile, now: Date) => ({ ...t, state: tileState(t, today(now)), copyable: canCopy(t, today(now)) });
export type ReaderTile = ReturnType<typeof forReader>;

/**
  Tiles for a course block or the Resources page: the current approved version of each, in order. Drafts are
  never shown to learners. An author previewing gets the latest version, drafts included, clearly marked.
*/
export function tilesFor(db: Db, user: User, wanted: string[] | null, now: Date, { preview = false } = {}) {
  ensureMyths(db, now);
  const list = wanted ?? ids(db);
  const out: (ReaderTile & { preview?: boolean })[] = [];
  const missing: string[] = [];
  for (const id of list) {
    const t = preview && canAuthor(user) ? latest(db, id) : current(db, id);
    if (t) out.push({ ...forReader(t, now), preview: preview && t.status !== "approved" });
    else missing.push(id);
  }
  return { tiles: out, missing, today: today(now) };
}

/** Which tiles in a block can't be published: any without a current approved version, or one under review. */
export function unpublishableTiles(db: Db, tileIds: string[], now: Date): string[] {
  ensureMyths(db, now);
  return tileIds
    .map((id) => {
      const t = current(db, id);
      if (!t) return `“${latest(db, id)?.data.quote ?? id}” has no approved version yet.`;
      if (tileState(t, today(now)) !== "approved") return `“${t.data.quote}” is under review.`;
      return "";
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// The library, for authors
// ---------------------------------------------------------------------------------------------

export function library(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureMyths(db, now);
  const flags = db.prepare("SELECT tile_id, COUNT(*) AS n FROM myth_flags WHERE kind = 'outdated' AND status = 'open' GROUP BY tile_id").all() as {
    tile_id: string;
    n: number;
  }[];
  return {
    today: today(now),
    tiles: ids(db).map((id) => {
      const all = versions(db, id);
      const live = all.find((t) => t.status === "approved");
      const draft = all[0].status === "draft" ? all[0] : null;
      return {
        id,
        latest: all[0],
        live: live ? forReader(live, now) : null,
        draft,
        problems: draft ? tileProblems(draft.data) : [],
        history: all.map((t) => ({ version: t.version, status: t.status, approvedBy: t.approvedBy, approvedAt: t.approvedAt, updatedAt: t.updatedAt })),
        openFlags: flags.find((f) => f.tile_id === id)?.n ?? 0,
      };
    }),
  };
}

/** Saves a draft. Editing an approved tile starts a new draft version; the approved one is untouched. */
export function saveTile(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureMyths(db, now);
  const data = cleanTile(input.data);
  const at = now.toISOString();
  const id = typeof input.id === "string" && /^[a-z0-9-]{3,80}$/.test(input.id) ? input.id : "";
  return tx(db, () => {
    if (!id) {
      const fresh = `myth-${Math.random().toString(36).slice(2, 10)}`;
      db.prepare("INSERT INTO myth_tiles (id, version, status, paused, data, created_by, created_at, updated_at) VALUES (?, 1, 'draft', 0, ?, ?, ?, ?)").run(
        fresh,
        JSON.stringify(data),
        actor.id,
        at,
        at,
      );
      audit(db, { actor: actor.id, event: "myth.created", entity: `myth:${fresh}`, at: now });
      return latest(db, fresh);
    }
    const top = latest(db, id);
    if (!top) throw new HttpError(404, "That tile isn’t in the library.");
    if (top.status === "draft")
      db.prepare("UPDATE myth_tiles SET data = ?, updated_at = ? WHERE id = ? AND version = ?").run(JSON.stringify(data), at, id, top.version);
    else
      db.prepare("INSERT INTO myth_tiles (id, version, status, paused, data, created_by, created_at, updated_at) VALUES (?, ?, 'draft', 0, ?, ?, ?, ?)").run(
        id,
        top.version + 1,
        JSON.stringify(data),
        actor.id,
        at,
        at,
      );
    return latest(db, id);
  });
}

/** Approves the latest draft, once nothing blocks it. The previous approved version is retired, not deleted. */
export function approveTile(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  ensureMyths(db, now);
  const draft = latest(db, id);
  if (!draft || draft.status !== "draft") throw new HttpError(400, "There’s no draft to approve.");
  const problems = tileProblems(draft.data);
  if (draft.data.reviewDue && draft.data.reviewDue <= today(now)) problems.push("Set a review date in the future.");
  if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
  tx(db, () => {
    db.prepare("UPDATE myth_tiles SET status = 'retired' WHERE id = ? AND status = 'approved'").run(id);
    db.prepare("UPDATE myth_tiles SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ? AND version = ?").run(
      actor.id,
      now.toISOString(),
      now.toISOString(),
      id,
      draft.version,
    );
    audit(db, { actor: actor.id, event: "myth.approved", entity: `myth:${id}:v${draft.version}`, next: { approval: draft.data.approval }, at: now });
  });
  return latest(db, id);
}

/** Puts the approved version under review (a policy change, say), or takes it off. Copying stops while it's paused. */
export function pauseTile(db: Db, actor: User, id: string, paused: boolean, reason: unknown, now: Date) {
  requireAuthor(actor);
  const live = current(db, id);
  if (!live) throw new HttpError(400, "There’s no approved version to pause.");
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (paused && why.length < 3) throw new HttpError(400, "Say briefly why it’s under review.");
  if (!paused && tileState({ ...live, paused: false }, today(now)) !== "approved")
    throw new HttpError(400, "It’s past its review date: approve a new version instead.");
  db.prepare("UPDATE myth_tiles SET paused = ? WHERE id = ? AND version = ?").run(paused ? 1 : 0, id, live.version);
  audit(db, { actor: actor.id, event: paused ? "myth.paused" : "myth.resumed", entity: `myth:${id}:v${live.version}`, reason: why || undefined, at: now });
  return current(db, id);
}

// ---------------------------------------------------------------------------------------------
// What learners do
// ---------------------------------------------------------------------------------------------

/** Opens, source opens, practice and copies. Copying is never recorded as sending or as client contact. */
export function logMyth(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureMyths(db, now);
  const event = EVENTS.includes(input.event as MythEvent) ? (input.event as MythEvent) : null;
  if (!event) throw new HttpError(400, "Unknown event.");
  const t = typeof input.tileId === "string" ? versions(db, input.tileId).find((x) => x.version === input.version) : undefined;
  if (!t) throw new HttpError(404, "That tile isn’t in the library.");
  if (event === "copied" && !canCopy(t, today(now))) throw new HttpError(400, "This tile is under review, so its email can’t be copied.");
  db.prepare("INSERT INTO myth_events (at, user_id, tile_id, version, event, guide_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    t.id,
    t.version,
    event,
    typeof input.guideId === "string" ? input.guideId.slice(0, 80) : null,
  );
  return { ok: true };
}

/** "Useful", or "Wording looks out of date" with a note. An outdated flag goes to the library's review queue. */
export function flagMyth(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureMyths(db, now);
  const kind = input.kind === "useful" ? "useful" : input.kind === "outdated" ? "outdated" : null;
  if (!kind) throw new HttpError(400, "Unknown flag.");
  const t = typeof input.tileId === "string" ? versions(db, input.tileId).find((x) => x.version === input.version) : undefined;
  if (!t) throw new HttpError(404, "That tile isn’t in the library.");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 600) : "";
  if (kind === "outdated" && note.length < 5) throw new HttpError(400, "Say a little about what looks out of date.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  if ((db.prepare("SELECT COUNT(*) AS n FROM myth_flags WHERE user_id = ? AND at >= ?").get(user.id, since) as { n: number }).n >= 10)
    throw new HttpError(429, "Thanks, that’s a lot for one hour. Try again later.");
  if (kind === "useful") {
    const had = db.prepare("SELECT 1 FROM myth_flags WHERE user_id = ? AND tile_id = ? AND version = ? AND kind = 'useful'").get(user.id, t.id, t.version);
    if (had) return { ok: true };
  }
  db.prepare("INSERT INTO myth_flags (at, user_id, tile_id, version, kind, note, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    t.id,
    t.version,
    kind,
    note,
    kind === "outdated" ? "open" : "noted",
  );
  return { ok: true };
}

/** The editorial queue: open "out of date" flags, newest first, with the reporter's first name. */
export function openMythFlags(db: Db, actor: User) {
  requireAuthor(actor);
  return (
    db
      .prepare(
        "SELECT f.id, f.at, f.tile_id, f.version, f.note, u.name FROM myth_flags f JOIN users u ON u.id = f.user_id WHERE f.kind = 'outdated' AND f.status = 'open' ORDER BY f.at DESC",
      )
      .all() as { id: number; at: string; tile_id: string; version: number; note: string; name: string }[]
  ).map((r) => ({ id: r.id, at: r.at, tileId: r.tile_id, version: r.version, note: r.note, by: r.name.split(" ")[0] }));
}

export function resolveMythFlag(db: Db, actor: User, id: unknown, resolution: unknown, now: Date) {
  requireAuthor(actor);
  const row = db.prepare("SELECT id FROM myth_flags WHERE id = ? AND status = 'open'").get(Number(id));
  if (!row) throw new HttpError(404, "That flag is already dealt with.");
  db.prepare("UPDATE myth_flags SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ? WHERE id = ?").run(
    actor.id,
    now.toISOString(),
    typeof resolution === "string" ? resolution.trim().slice(0, 300) : "",
    Number(id),
  );
  audit(db, { actor: actor.id, event: "myth.flag_resolved", entity: `myth_flag:${id}`, at: now });
}

/** For authors, per tile: opens, source opens, practice, copies and usefulness. Counts only; a copy is not a send. */
export function mythStats(db: Db, actor: User) {
  requireAuthor(actor);
  const rows = db.prepare("SELECT tile_id, event, COUNT(*) AS n FROM myth_events GROUP BY tile_id, event").all() as {
    tile_id: string;
    event: string;
    n: number;
  }[];
  const useful = db.prepare("SELECT tile_id, COUNT(*) AS n FROM myth_flags WHERE kind = 'useful' GROUP BY tile_id").all() as { tile_id: string; n: number }[];
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.tile_id] ??= {})[r.event] = r.n;
  for (const u of useful) (out[u.tile_id] ??= {}).useful = u.n;
  return out;
}

export type LibraryTile = ReturnType<typeof library>["tiles"][number];
export type { MythTileData };
