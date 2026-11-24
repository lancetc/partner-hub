import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  CASE_AUDIENCE_PHRASES,
  CASE_AUDIENCES,
  CASE_EVENTS,
  caseDataOf,
  caseThreadHardProblems,
  cleanTake,
  completionOf,
  ENDORSED_LABEL,
  FEED_VIEWS,
  isComplete,
  isFeedView,
  LIVE_ROUTE,
  NEEDS_REASON,
  PEER_LABEL,
  POST_STATUS,
  rankFeed,
  screenCaseText,
  SEED_LABEL,
  SHARE_CHECKS,
  takeAsPost,
  takeText,
  takeWords,
  THREAD_ID,
  THREAD_STATUS,
  VERIFIED_LABEL,
  type CaseAudience,
  type CaseEvent,
  type CaseThreadData,
  type FeedView,
  type ModAction,
  type PostStatus,
  type Take,
  type ThreadStatus,
} from "@/lib/caseThread";
import { allBlocks, type Block, type GuideDoc } from "@/lib/magazine";
import { cellText, suppress } from "@/lib/businessNotes";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";

/*
  "What Would You Do?" Community Case Threads (docs/case-threads.md): the one canonical thread per case.

  - A case is registered when the course that holds it is published (caseThreadsAfterPublish): the thread, its case
    version, its audience and its fictional seed responses. A material change makes a new case version; a new policy
    version withdraws endorsements, pauses the thread for review and marks saved scripts stale. The first course to
    publish a thread owns it; another course placing the same thread id embeds it as it is.
  - Every read and every action is checked here against the thread's audience (never the page that embeds it), so
    the Magazine block and the Community page get identical answers: the same posts, votes, comments and moderation.
  - Private first takes, reflections and revised answers (ct_attempts) are kept apart from opt-in public posts
    (ct_posts), and both apart from moderation evidence (ct_moderation, ct_reports). Analytics (ct_events) hold ids
    and event names only, never anyone's words.
  - Everything shared is premoderated. A post or comment that might identify someone is quarantined with its flags;
    anything that reads as a live situation is interrupted with the approved incident route and nothing is stored.
  - The tables are created here (ensureCaseThreadTables), not in server/db, so a running server picks them up.
*/

export const CASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ct_threads (
  id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, policy_version TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '[]', guide_id TEXT NOT NULL, block_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  status_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ct_versions (
  thread_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, hash TEXT NOT NULL, policy_version TEXT NOT NULL DEFAULT '',
  published_by TEXT NOT NULL, published_at TEXT NOT NULL, PRIMARY KEY (thread_id, version)
);
CREATE TABLE IF NOT EXISTS ct_posts (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, case_version INTEGER NOT NULL, policy_version TEXT NOT NULL DEFAULT '', author_id TEXT NOT NULL,
  seed INTEGER NOT NULL DEFAULT 0, seed_name TEXT NOT NULL DEFAULT '', seed_role TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'first',
  body TEXT NOT NULL, why TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '[]', mod_note TEXT NOT NULL DEFAULT '',
  author_note TEXT NOT NULL DEFAULT '', endorsed_by TEXT, endorsed_name TEXT, endorsed_at TEXT, endorsed_version INTEGER, idem TEXT,
  created_at TEXT NOT NULL, edited_at TEXT, decided_at TEXT, UNIQUE (author_id, idem)
);
CREATE INDEX IF NOT EXISTS ct_posts_thread ON ct_posts (thread_id, status);
CREATE TABLE IF NOT EXISTS ct_post_edits (post_id TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ct_comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, thread_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '[]', author_note TEXT NOT NULL DEFAULT '', idem TEXT, created_at TEXT NOT NULL, decided_at TEXT,
  UNIQUE (author_id, idem)
);
CREATE INDEX IF NOT EXISTS ct_comments_post ON ct_comments (post_id, status);
CREATE TABLE IF NOT EXISTS ct_votes (post_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS ct_reports (
  target TEXT NOT NULL, user_id TEXT NOT NULL, thread_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, resolved_at TEXT,
  PRIMARY KEY (target, user_id)
);
CREATE TABLE IF NOT EXISTS ct_attempts (
  user_id TEXT NOT NULL, thread_id TEXT NOT NULL, case_version INTEGER NOT NULL, draft TEXT NOT NULL DEFAULT '{}', first_take TEXT,
  submitted_at TEXT, checklist TEXT NOT NULL DEFAULT '[]', note_viewed_at TEXT, peers_viewed TEXT NOT NULL DEFAULT '[]',
  reflection TEXT NOT NULL DEFAULT '', revised TEXT, reflected_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
CREATE TABLE IF NOT EXISTS ct_saved (
  user_id TEXT NOT NULL, post_id TEXT NOT NULL, thread_id TEXT NOT NULL, case_version INTEGER NOT NULL, policy_version TEXT NOT NULL DEFAULT '',
  author_label TEXT NOT NULL, body TEXT NOT NULL, endorsed_name TEXT, endorsed_at TEXT, saved_at TEXT NOT NULL, PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS ct_moderation (
  id INTEGER PRIMARY KEY AUTOINCREMENT, target_type TEXT NOT NULL, target_id TEXT NOT NULL, thread_id TEXT NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ct_verified (
  user_id TEXT PRIMARY KEY, label TEXT NOT NULL, criterion TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at TEXT NOT NULL,
  revoked_at TEXT, revoked_reason TEXT
);
CREATE TABLE IF NOT EXISTS ct_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT NOT NULL, thread_id TEXT NOT NULL, case_version INTEGER NOT NULL DEFAULT 0,
  event TEXT NOT NULL, post_id TEXT NOT NULL DEFAULT '', idem TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS ct_events_thread ON ct_events (thread_id, event);
CREATE INDEX IF NOT EXISTS ct_events_user ON ct_events (user_id, event, at);
`;
const ready = new WeakSet<object>();
export function ensureCaseThreadTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(CASE_SCHEMA);
  ready.add(db);
}

const NOT_FOUND = "Not found.";
const PAGE = 20;
/** A report hides an approved post or comment until a moderator looks at it. */
const HIDE_ON_REPORT = true;
const LIMITS: { events: CaseEvent[]; minutes: number; max: number; what: string }[] = [
  { events: ["vote_added", "vote_removed"], minutes: 10, max: 60, what: "helpful votes" },
  { events: ["comment_submitted"], minutes: 10, max: 10, what: "comments" },
  { events: ["share_submitted", "post_edited"], minutes: 60, max: 6, what: "shared responses" },
  { events: ["report_made"], minutes: 60, max: 12, what: "reports" },
];
export const REPORT_REASONS = {
  identifying: "Could identify a real person",
  live: "About something happening now to a real person",
  unsafe: "Unsafe or outdated advice",
  disrespectful: "Disrespectful or abusive",
  other: "Something else",
} as const;
type ReportReason = keyof typeof REPORT_REASONS;

type ThreadRow = {
  id: string;
  version: number;
  data: string;
  hash: string;
  policy_version: string;
  audience: string;
  guide_id: string;
  block_id: string;
  status: ThreadStatus;
  status_reason: string;
  created_at: string;
  updated_at: string;
};
type PostRow = {
  id: string;
  thread_id: string;
  case_version: number;
  policy_version: string;
  author_id: string;
  seed: number;
  seed_name: string;
  seed_role: string;
  source: string;
  body: string;
  why: string;
  status: PostStatus;
  flags: string;
  mod_note: string;
  author_note: string;
  endorsed_by: string | null;
  endorsed_name: string | null;
  endorsed_at: string | null;
  endorsed_version: number | null;
  created_at: string;
  edited_at: string | null;
  decided_at: string | null;
};
type CommentRow = {
  id: string;
  post_id: string;
  thread_id: string;
  author_id: string;
  body: string;
  status: PostStatus;
  flags: string;
  author_note: string;
  created_at: string;
  decided_at: string | null;
};
type AttemptRow = {
  user_id: string;
  thread_id: string;
  case_version: number;
  draft: string;
  first_take: string | null;
  submitted_at: string | null;
  checklist: string;
  note_viewed_at: string | null;
  peers_viewed: string;
  reflection: string;
  revised: string | null;
  reflected_at: string | null;
  completed_at: string | null;
  updated_at: string;
};
type SavedRow = {
  user_id: string;
  post_id: string;
  thread_id: string;
  case_version: number;
  policy_version: string;
  author_label: string;
  body: string;
  endorsed_name: string | null;
  endorsed_at: string | null;
  saved_at: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const json = <T>(s: string | null | undefined, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};
const caseOf = (t: ThreadRow) => json<CaseThreadData>(t.data, {} as CaseThreadData);
const audienceOf = (t: ThreadRow) => json<CaseAudience[]>(t.audience, []);
const hashOf = (d: CaseThreadData) => {
  // Re-approving or moving the review date isn't a new version of the case.
  return createHash("sha256")
    .update(JSON.stringify({ ...d, approval: null, reviewDue: "" }))
    .digest("hex")
    .slice(0, 16);
};
const roleLabel = (audience: string) => (audience === "coordinator" ? "Coordinator" : audience === "staff" ? "Trilogy Care staff" : "Partner");

// ---------------------------------------------------------------------------------------------
// Registering a case when its course is published
// ---------------------------------------------------------------------------------------------

type CaseBlock = Extract<Block, { type: "casethread" }>;
const caseBlocks = (doc: GuideDoc) => allBlocks(doc).filter((b): b is CaseBlock => b.type === "casethread");

/** Who a thread is for: the block's cohort within the course's audience. Empty is everyone signed in. */
function threadAudience(block: CaseAudience[], guide: string[]): CaseAudience[] {
  const g = guide.filter((a): a is CaseAudience => a in CASE_AUDIENCES);
  if (block.length && g.length) return block.filter((a) => g.includes(a));
  return block.length ? block : g;
}

/** What stops a course with case threads being published, even with "Publish anyway". */
export function caseThreadPublishProblems(db: Db, guide: { id: string; audience: string[] }, doc: GuideDoc, today: string): string[] {
  ensureCaseThreadTables(db);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of caseBlocks(doc)) {
    const d = caseDataOf(b);
    out.push(...caseThreadHardProblems(d, today));
    if (seen.has(d.threadId)) out.push(`“${d.title}”: the thread id ${d.threadId} is used twice in this course.`);
    seen.add(d.threadId);
    if (b.audience.length && guide.audience.length && !threadAudience(b.audience, guide.audience).length)
      out.push(`“${d.title}”: nobody in this course’s audience is in the thread’s audience.`);
  }
  return out;
}

/** Each case thread in a newly published course: registered, or a new case version when it changed materially. */
export function caseThreadsAfterPublish(db: Db, actor: User, doc: GuideDoc, guide: { id: string; audience: string[] }, now: Date) {
  ensureCaseThreadTables(db);
  const at = now.toISOString();
  for (const b of caseBlocks(doc)) {
    const d = caseDataOf(b);
    if (!THREAD_ID.test(d.threadId)) continue;
    const audience = JSON.stringify(threadAudience(d.audience, guide.audience));
    const hash = hashOf(d);
    const t = db.prepare("SELECT * FROM ct_threads WHERE id = ?").get(d.threadId) as ThreadRow | undefined;
    // Another course already owns this thread: this one embeds it as it is.
    if (t && t.guide_id !== guide.id) continue;
    tx(db, () => {
      if (!t) {
        db.prepare(
          "INSERT INTO ct_threads (id, version, data, hash, policy_version, audience, guide_id, block_id, status, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
        ).run(d.threadId, JSON.stringify(d), hash, d.policy.version, audience, guide.id, b.id, at, at);
        db.prepare("INSERT INTO ct_versions (thread_id, version, data, hash, policy_version, published_by, published_at) VALUES (?, 1, ?, ?, ?, ?, ?)").run(
          d.threadId,
          JSON.stringify(d),
          hash,
          d.policy.version,
          actor.id,
          at,
        );
        syncSeeds(db, d, 1, at);
        audit(db, { actor: actor.id, event: "case_thread.registered", entity: `case_thread:${d.threadId}`, next: { version: 1 }, at: now });
        return;
      }
      if (t.hash === hash) {
        // Approval or review date only: the same version, its record refreshed.
        db.prepare("UPDATE ct_threads SET data = ?, audience = ?, block_id = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(d), audience, b.id, at, t.id);
        return;
      }
      const version = t.version + 1;
      const policyChanged = t.policy_version !== d.policy.version;
      db.prepare(
        "UPDATE ct_threads SET version = ?, data = ?, hash = ?, policy_version = ?, audience = ?, block_id = ?, status = ?, status_reason = ?, updated_at = ? WHERE id = ?",
      ).run(
        version,
        JSON.stringify(d),
        hash,
        d.policy.version,
        audience,
        b.id,
        policyChanged ? "paused" : t.status,
        policyChanged
          ? `The governing policy changed to version ${d.policy.version}. A moderator is reviewing earlier posts before the discussion reopens.`
          : t.status_reason,
        at,
        t.id,
      );
      db.prepare("INSERT INTO ct_versions (thread_id, version, data, hash, policy_version, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        t.id,
        version,
        JSON.stringify(d),
        hash,
        d.policy.version,
        actor.id,
        at,
      );
      if (policyChanged) {
        // Endorsements were given under the old policy: withdrawn until a moderator reviews them again.
        const endorsed = db.prepare("SELECT id FROM ct_posts WHERE thread_id = ? AND endorsed_by IS NOT NULL").all(t.id) as { id: string }[];
        for (const p of endorsed) {
          db.prepare("UPDATE ct_posts SET endorsed_by = NULL, endorsed_name = NULL, endorsed_at = NULL, endorsed_version = NULL WHERE id = ?").run(p.id);
          logModeration(db, "post", p.id, t.id, actor.id, "unendorse", `Policy changed from ${t.policy_version || "unversioned"} to ${d.policy.version}.`, at);
        }
        logModeration(db, "thread", t.id, t.id, actor.id, "pause", `Policy changed from ${t.policy_version || "unversioned"} to ${d.policy.version}.`, at);
      }
      syncSeeds(db, d, version, at);
      audit(db, {
        actor: actor.id,
        event: "case_thread.versioned",
        entity: `case_thread:${t.id}`,
        previous: { version: t.version, policy: t.policy_version },
        next: { version, policy: d.policy.version },
        at: now,
      });
    });
  }
}

/** The fictional seed responses: one post each, flagged as seeds, never attributed to a real person. */
function syncSeeds(db: Db, d: CaseThreadData, version: number, at: string) {
  const ids = d.seeds.filter((s) => s.body).map((s) => `seed-${d.threadId}-${s.id}`);
  for (const s of d.seeds.filter((x) => x.body)) {
    const id = `seed-${d.threadId}-${s.id}`;
    const old = db.prepare("SELECT body, status FROM ct_posts WHERE id = ?").get(id) as { body: string; status: string } | undefined;
    if (!old)
      db.prepare(
        "INSERT INTO ct_posts (id, thread_id, case_version, policy_version, author_id, seed, seed_name, seed_role, source, body, why, status, created_at, decided_at) VALUES (?, ?, ?, ?, 'seed', 1, ?, ?, 'seed', ?, ?, 'approved', ?, ?)",
      ).run(id, d.threadId, version, d.policy.version, s.name, s.role, s.body, s.why, at, at);
    else {
      if (old.body !== s.body) db.prepare("INSERT INTO ct_post_edits (post_id, body, at) VALUES (?, ?, ?)").run(id, old.body, at);
      db.prepare("UPDATE ct_posts SET case_version = ?, policy_version = ?, seed_name = ?, seed_role = ?, body = ?, why = ?, edited_at = ? WHERE id = ?").run(
        version,
        d.policy.version,
        s.name,
        s.role,
        s.body,
        s.why,
        old.body !== s.body ? at : null,
        id,
      );
      if (old.status === "archived") db.prepare("UPDATE ct_posts SET status = 'approved' WHERE id = ?").run(id);
    }
  }
  // A seed taken out of the case: archived, so saved copies say so.
  const live = db.prepare("SELECT id FROM ct_posts WHERE thread_id = ? AND seed = 1 AND status = 'approved'").all(d.threadId) as { id: string }[];
  for (const p of live.filter((x) => !ids.includes(x.id))) db.prepare("UPDATE ct_posts SET status = 'archived' WHERE id = ?").run(p.id);
}

// ---------------------------------------------------------------------------------------------
// Access, attempts and events
// ---------------------------------------------------------------------------------------------

/** The thread, if this person may see it: by its own audience, wherever it's embedded. Anyone else gets "not found". */
function visibleThread(db: Db, user: User, id: unknown): ThreadRow {
  ensureCaseThreadTables(db);
  const t = typeof id === "string" ? (db.prepare("SELECT * FROM ct_threads WHERE id = ?").get(id) as ThreadRow | undefined) : undefined;
  if (!t) throw new HttpError(404, NOT_FOUND);
  const aud = audienceOf(t);
  if (!canAuthor(user) && aud.length && !aud.includes(user.audience as CaseAudience)) throw new HttpError(404, NOT_FOUND);
  // The course that holds the case was archived: the thread stays readable, closed to new contributions.
  const g = db.prepare("SELECT status FROM magazine_guides WHERE id = ?").get(t.guide_id) as { status: string } | undefined;
  if (g?.status === "archived" && t.status !== "archived")
    return { ...t, status: "archived", status_reason: "The course that holds this case has been archived." };
  return t;
}
export const canSeeThread = (db: Db, user: User, id: string) => {
  try {
    visibleThread(db, user, id);
    return true;
  } catch {
    return false;
  }
};

const attemptOf = (db: Db, userId: string, threadId: string) =>
  db.prepare("SELECT * FROM ct_attempts WHERE user_id = ? AND thread_id = ?").get(userId, threadId) as AttemptRow | undefined;
function ensureAttempt(db: Db, user: User, t: ThreadRow, now: Date) {
  db.prepare("INSERT OR IGNORE INTO ct_attempts (user_id, thread_id, case_version, updated_at) VALUES (?, ?, ?, ?)").run(
    user.id,
    t.id,
    t.version,
    now.toISOString(),
  );
  return attemptOf(db, user.id, t.id)!;
}
const completionRow = (a: AttemptRow | undefined) =>
  completionOf({
    submittedAt: a?.submitted_at ?? null,
    noteViewedAt: a?.note_viewed_at ?? null,
    peersViewed: json<string[]>(a?.peers_viewed, []).length,
    reflection: a?.reflection ?? "",
  });
/** Whether this person has finished the case: first take, case note, a peer approach and a reflection. Nothing else counts. */
export function caseAttemptComplete(db: Db, user: User, threadId: string) {
  ensureCaseThreadTables(db);
  return isComplete(completionRow(attemptOf(db, user.id, threadId)));
}

function event(db: Db, user: User, t: { id: string; version: number }, e: CaseEvent, now: Date, x: { post?: string; key?: string } = {}) {
  if (!CASE_EVENTS.includes(e)) return;
  db.prepare("INSERT OR IGNORE INTO ct_events (at, user_id, thread_id, case_version, event, post_id, idem) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    t.id,
    t.version,
    e,
    x.post ?? "",
    x.key ? `${user.id}:${t.id}:${e}:${x.key}` : null,
  );
}
function rateLimit(db: Db, user: User, e: CaseEvent, now: Date) {
  const l = LIMITS.find((x) => x.events.includes(e));
  if (!l) return;
  const since = new Date(now.getTime() - l.minutes * 60_000).toISOString();
  const n = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ct_events WHERE user_id = ? AND at >= ? AND event IN (${l.events.map(() => "?").join(", ")})`)
      .get(user.id, since, ...l.events) as { n: number }
  ).n;
  if (n >= l.max) throw new HttpError(429, `That’s a lot of ${l.what} in a short time. Try again in a little while.`);
}
function maybeComplete(db: Db, user: User, t: ThreadRow, now: Date) {
  const a = attemptOf(db, user.id, t.id);
  if (!a || a.completed_at || !isComplete(completionRow(a))) return;
  db.prepare("UPDATE ct_attempts SET completed_at = ? WHERE user_id = ? AND thread_id = ?").run(now.toISOString(), user.id, t.id);
  event(db, user, t, "completed", now, { key: "once" });
}

// ---------------------------------------------------------------------------------------------
// The thread, as a learner sees it (the Magazine block and the Community page alike)
// ---------------------------------------------------------------------------------------------

const verifiedLabel = (db: Db, userId: string) =>
  (db.prepare("SELECT label FROM ct_verified WHERE user_id = ? AND revoked_at IS NULL").get(userId) as { label: string } | undefined)?.label ?? null;

type Author = { name: string; role: string; badge: string; kind: "seed" | "verified" | "member" | "moderator" };
function authorOf(db: Db, r: { author_id: string; seed?: number; seed_name?: string; seed_role?: string }): Author {
  if (r.seed) return { name: `${r.seed_name} (fictional)`, role: r.seed_role ?? "", badge: SEED_LABEL, kind: "seed" };
  const u = db.prepare("SELECT name, audience FROM users WHERE id = ?").get(r.author_id) as { name: string; audience: string } | undefined;
  const v = verifiedLabel(db, r.author_id);
  return { name: (u?.name ?? "A member").split(" ")[0], role: roleLabel(u?.audience ?? ""), badge: v ?? "", kind: v ? "verified" : "member" };
}
const authorLabel = (a: Author) => [a.name, a.badge || a.role].filter(Boolean).join(" · ");

function endorsementOf(r: PostRow) {
  return r.endorsed_by ? { by: r.endorsed_name ?? "", at: (r.endorsed_at ?? "").slice(0, 10), version: r.endorsed_version ?? 0 } : null;
}

function commentsFor(db: Db, user: User, postIds: string[]) {
  if (!postIds.length) return new Map<string, ReturnType<typeof commentView>[]>();
  const rows = db
    .prepare(
      `SELECT * FROM ct_comments WHERE post_id IN (${postIds.map(() => "?").join(", ")}) AND (status = 'approved' OR author_id = ?) AND status != 'withdrawn' ORDER BY created_at, id`,
    )
    .all(...postIds, user.id) as CommentRow[];
  const reported = new Set(
    (db.prepare("SELECT target FROM ct_reports WHERE user_id = ? AND target LIKE 'comment:%'").all(user.id) as { target: string }[]).map((r) => r.target),
  );
  const out = new Map<string, ReturnType<typeof commentView>[]>();
  for (const c of rows) out.set(c.post_id, [...(out.get(c.post_id) ?? []), commentView(db, user, c, reported.has(`comment:${c.id}`))]);
  return out;
}
const commentView = (db: Db, user: User, c: CommentRow, reported: boolean) => ({
  id: c.id,
  body: c.body,
  author: authorOf(db, c),
  at: c.created_at,
  mine: c.author_id === user.id,
  status: c.status,
  statusText: POST_STATUS[c.status],
  note: c.author_id === user.id ? c.author_note : "",
  reported,
});

function feedOf(db: Db, user: User, t: ThreadRow, view: FeedView, cursor: number) {
  const rows = db.prepare("SELECT * FROM ct_posts WHERE thread_id = ? AND status = 'approved'").all(t.id) as PostRow[];
  const helpful = new Map(
    (
      db.prepare("SELECT v.post_id, COUNT(*) AS n FROM ct_votes v JOIN ct_posts p ON p.id = v.post_id WHERE p.thread_id = ? GROUP BY v.post_id").all(t.id) as {
        post_id: string;
        n: number;
      }[]
    ).map((r) => [r.post_id, r.n]),
  );
  const mine = new Set((db.prepare("SELECT post_id FROM ct_votes WHERE user_id = ?").all(user.id) as { post_id: string }[]).map((r) => r.post_id));
  const saved = new Set((db.prepare("SELECT post_id FROM ct_saved WHERE user_id = ?").all(user.id) as { post_id: string }[]).map((r) => r.post_id));
  const reported = new Set(
    (db.prepare("SELECT target FROM ct_reports WHERE user_id = ? AND target LIKE 'post:%'").all(user.id) as { target: string }[]).map((r) => r.target),
  );
  const edits = new Map<string, { body: string; at: string }[]>();
  for (const e of db.prepare(`SELECT e.* FROM ct_post_edits e JOIN ct_posts p ON p.id = e.post_id WHERE p.thread_id = ? ORDER BY e.at`).all(t.id) as {
    post_id: string;
    body: string;
    at: string;
  }[])
    edits.set(e.post_id, [...(edits.get(e.post_id) ?? []), { body: e.body, at: e.at }]);
  const items = rows.map((r) => {
    const author = authorOf(db, r);
    const endorsed = endorsementOf(r);
    return {
      id: r.id,
      kind: author.kind === "moderator" ? ("member" as const) : author.kind,
      author,
      body: r.body,
      why: r.why,
      at: r.created_at,
      editedAt: r.edited_at,
      history: edits.get(r.id) ?? [],
      helpful: helpful.get(r.id) ?? 0,
      voted: mine.has(r.id),
      saved: saved.has(r.id),
      reported: reported.has(`post:${r.id}`),
      mine: r.author_id === user.id,
      endorsed: Boolean(endorsed),
      endorsement: endorsed,
      label: endorsed ? ENDORSED_LABEL : PEER_LABEL,
      modNote: r.mod_note,
      caseVersion: r.case_version,
      current: Boolean(r.seed) || r.policy_version === t.policy_version,
    };
  });
  const ranked = rankFeed(items, view);
  const page = ranked.slice(cursor, cursor + PAGE);
  const comments = commentsFor(
    db,
    user,
    page.map((p) => p.id),
  );
  return {
    view,
    total: ranked.length,
    posts: page.map((p) => ({ ...p, comments: comments.get(p.id) ?? [] })),
    next: cursor + PAGE < ranked.length ? String(cursor + PAGE) : null,
    counts: Object.fromEntries((Object.keys(FEED_VIEWS) as FeedView[]).map((v) => [v, rankFeed(items, v).length])) as Record<FeedView, number>,
  };
}

function savedFor(db: Db, user: User, t: ThreadRow) {
  const rows = db.prepare("SELECT * FROM ct_saved WHERE user_id = ? AND thread_id = ? ORDER BY saved_at DESC").all(user.id, t.id) as SavedRow[];
  return rows.map((s) => savedView(db, s, t));
}
function savedView(db: Db, s: SavedRow, t: { policy_version: string; version: number }) {
  const p = db.prepare("SELECT * FROM ct_posts WHERE id = ?").get(s.post_id) as PostRow | undefined;
  const stale: string[] = [];
  if (t.policy_version !== s.policy_version)
    stale.push(
      `Saved under policy version ${s.policy_version || "unversioned"}; the policy is now ${t.policy_version || "unversioned"}. Check it against the current case note.`,
    );
  if (!p || p.status !== "approved") stale.push(`The original post is no longer published (${p ? POST_STATUS[p.status].toLowerCase() : "removed"}).`);
  if (s.endorsed_name && !p?.endorsed_by) stale.push("Its Quality endorsement has been withdrawn.");
  const endorsed = p?.status === "approved" ? endorsementOf(p) : null;
  return {
    postId: s.post_id,
    threadId: s.thread_id,
    author: s.author_label,
    body: s.body,
    caseVersion: s.case_version,
    policyVersion: s.policy_version,
    savedAt: s.saved_at,
    label: endorsed ? ENDORSED_LABEL : PEER_LABEL,
    endorsement: endorsed,
    stale,
  };
}

function myPosts(db: Db, user: User, t: ThreadRow) {
  return (
    db
      .prepare("SELECT * FROM ct_posts WHERE thread_id = ? AND author_id = ? AND status != 'withdrawn' ORDER BY created_at DESC")
      .all(t.id, user.id) as PostRow[]
  ).map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source,
    status: r.status,
    statusText: POST_STATUS[r.status],
    note: r.author_note,
    at: r.created_at,
    editedAt: r.edited_at,
    editable: ["pending", "revision", "approved"].includes(r.status),
  }));
}

/** The public part of a case: everything a learner needs before their first take, nothing that gives the discussion away. */
const publicCase = (d: CaseThreadData) => ({
  title: d.title,
  role: d.role,
  aim: d.aim,
  scene: d.scene,
  people: d.people,
  known: d.known,
  unknowns: d.unknowns,
  safetyCue: d.safetyCue,
  related: d.related,
  prompts: d.prompts,
  words: d.words,
  reflection: d.reflection,
});

export function caseThreadView(db: Db, user: User, id: unknown, input: { view?: unknown; cursor?: unknown } = {}, now: Date) {
  const t = visibleThread(db, user, id);
  const d = caseOf(t);
  const a = attemptOf(db, user.id, t.id);
  const unlocked = Boolean(a?.submitted_at);
  const view: FeedView = isFeedView(input.view) ? input.view : "helpful";
  const cursor = Math.max(0, Math.min(10_000, Math.floor(Number(input.cursor) || 0)));
  const approved = (db.prepare("SELECT COUNT(*) AS n FROM ct_posts WHERE thread_id = ? AND status = 'approved'").get(t.id) as { n: number }).n;
  const completion = completionRow(a);
  let feed: ReturnType<typeof feedOf> | null = null;
  let feedProblem = "";
  if (unlocked) {
    if (t.status === "paused") feedProblem = t.status_reason || "The discussion is paused for review.";
    else
      try {
        feed = feedOf(db, user, t, view, cursor);
      } catch (e) {
        console.error(e);
        feedProblem = "Discussion temporarily unavailable. Your first take is saved; come back to compare later.";
      }
  }
  return {
    thread: {
      id: t.id,
      version: t.version,
      status: t.status,
      statusText: THREAD_STATUS[t.status],
      statusReason: t.status_reason,
      policy: { title: d.policy?.title ?? "", version: t.policy_version },
      reviewDue: d.reviewDue,
      // The case note is past its review date: shown, so nobody reads it as current without saying so.
      reviewOverdue: Boolean(d.reviewDue && d.reviewDue < now.toISOString().slice(0, 10)),
      audience: audienceOf(t).map((x) => CASE_AUDIENCE_PHRASES[x]),
      href: `/community/cases/${t.id}`,
      responses: approved,
    },
    case: publicCase(d),
    live: LIVE_ROUTE,
    attempt: {
      started: Boolean(a),
      draft: cleanTake(json(a?.draft, {})),
      firstTake: a?.first_take ? cleanTake(json(a.first_take, {})) : null,
      submittedAt: a?.submitted_at ?? null,
      caseVersion: a?.case_version ?? t.version,
      checklist: json<boolean[]>(a?.checklist, []),
      reflection: a?.reflection ?? "",
      revised: a?.revised ? cleanTake(json(a.revised, {})) : null,
      reflectedAt: a?.reflected_at ?? null,
      completion,
      complete: isComplete(completion),
      completedAt: a?.completed_at ?? null,
    },
    unlocked,
    note: unlocked ? { ...d.caseNote, policy: d.policy, reviewDue: d.reviewDue, version: t.version, approvedOn: d.approval?.approvedOn ?? "" } : null,
    checklist: unlocked ? d.checklist : [],
    feed,
    feedProblem,
    mine: unlocked ? myPosts(db, user, t) : [],
    saved: unlocked ? savedFor(db, user, t) : [],
    canPost: unlocked && t.status === "open",
    shareChecks: SHARE_CHECKS,
    reportReasons: REPORT_REASONS,
  };
}
export type CaseThreadView = ReturnType<typeof caseThreadView>;

/** The threads this person can see, for the Community page's Case threads panel. */
export function caseThreadSpace(db: Db, user: User) {
  ensureCaseThreadTables(db);
  const rows = db.prepare("SELECT * FROM ct_threads ORDER BY created_at").all() as ThreadRow[];
  const threads = rows.flatMap((r) => {
    if (!canSeeThread(db, user, r.id)) return [];
    const t = visibleThread(db, user, r.id);
    const a = attemptOf(db, user.id, t.id);
    const responses = (db.prepare("SELECT COUNT(*) AS n FROM ct_posts WHERE thread_id = ? AND status = 'approved'").get(t.id) as { n: number }).n;
    return [
      {
        id: t.id,
        title: caseOf(t).title,
        status: t.status,
        statusText: THREAD_STATUS[t.status],
        responses,
        mine: a?.completed_at ? "Finished" : a?.submitted_at ? "First take shared privately" : a ? "Draft saved" : "Not started",
        href: `/community/cases/${t.id}`,
      },
    ];
  });
  const saved = (
    db.prepare("SELECT COUNT(*) AS n FROM ct_saved WHERE user_id = ?").get(user.id) as {
      n: number;
    }
  ).n;
  return { threads, saved };
}

/** Every saved script this person has, across threads they can still see, with stale warnings. */
export function mySavedScripts(db: Db, user: User) {
  ensureCaseThreadTables(db);
  const rows = db.prepare("SELECT * FROM ct_saved WHERE user_id = ? ORDER BY saved_at DESC").all(user.id) as SavedRow[];
  return rows.flatMap((s) => {
    if (!canSeeThread(db, user, s.thread_id)) return [];
    const t = visibleThread(db, user, s.thread_id);
    return [{ ...savedView(db, s, t), threadTitle: caseOf(t).title, href: t.id ? `/community/cases/${t.id}` : "" }];
  });
}

// ---------------------------------------------------------------------------------------------
// What a learner does
// ---------------------------------------------------------------------------------------------

const urgentAnswer = (db: Db, user: User, t: ThreadRow, now: Date) => {
  // Nothing of what they wrote is kept: only that the interrupt was shown.
  event(db, user, t, "live_interrupt", now);
  return { interrupt: LIVE_ROUTE };
};
function blockIdentifying(ids: string[]) {
  if (ids.length)
    throw new HttpError(400, `This might identify someone (${ids.join(", ")}). Use only the case’s fictional details, then try again. Nothing has been saved.`);
}
function requireUnlocked(a: AttemptRow | undefined) {
  if (!a?.submitted_at) throw new HttpError(403, "Submit your first take to open the discussion.");
}
function requireOpen(t: ThreadRow) {
  if (t.status !== "open") throw new HttpError(409, t.status === "paused" ? "The discussion is paused for review." : "This case is archived.");
}
function visiblePost(db: Db, t: ThreadRow, postId: unknown) {
  const p =
    typeof postId === "string" ? (db.prepare("SELECT * FROM ct_posts WHERE id = ? AND thread_id = ?").get(postId, t.id) as PostRow | undefined) : undefined;
  if (!p || p.status !== "approved") throw new HttpError(404, "That response isn’t available.");
  return p;
}
const fromView = (input: Record<string, unknown>) => ({ view: input.view, cursor: 0 });

export function caseThreadAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const t = visibleThread(db, user, input.threadId);
  const d = caseOf(t);
  const at = now.toISOString();
  const key = str(input.key, 80);
  const a = attemptOf(db, user.id, t.id);
  const fictional = input.fictional === true;
  const view = () => caseThreadView(db, user, t.id, fromView(input), now);

  switch (input.action) {
    case "draft": {
      if (a?.submitted_at) throw new HttpError(409, "Your first take is already submitted. Add a revised answer in your reflection.");
      const take = cleanTake(input.take);
      ensureAttempt(db, user, t, now);
      db.prepare("UPDATE ct_attempts SET draft = ?, case_version = ?, updated_at = ? WHERE user_id = ? AND thread_id = ?").run(
        JSON.stringify(take),
        t.version,
        at,
        user.id,
        t.id,
      );
      event(db, user, t, "draft_saved", now, { key: "first" });
      return view();
    }
    case "submit": {
      if (a?.submitted_at) throw new HttpError(409, "Your first take is already submitted. It stays as you wrote it; add a revised answer in your reflection.");
      const take = cleanTake(input.take);
      if (!take.say || takeWords(take) < 15) throw new HttpError(400, "Write what you’d say and what you’d do: a few sentences is enough.");
      const sc = screenCaseText(takeText(take), d.people);
      // Urgency first: a live matter gets the incident route before anything else is said about it.
      if (sc.live && !fictional) return urgentAnswer(db, user, t, now);
      blockIdentifying(sc.identifying);
      ensureAttempt(db, user, t, now);
      db.prepare(
        "UPDATE ct_attempts SET draft = ?, first_take = ?, submitted_at = ?, case_version = ?, updated_at = ? WHERE user_id = ? AND thread_id = ? AND submitted_at IS NULL",
      ).run(JSON.stringify(take), JSON.stringify(take), at, t.version, at, user.id, t.id);
      event(db, user, t, "first_take_submitted", now, { key: "once" });
      return view();
    }
    case "checklist": {
      requireUnlocked(a);
      const ticks = (Array.isArray(input.ticks) ? input.ticks : []).slice(0, d.checklist.length).map((x) => x === true);
      db.prepare("UPDATE ct_attempts SET checklist = ?, updated_at = ? WHERE user_id = ? AND thread_id = ?").run(JSON.stringify(ticks), at, user.id, t.id);
      event(db, user, t, "checklist_saved", now, { key: "once" });
      return view();
    }
    case "viewed-note": {
      requireUnlocked(a);
      db.prepare("UPDATE ct_attempts SET note_viewed_at = COALESCE(note_viewed_at, ?), updated_at = ? WHERE user_id = ? AND thread_id = ?").run(
        at,
        at,
        user.id,
        t.id,
      );
      event(db, user, t, "note_viewed", now, { key: "once" });
      maybeComplete(db, user, t, now);
      return { ok: true, completion: completionRow(attemptOf(db, user.id, t.id)) };
    }
    case "viewed-peer": {
      requireUnlocked(a);
      // Never marked while the discussion can't be shown.
      if (t.status === "paused") throw new HttpError(409, "The discussion is paused for review.");
      const p = visiblePost(db, t, input.postId);
      if (p.author_id === user.id) return { ok: true, completion: completionRow(a) };
      const seen = json<string[]>(a!.peers_viewed, []);
      if (!seen.includes(p.id)) {
        db.prepare("UPDATE ct_attempts SET peers_viewed = ?, updated_at = ? WHERE user_id = ? AND thread_id = ?").run(
          JSON.stringify([...seen, p.id].slice(-200)),
          at,
          user.id,
          t.id,
        );
        event(db, user, t, "peer_viewed", now, { post: p.id, key: p.id });
      }
      maybeComplete(db, user, t, now);
      return { ok: true, completion: completionRow(attemptOf(db, user.id, t.id)) };
    }
    case "vote": {
      requireUnlocked(a);
      requireOpen(t);
      const p = visiblePost(db, t, input.postId);
      if (p.author_id === user.id) throw new HttpError(400, "You can’t mark your own response as helpful.");
      const on = input.on === true;
      const had = Boolean(db.prepare("SELECT 1 FROM ct_votes WHERE post_id = ? AND user_id = ?").get(p.id, user.id));
      if (on !== had) {
        rateLimit(db, user, on ? "vote_added" : "vote_removed", now);
        if (on) db.prepare("INSERT OR IGNORE INTO ct_votes (post_id, user_id, at) VALUES (?, ?, ?)").run(p.id, user.id, at);
        else db.prepare("DELETE FROM ct_votes WHERE post_id = ? AND user_id = ?").run(p.id, user.id);
        event(db, user, t, on ? "vote_added" : "vote_removed", now, { post: p.id });
      }
      return view();
    }
    case "comment": {
      requireUnlocked(a);
      requireOpen(t);
      const p = visiblePost(db, t, input.postId);
      if (input.checked !== true) throw new HttpError(400, "Confirm the checks before you comment.");
      const body = str(input.text, 1000);
      if (body.length < 3) throw new HttpError(400, "Write a few words.");
      if (key) {
        const done = db.prepare("SELECT id FROM ct_comments WHERE author_id = ? AND idem = ?").get(user.id, key);
        if (done) return view();
      }
      const sc = screenCaseText(body, d.people);
      if (sc.live && !fictional) return urgentAnswer(db, user, t, now);
      rateLimit(db, user, "comment_submitted", now);
      const flags = [
        ...sc.identifying.map((x) => `Might identify someone: ${x}`),
        ...(sc.live ? ["Reads as a live situation; the author said it’s about the fictional case"] : []),
      ];
      db.prepare(
        "INSERT INTO ct_comments (id, post_id, thread_id, author_id, body, status, flags, idem, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
      ).run(randomUUID(), p.id, t.id, user.id, body, JSON.stringify(flags), key || null, at);
      event(db, user, t, "comment_submitted", now, { post: p.id });
      return view();
    }
    case "save": {
      requireUnlocked(a);
      const on = input.on !== false;
      if (!on) {
        db.prepare("DELETE FROM ct_saved WHERE user_id = ? AND post_id = ?").run(user.id, str(input.postId, 120));
        event(db, user, t, "script_removed", now, { post: str(input.postId, 120) });
        return view();
      }
      const p = visiblePost(db, t, input.postId);
      const author = authorOf(db, p);
      db.prepare(
        "INSERT OR IGNORE INTO ct_saved (user_id, post_id, thread_id, case_version, policy_version, author_label, body, endorsed_name, endorsed_at, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(user.id, p.id, t.id, p.case_version, p.seed ? t.policy_version : p.policy_version, authorLabel(author), p.body, p.endorsed_name, p.endorsed_at, at);
      event(db, user, t, "script_saved", now, { post: p.id, key: p.id });
      return view();
    }
    case "reflect": {
      requireUnlocked(a);
      const reflection = str(input.reflection, 2000);
      if (!reflection) throw new HttpError(400, "Write a short reflection: what would you keep or change?");
      const revised = input.revised ? cleanTake(input.revised) : null;
      const hasRevised = revised && takeWords(revised) > 0;
      const sc = screenCaseText([reflection, hasRevised ? takeText(revised) : ""].join("\n"), d.people);
      // Urgency first: a live matter gets the incident route before anything else is said about it.
      if (sc.live && !fictional) return urgentAnswer(db, user, t, now);
      blockIdentifying(sc.identifying);
      // The first take is never touched: the revised answer sits beside it.
      db.prepare("UPDATE ct_attempts SET reflection = ?, revised = ?, reflected_at = ?, updated_at = ? WHERE user_id = ? AND thread_id = ?").run(
        reflection,
        hasRevised ? JSON.stringify(revised) : a!.revised,
        at,
        at,
        user.id,
        t.id,
      );
      event(db, user, t, "reflection_saved", now, { key: "once" });
      if (hasRevised) event(db, user, t, "revised_saved", now, { key: "once" });
      maybeComplete(db, user, t, now);
      return view();
    }
    case "share": {
      requireUnlocked(a);
      requireOpen(t);
      if (input.checked !== true) throw new HttpError(400, "Confirm the three checks before you share.");
      const which = input.which === "revised" ? "revised" : "first";
      const take: Take | null = which === "revised" ? (a!.revised ? cleanTake(json(a!.revised, {})) : null) : cleanTake(json(a!.first_take, {}));
      if (!take || !takeWords(take)) throw new HttpError(400, which === "revised" ? "Save a revised answer first." : "There’s no first take to share.");
      if (key) {
        const done = db.prepare("SELECT id FROM ct_posts WHERE author_id = ? AND idem = ?").get(user.id, key);
        if (done) return view();
      }
      const body = takeAsPost(take);
      const sc = screenCaseText(body, d.people);
      if (sc.live && !fictional) return urgentAnswer(db, user, t, now);
      rateLimit(db, user, "share_submitted", now);
      const flags = [
        ...sc.identifying.map((x) => `Might identify someone: ${x}`),
        ...(sc.live ? ["Reads as a live situation; the author said it’s about the fictional case"] : []),
      ];
      db.prepare(
        "INSERT INTO ct_posts (id, thread_id, case_version, policy_version, author_id, source, body, status, flags, idem, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
      ).run(randomUUID(), t.id, t.version, t.policy_version, user.id, which, body, JSON.stringify(flags), key || null, at);
      event(db, user, t, "share_submitted", now);
      return view();
    }
    case "edit": {
      requireUnlocked(a);
      requireOpen(t);
      if (input.checked !== true) throw new HttpError(400, "Confirm the three checks before you share.");
      const p = db.prepare("SELECT * FROM ct_posts WHERE id = ? AND thread_id = ? AND author_id = ?").get(str(input.postId, 120), t.id, user.id) as
        PostRow | undefined;
      if (!p || !["pending", "revision", "approved"].includes(p.status)) throw new HttpError(404, "That response isn’t yours to edit.");
      const body = str(input.text, 3000);
      if (body.length < 10) throw new HttpError(400, "Write a little more.");
      const sc = screenCaseText(body, d.people);
      if (sc.live && !fictional) return urgentAnswer(db, user, t, now);
      rateLimit(db, user, "post_edited", now);
      const flags = [
        ...sc.identifying.map((x) => `Might identify someone: ${x}`),
        ...(sc.live ? ["Reads as a live situation; the author said it’s about the fictional case"] : []),
      ];
      tx(db, () => {
        // The edit history stays visible; the new wording is read by a moderator before it's shown.
        if (p.status === "approved") db.prepare("INSERT INTO ct_post_edits (post_id, body, at) VALUES (?, ?, ?)").run(p.id, p.body, at);
        db.prepare(
          "UPDATE ct_posts SET body = ?, status = 'pending', flags = ?, author_note = '', edited_at = ?, endorsed_by = NULL, endorsed_name = NULL, endorsed_at = NULL, endorsed_version = NULL WHERE id = ?",
        ).run(body, JSON.stringify(flags), at, p.id);
      });
      event(db, user, t, "post_edited", now, { post: p.id });
      return view();
    }
    case "withdraw": {
      const p = db.prepare("SELECT * FROM ct_posts WHERE id = ? AND thread_id = ? AND author_id = ?").get(str(input.postId, 120), t.id, user.id) as
        PostRow | undefined;
      if (!p) throw new HttpError(404, "That response isn’t yours.");
      db.prepare("UPDATE ct_posts SET status = 'withdrawn', decided_at = ? WHERE id = ?").run(at, p.id);
      return view();
    }
    case "report": {
      requireUnlocked(a);
      const kind = input.target === "comment" ? "comment" : "post";
      const reason = (typeof input.reason === "string" && input.reason in REPORT_REASONS ? input.reason : "other") as ReportReason;
      const id = str(input.id, 120);
      const row =
        kind === "post"
          ? (db.prepare("SELECT id, author_id, status FROM ct_posts WHERE id = ? AND thread_id = ?").get(id, t.id) as
              { id: string; author_id: string; status: string } | undefined)
          : (db.prepare("SELECT id, author_id, status FROM ct_comments WHERE id = ? AND thread_id = ?").get(id, t.id) as
              { id: string; author_id: string; status: string } | undefined);
      if (!row || row.status !== "approved") throw new HttpError(404, "That isn’t available.");
      if (row.author_id === user.id) throw new HttpError(400, "You can’t report your own words. Withdraw or edit them instead.");
      const target = `${kind}:${row.id}`;
      if (db.prepare("SELECT 1 FROM ct_reports WHERE target = ? AND user_id = ?").get(target, user.id)) return view();
      rateLimit(db, user, "report_made", now);
      tx(db, () => {
        db.prepare("INSERT INTO ct_reports (target, user_id, thread_id, reason, at) VALUES (?, ?, ?, ?, ?)").run(target, user.id, t.id, reason, at);
        if (HIDE_ON_REPORT)
          db.prepare(`UPDATE ${kind === "post" ? "ct_posts" : "ct_comments"} SET status = 'reported' WHERE id = ? AND status = 'approved'`).run(row.id);
      });
      event(db, user, t, "report_made", now, { post: kind === "post" ? row.id : "" });
      return view();
    }
  }
  throw new HttpError(400, "Unknown action.");
}

// ---------------------------------------------------------------------------------------------
// Moderators: one queue for every case thread, whichever page a post came from
// ---------------------------------------------------------------------------------------------

function requireModerator(u: User) {
  if (!canAuthor(u)) throw new HttpError(403, "Only moderators can do that.");
}
function logModeration(db: Db, type: string, id: string, threadId: string, actor: string, action: string, reason: string, at: string) {
  db.prepare("INSERT INTO ct_moderation (target_type, target_id, thread_id, actor, action, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    type,
    id,
    threadId,
    actor,
    action,
    reason,
    at,
  );
}
const reportsOf = (db: Db, target: string) =>
  (
    db.prepare("SELECT reason, at FROM ct_reports WHERE target = ? AND resolved_at IS NULL ORDER BY at").all(target) as { reason: ReportReason; at: string }[]
  ).map((r) => ({ reason: REPORT_REASONS[r.reason] ?? r.reason, at: r.at }));

export function caseModeration(db: Db, actor: User, now: Date) {
  requireModerator(actor);
  ensureCaseThreadTables(db);
  const threads = db.prepare("SELECT * FROM ct_threads ORDER BY created_at").all() as ThreadRow[];
  const titles = new Map(threads.map((t) => [t.id, caseOf(t).title]));
  const item = (kind: "post" | "comment", r: PostRow | CommentRow) => {
    const u = db.prepare("SELECT name, audience FROM users WHERE id = ?").get(r.author_id) as { name: string; audience: string } | undefined;
    const p = kind === "post" ? (r as PostRow) : null;
    return {
      kind,
      id: r.id,
      threadId: r.thread_id,
      threadTitle: titles.get(r.thread_id) ?? r.thread_id,
      body: r.body,
      status: r.status,
      statusText: POST_STATUS[r.status],
      flags: json<string[]>(r.flags, []),
      author: p?.seed ? `${p.seed_name} (fictional seed)` : `${u?.name ?? r.author_id} · ${roleLabel(u?.audience ?? "")}`,
      verified: p?.seed ? SEED_LABEL : (verifiedLabel(db, r.author_id) ?? ""),
      source: p?.source ?? "comment",
      on: kind === "comment" ? (r as CommentRow).post_id : "",
      at: r.created_at,
      editedAt: p?.edited_at ?? null,
      note: r.author_note,
      modNote: p?.mod_note ?? "",
      endorsement: p ? endorsementOf(p) : null,
      current: p ? Boolean(p.seed) || p.policy_version === (threads.find((t) => t.id === p.thread_id)?.policy_version ?? "") : true,
      reports: reportsOf(db, `${kind}:${r.id}`),
    };
  };
  const posts = (where: string) => (db.prepare(`SELECT * FROM ct_posts WHERE ${where} ORDER BY created_at`).all() as PostRow[]).map((r) => item("post", r));
  const comments = (where: string) =>
    (db.prepare(`SELECT * FROM ct_comments WHERE ${where} ORDER BY created_at`).all() as CommentRow[]).map((r) => item("comment", r));
  const users = db.prepare("SELECT id, name, audience FROM users WHERE audience IN ('coordinator', 'staff') ORDER BY name").all() as {
    id: string;
    name: string;
    audience: string;
  }[];
  const verified = db.prepare("SELECT v.*, u.name FROM ct_verified v JOIN users u ON u.id = v.user_id ORDER BY v.granted_at DESC").all() as {
    user_id: string;
    name: string;
    label: string;
    criterion: string;
    granted_by: string;
    granted_at: string;
    revoked_at: string | null;
    revoked_reason: string | null;
  }[];
  return {
    queue: [...posts("status = 'pending'"), ...comments("status = 'pending'")].sort((a, b) => a.at.localeCompare(b.at)),
    reported: [...posts("status = 'reported'"), ...comments("status = 'reported'")],
    escalated: [...posts("status = 'escalated'"), ...comments("status = 'escalated'")],
    waiting: posts("status = 'revision'"),
    published: posts("status = 'approved'"),
    hidden: [...posts("status IN ('hidden', 'archived')"), ...comments("status = 'hidden'")],
    threads: threads.map((t) => {
      const d = caseOf(t);
      const n = (s: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ct_posts WHERE thread_id = ? AND ${s}`).get(t.id) as { n: number }).n;
      const g = db.prepare("SELECT title, slug, status FROM magazine_guides WHERE id = ?").get(t.guide_id) as
        { title: string; slug: string; status: string } | undefined;
      return {
        id: t.id,
        title: d.title,
        version: t.version,
        status: t.status,
        statusText: THREAD_STATUS[t.status],
        statusReason: t.status_reason,
        policy: `${d.policy?.title ?? ""} ${t.policy_version ? `(version ${t.policy_version})` : ""}`.trim(),
        reviewDue: d.reviewDue,
        approval: d.approval,
        audience: audienceOf(t).map((x) => CASE_AUDIENCES[x]),
        course: g ? { title: g.title, slug: g.slug, status: g.status } : null,
        approved: n("status = 'approved'"),
        pending: n("status IN ('pending', 'reported', 'escalated')"),
        href: `/community/cases/${t.id}`,
      };
    }),
    candidates: users.map((u) => ({ id: u.id, name: u.name, role: roleLabel(u.audience) })),
    verified: verified.map((v) => ({
      userId: v.user_id,
      name: v.name,
      label: v.label,
      criterion: v.criterion,
      grantedBy: v.granted_by,
      grantedAt: v.granted_at,
      revokedAt: v.revoked_at,
      revokedReason: v.revoked_reason,
    })),
    decisions: (
      db.prepare("SELECT * FROM ct_moderation ORDER BY id DESC LIMIT 40").all() as {
        id: number;
        target_type: string;
        target_id: string;
        thread_id: string;
        actor: string;
        action: string;
        reason: string;
        at: string;
      }[]
    ).map((m) => ({ ...m, threadTitle: titles.get(m.thread_id) ?? m.thread_id })),
    reasons: REPORT_REASONS,
    now: now.toISOString(),
  };
}

const POST_MOVES: Record<string, { from: PostStatus[]; to: PostStatus | null }> = {
  approve: { from: ["pending", "escalated", "reported"], to: "approved" },
  reject: { from: ["pending", "escalated", "reported", "revision"], to: "rejected" },
  revise: { from: ["pending", "escalated"], to: "revision" },
  hide: { from: ["approved", "reported", "pending", "escalated"], to: "hidden" },
  restore: { from: ["hidden", "reported", "archived"], to: "approved" },
  archive: { from: ["approved", "reported", "hidden"], to: "archived" },
  escalate: { from: ["pending", "reported", "approved", "hidden", "revision"], to: "escalated" },
  annotate: { from: ["approved"], to: null },
  endorse: { from: ["approved"], to: null },
  unendorse: { from: ["approved"], to: null },
};

export function caseModerationAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireModerator(actor);
  ensureCaseThreadTables(db);
  const at = now.toISOString();
  const reason = str(input.reason, 600);
  const action = str(input.action, 30);
  const target = input.target;

  if (target === "thread") {
    const t = db.prepare("SELECT * FROM ct_threads WHERE id = ?").get(str(input.id, 80)) as ThreadRow | undefined;
    if (!t) throw new HttpError(404, NOT_FOUND);
    const to = action === "pause" ? "paused" : action === "archive" ? "archived" : action === "reopen" ? "open" : null;
    if (!to) throw new HttpError(400, "Unknown action.");
    if (to !== "open" && !reason) throw new HttpError(400, "Give a reason: it’s shown on the thread.");
    db.prepare("UPDATE ct_threads SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?").run(to, to === "open" ? "" : reason, at, t.id);
    logModeration(db, "thread", t.id, t.id, actor.id, action, reason, at);
    audit(db, { actor: actor.id, event: `case_thread.${action}`, entity: `case_thread:${t.id}`, previous: t.status, next: to, reason, at: now });
    return caseModeration(db, actor, now);
  }

  if (target === "user") {
    const id = str(input.id, 80);
    const u = db.prepare("SELECT id, audience FROM users WHERE id = ?").get(id) as { id: string; audience: string } | undefined;
    if (!u) throw new HttpError(404, NOT_FOUND);
    if (action === "verify") {
      if (!["coordinator", "staff"].includes(u.audience)) throw new HttpError(400, "Only coordinators and Trilogy Care staff can carry the coordinator badge.");
      const criterion = str(input.criterion, 300);
      if (!criterion) throw new HttpError(400, "Record the verified criterion they meet.");
      db.prepare(
        "INSERT INTO ct_verified (user_id, label, criterion, granted_by, granted_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET label = excluded.label, criterion = excluded.criterion, granted_by = excluded.granted_by, granted_at = excluded.granted_at, revoked_at = NULL, revoked_reason = NULL",
      ).run(u.id, VERIFIED_LABEL, criterion, actor.id, at);
      logModeration(db, "user", u.id, "", actor.id, "verify", criterion, at);
      audit(db, { actor: actor.id, event: "case_thread.verified", entity: `user:${u.id}`, next: criterion, at: now });
    } else if (action === "unverify") {
      if (!reason) throw new HttpError(400, "Give a reason.");
      db.prepare("UPDATE ct_verified SET revoked_at = ?, revoked_reason = ? WHERE user_id = ?").run(at, reason, u.id);
      logModeration(db, "user", u.id, "", actor.id, "unverify", reason, at);
      audit(db, { actor: actor.id, event: "case_thread.unverified", entity: `user:${u.id}`, reason, at: now });
    } else throw new HttpError(400, "Unknown action.");
    return caseModeration(db, actor, now);
  }

  const kind = target === "comment" ? "comment" : "post";
  const table = kind === "post" ? "ct_posts" : "ct_comments";
  const id = str(input.id, 120);
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as (PostRow & CommentRow) | undefined;
  if (!row) throw new HttpError(404, NOT_FOUND);
  const move = POST_MOVES[action];
  if (!move || (kind === "comment" && ["annotate", "endorse", "unendorse", "archive", "revise"].includes(action))) throw new HttpError(400, "Unknown action.");
  if (!move.from.includes(row.status)) throw new HttpError(409, `It’s ${POST_STATUS[row.status].toLowerCase()}, so it can’t be ${action}d.`);
  if (NEEDS_REASON.includes(action as ModAction) && !reason) throw new HttpError(400, "Give a reason: it’s recorded, and the author sees it.");
  const t = db.prepare("SELECT * FROM ct_threads WHERE id = ?").get(row.thread_id) as ThreadRow;
  tx(db, () => {
    if (move.to)
      db.prepare(`UPDATE ${table} SET status = ?, decided_at = ?, author_note = ? WHERE id = ?`).run(
        move.to,
        at,
        ["reject", "revise", "hide", "archive"].includes(action) ? reason : "",
        id,
      );
    if (action === "approve" || action === "restore" || action === "hide" || action === "archive" || action === "reject")
      db.prepare("UPDATE ct_reports SET resolved_at = ? WHERE target = ? AND resolved_at IS NULL").run(at, `${kind}:${id}`);
    if (action === "annotate") db.prepare("UPDATE ct_posts SET mod_note = ? WHERE id = ?").run(reason, id);
    if (action === "endorse") {
      // A person's decision after reviewing the post against the current case note and policy. Votes play no part.
      if (!row.seed && row.policy_version !== t.policy_version)
        throw new HttpError(409, "It was written under an earlier policy version. Ask for an update first.");
      db.prepare("UPDATE ct_posts SET endorsed_by = ?, endorsed_name = ?, endorsed_at = ?, endorsed_version = ? WHERE id = ?").run(
        actor.id,
        actor.name,
        at,
        t.version,
        id,
      );
    }
    if (action === "unendorse")
      db.prepare("UPDATE ct_posts SET endorsed_by = NULL, endorsed_name = NULL, endorsed_at = NULL, endorsed_version = NULL WHERE id = ?").run(id);
    // Hidden, archived or escalated: an endorsement doesn't survive it.
    if (["hide", "archive", "escalate", "reject"].includes(action) && kind === "post")
      db.prepare("UPDATE ct_posts SET endorsed_by = NULL, endorsed_name = NULL, endorsed_at = NULL, endorsed_version = NULL WHERE id = ?").run(id);
    logModeration(db, kind, id, row.thread_id, actor.id, action, reason, at);
    audit(db, { actor: actor.id, event: `case_thread.${action}`, entity: `${kind}:${id}`, previous: row.status, next: move.to ?? row.status, reason, at: now });
  });
  return caseModeration(db, actor, now);
}

// ---------------------------------------------------------------------------------------------
// Basic analytics: aggregate, without anyone's words
// ---------------------------------------------------------------------------------------------

export function caseThreadInsights(db: Db, actor: User) {
  requireModerator(actor);
  ensureCaseThreadTables(db);
  const threads = db.prepare("SELECT * FROM ct_threads ORDER BY created_at").all() as ThreadRow[];
  return {
    note: "Counts of people from 1 to 4 show as “fewer than 5”. Completion is reflective practice, never a competence measure.",
    threads: threads.map((t) => {
      const people = (e: CaseEvent) =>
        suppress((db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM ct_events WHERE thread_id = ? AND event = ?").get(t.id, e) as { n: number }).n);
      const count = (e: CaseEvent) => (db.prepare("SELECT COUNT(*) AS n FROM ct_events WHERE thread_id = ? AND event = ?").get(t.id, e) as { n: number }).n;
      const viewers = db
        .prepare("SELECT user_id, COUNT(DISTINCT post_id) AS n FROM ct_events WHERE thread_id = ? AND event = 'peer_viewed' GROUP BY user_id")
        .all(t.id) as { n: number }[];
      const submitted = db.prepare("SELECT flags, status, created_at, decided_at FROM ct_posts WHERE thread_id = ? AND seed = 0").all(t.id) as {
        flags: string;
        status: string;
        created_at: string;
        decided_at: string | null;
      }[];
      const hours = submitted
        .filter((p) => p.decided_at && p.status !== "withdrawn")
        .map((p) => (Date.parse(p.decided_at!) - Date.parse(p.created_at)) / 3_600_000)
        .sort((a, b) => a - b);
      const median = hours.length ? Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 : null;
      const cell = (n: number | null) => cellText(n);
      return {
        id: t.id,
        title: caseOf(t).title,
        version: t.version,
        status: THREAD_STATUS[t.status],
        learners: {
          started: cell(people("draft_saved")),
          firstTake: cell(people("first_take_submitted")),
          noteViewed: cell(people("note_viewed")),
          peerViewed: cell(people("peer_viewed")),
          reflected: cell(people("reflection_saved")),
          revised: cell(people("revised_saved")),
          completed: cell(people("completed")),
        },
        // The average number of different responses read, once five or more people have read any.
        viewpoints: viewers.length >= 5 ? Math.round((viewers.reduce((s, v) => s + v.n, 0) / viewers.length) * 10) / 10 : null,
        activity: {
          votes: count("vote_added") - count("vote_removed"),
          comments: count("comment_submitted"),
          scriptSaves: count("script_saved"),
          shares: count("share_submitted"),
          reports: count("report_made"),
          liveInterrupts: count("live_interrupt"),
        },
        moderation: {
          waiting: submitted.filter((p) => ["pending", "reported", "escalated"].includes(p.status)).length,
          decided: hours.length,
          medianHoursToDecision: median,
          flaggedShare: submitted.length ? Math.round((submitted.filter((p) => json<string[]>(p.flags, []).length).length / submitted.length) * 100) : null,
          archivedAsOutdated: submitted.filter((p) => p.status === "archived").length,
        },
      };
    }),
  };
}

/** For tests and clean-up: every row that belongs to a thread, removed. Moderators only. */
export function removeCaseThread(db: Db, actor: User, id: string, now: Date) {
  requireModerator(actor);
  ensureCaseThreadTables(db);
  tx(db, () => {
    const posts = (db.prepare("SELECT id FROM ct_posts WHERE thread_id = ?").all(id) as { id: string }[]).map((p) => p.id);
    for (const p of posts) {
      db.prepare("DELETE FROM ct_votes WHERE post_id = ?").run(p);
      db.prepare("DELETE FROM ct_post_edits WHERE post_id = ?").run(p);
    }
    for (const tbl of ["ct_posts", "ct_comments", "ct_reports", "ct_attempts", "ct_saved", "ct_moderation", "ct_events", "ct_versions"])
      db.prepare(`DELETE FROM ${tbl} WHERE thread_id = ?`).run(id);
    db.prepare("DELETE FROM ct_threads WHERE id = ?").run(id);
    audit(db, { actor: actor.id, event: "case_thread.removed", entity: `case_thread:${id}`, at: now });
  });
}
