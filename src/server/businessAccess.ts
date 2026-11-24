import "server-only";
import { cleanNote, PUBLISHED } from "@/lib/notes";
import { TOOLS, type ToolId } from "@/lib/businessNotes";
import { ensureMentorNotes, type Db } from "./db";
import { canAuthor, type User } from "./auth";
import { plannerAccess } from "./caseloadPlanner";

/*
  Who may see Care Partner Business Field Notes, and the tables behind them (docs/business-field-notes.md).

  A principal is the business owner recorded in business_planner_access (server/caseloadPlanner), the same check
  the calculators use for private business mode. It's never inferred from a job title, an audience or a role name.
  People the owner has authorised to plan are not principals for this purpose.

  This module is small on purpose: the general note library (server/notes), the Inbox (server/notifications) and
  search all ask it, so it imports none of them.
*/

export const BUSINESS_SCHEMA = `
CREATE TABLE IF NOT EXISTS bfn_threads (
  id TEXT PRIMARY KEY, note_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL DEFAULT 'open', reason TEXT NOT NULL DEFAULT '',
  replacement TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bfn_posts (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, parent_id TEXT, author_id TEXT NOT NULL, author_label TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL, body TEXT NOT NULL, chapter INTEGER NOT NULL DEFAULT 0, note_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, held_reason TEXT NOT NULL DEFAULT '', notice TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '',
  source_href TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, idem TEXT,
  created_at TEXT NOT NULL, edited_at TEXT, UNIQUE (author_id, idem)
);
CREATE INDEX IF NOT EXISTS bfn_posts_thread ON bfn_posts (thread_id, parent_id);
CREATE TABLE IF NOT EXISTS bfn_post_helpful (post_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS bfn_reports (post_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS bfn_private (
  user_id TEXT NOT NULL, note_id TEXT NOT NULL, thought TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', checkin_on TEXT,
  follow INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, note_id)
);
CREATE TABLE IF NOT EXISTS bfn_chapters (
  note_id TEXT NOT NULL, number INTEGER NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL,
  author_user TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  published_at TEXT, reviewed_by TEXT, PRIMARY KEY (note_id, number, version)
);
CREATE TABLE IF NOT EXISTS bfn_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL, version INTEGER NOT NULL, step TEXT NOT NULL, outcome TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', by_user TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bfn_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, note_id TEXT NOT NULL, version INTEGER NOT NULL, by_user TEXT NOT NULL, record TEXT NOT NULL,
  change TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bfn_moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL,
  notice TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS bfn_proposals (
  id TEXT PRIMARY KEY, theme_id TEXT, title TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bfn_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, note_id TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0, chapter INTEGER NOT NULL DEFAULT 0, thread_id TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT '', idem TEXT UNIQUE
);
`;
const ready = new WeakSet<object>();
/** The tables, kept here rather than in server/db so a running server picks them up without a restart. */
export function ensureBusinessTables(db: Db) {
  if (ready.has(db)) return;
  ensureMentorNotes(db);
  db.exec(BUSINESS_SCHEMA);
  ready.add(db);
}

/** A verified Care Partner principal: the owner of a business in business_planner_access. */
export const isPrincipal = (db: Db, user: User) => plannerAccess(db, user)?.role === "owner";

type NoteRow = { id: string; version: number; state: string; data: string; reviewed_at: string | null; updated_at: string };
/** A business note's newest published version, or undefined when it has none (withdrawn, waiting, or not a business note). */
export function liveBusinessNote(db: Db, id: string) {
  ensureBusinessTables(db);
  const rows = db.prepare("SELECT id, version, state, data, reviewed_at, updated_at FROM mentor_notes WHERE id = ? ORDER BY version DESC").all(id) as NoteRow[];
  const r = rows.find((x) => (PUBLISHED as string[]).includes(x.state));
  if (!r) return undefined;
  const data = cleanNote(JSON.parse(r.data));
  return data.business ? { id: r.id, version: r.version, state: r.state, data, reviewedAt: r.reviewed_at ?? "", updatedAt: r.updated_at } : undefined;
}

/**
  Whether an Inbox item about a business card may still be shown: only to a principal, and only while the card is
  published. A withdrawn card, or a reader who's no longer a principal, leaves nothing behind in the Inbox.
*/
export function businessNotificationVisible(db: Db, user: User, source: string) {
  const id = source.split(":")[1] ?? "";
  if (source.startsWith("business-note-admin:")) return canAuthor(user);
  return isPrincipal(db, user) && Boolean(liveBusinessNote(db, id));
}

/** A Work Tool for this reader: a published Magazine article they can open, the private calculator, or a labelled placeholder. */
export function resolveTool(db: Db, user: User, id: ToolId) {
  const t = TOOLS[id];
  if (t.kind === "placeholder") return { id, title: t.title, use: t.use, kind: t.kind, href: "", available: false };
  if (t.kind === "tool") return { id, title: t.title, use: t.use, kind: t.kind, href: t.href, available: true };
  const rows = db
    .prepare(
      "SELECT slug, title, audience FROM magazine_guides WHERE status = 'published' AND (slug = ? OR lower(title) LIKE ?) ORDER BY slug = ? DESC LIMIT 1",
    )
    .all(t.slug, `%${t.match.toLowerCase()}%`, t.slug) as { slug: string; title: string; audience: string }[];
  const g = rows[0];
  const audience = g ? (JSON.parse(g.audience || "[]") as string[]) : [];
  const open = g && (canAuthor(user) || !audience.length || audience.includes(user.audience));
  return { id, title: t.title, use: t.use, kind: t.kind, href: open ? `/magazine/${g.slug}` : "", available: Boolean(open) };
}
export type ResolvedTool = ReturnType<typeof resolveTool>;

/** What Pocket Deck shows with a saved business card: the thread's state, its dated check-ins and one related tool. */
export function pocketExtras(db: Db, user: User, noteId: string, toolIds: ToolId[]) {
  ensureBusinessTables(db);
  const thread = db.prepare("SELECT state FROM bfn_threads WHERE note_id = ?").get(noteId) as { state: string } | undefined;
  const chapters = (
    db.prepare("SELECT COUNT(DISTINCT number) AS n FROM bfn_chapters WHERE note_id = ? AND state = 'published' AND number > 0").get(noteId) as { n: number }
  ).n;
  return {
    href: `/business-notes/${noteId}`,
    threadState: thread?.state ?? "open",
    chapters,
    tool: toolIds.length ? resolveTool(db, user, toolIds[0]) : null,
  };
}
