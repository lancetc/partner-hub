import "server-only";
import { audit, type Db } from "./db";
import { HttpError, isSuperadmin, type User } from "./auth";

/*
  Demo sign-off (docs/demo-sign-off.md). Many Magazine blocks can't be published until named reviewers sign them off
  (a lab's case, a Spot the Hazard scene's variants, a case thread's note), and "Publish anyway" never covers that. In
  a demo Hub there are no real reviewers, so a superadmin can record a demo sign-off for a course instead: it lets the
  course publish without those sign-offs and says so on the record (the audit log, and each edition published under it),
  and never pretends anyone reviewed it.

  It's off unless the Hub is told it's a demo: HUB_DEMO_SIGNOFF=1, or a local development server (unless
  HUB_DEMO_SIGNOFF=0). Leave it unset on Trilogy Care's servers.

  The checks a demo sign-off doesn't skip: a Red Pen case that looks like it holds a real identifier, a Job Aid
  that isn't in the library, and the Question Pool's approval gate.
*/

export const demoSignOffEnabled = () =>
  process.env.HUB_DEMO_SIGNOFF === "1" || (process.env.NODE_ENV === "development" && process.env.HUB_DEMO_SIGNOFF !== "0");

export type DemoSignOff = { by: string; byName: string; at: string };

const ensured = new WeakSet<Db>();
function ensure(db: Db) {
  if (ensured.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS magazine_demo_signoffs (
      guide_id TEXT PRIMARY KEY,
      signed_by TEXT NOT NULL,
      signed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS magazine_demo_editions (
      revision_id TEXT PRIMARY KEY,
      guide_id TEXT NOT NULL,
      signed_by TEXT NOT NULL,
      signed_at TEXT NOT NULL
    );
  `);
  ensured.add(db);
}

type Row = { signed_by: string; signed_at: string };
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;
const toSignOff = (db: Db, r: Row | undefined): DemoSignOff | null => (r ? { by: r.signed_by, byName: nameOf(db, r.signed_by), at: r.signed_at } : null);

/** The course's demo sign-off, while it's recorded. */
export function demoSignOffOf(db: Db, guideId: string): DemoSignOff | null {
  ensure(db);
  return toSignOff(db, db.prepare("SELECT signed_by, signed_at FROM magazine_demo_signoffs WHERE guide_id = ?").get(guideId) as Row | undefined);
}

/** Whether a published edition went out under a demo sign-off: it stays marked as demo content for as long as it's live. */
export function demoEditionOf(db: Db, revisionId: string): DemoSignOff | null {
  ensure(db);
  return toSignOff(db, db.prepare("SELECT signed_by, signed_at FROM magazine_demo_editions WHERE revision_id = ?").get(revisionId) as Row | undefined);
}

/** Records or removes a course's demo sign-off. Superadmins only, and only in a demo Hub. */
export function setDemoSignOff(db: Db, actor: User, guideId: string, on: boolean, now: Date): DemoSignOff | null {
  if (!demoSignOffEnabled()) throw new HttpError(403, "Demo sign-off is off on this Hub. Courses here need their real sign-offs.");
  if (!isSuperadmin(actor)) throw new HttpError(403, "Only a superadmin can record a demo sign-off.");
  ensure(db);
  if (!db.prepare("SELECT 1 FROM magazine_guides WHERE id = ?").get(guideId)) throw new HttpError(404, "Guide not found.");
  const before = demoSignOffOf(db, guideId);
  if (on) {
    db.prepare("INSERT OR REPLACE INTO magazine_demo_signoffs (guide_id, signed_by, signed_at) VALUES (?, ?, ?)").run(guideId, actor.id, now.toISOString());
  } else db.prepare("DELETE FROM magazine_demo_signoffs WHERE guide_id = ?").run(guideId);
  audit(db, { actor: actor.id, event: on ? "magazine.demo_signoff" : "magazine.demo_signoff_removed", entity: guideId, previous: before, at: now });
  return demoSignOffOf(db, guideId);
}

/** Marks an edition as published under the course's demo sign-off. Called from publishGuide. */
export function recordDemoEdition(db: Db, guideId: string, revisionId: string, s: DemoSignOff) {
  ensure(db);
  db.prepare("INSERT OR REPLACE INTO magazine_demo_editions (revision_id, guide_id, signed_by, signed_at) VALUES (?, ?, ?, ?)").run(
    revisionId,
    guideId,
    s.by,
    s.at,
  );
}
