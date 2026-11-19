import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import type { FollowUpContent } from "@/content/followups";
import { readGuideDoc, type PracticeItem } from "@/lib/magazine";
import {
  ACTIONS,
  answerKeysFor,
  approvalBlock,
  contentHash,
  duplicateKey,
  practiceFound,
  questionInFollowUp,
  questionsInGuide,
  questionsInLesson,
  shortTitle,
  SORTS,
  type Designation,
  type Found,
  type PoolContent,
  type PoolKind,
  type PoolQuery,
  type PoolUser,
  type ReviewAction,
  type Risk,
  type Surface,
  type VersionStatus,
} from "@/lib/questionPool";
import { audit, POOL_SCHEMA, tx, type Db } from "./db";
import { canAuthor, HttpError, isSuperadmin, requireAuthor, type User } from "./auth";

/*
  The Question Pool on the server (lib/questionPool, docs/question-pool.md).

  `syncPool` reconciles the pool with the Hub's content: every question in a published Topic, Magazine
  course or follow-up, and every changed one in a draft, gets its stable id, a version for its exact wording
  and a placement pinned to that version and release. Nothing in a learner's record is touched.

  The first reconciliation (the cutover) records what was already live as approved, marked "first review
  due", because learners were already meeting it. After that, a wording the pool hasn't approved is a draft:
  it shows in the review queue, and publishing can be made to wait for it (the "require approval" setting).
*/

const ready = new WeakSet<Db>();
function ensure(db: Db) {
  if (ready.has(db)) return;
  db.exec(POOL_SCHEMA);
  ready.add(db);
}

const setting = (db: Db, key: string) => (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
const setSetting = (db: Db, key: string, value: string) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);

export function poolUser(db: Db, u: User): PoolUser {
  const r = db.prepare("SELECT review_role FROM users WHERE id = ?").get(u.id) as { review_role: PoolUser["reviewRole"] } | undefined;
  return { id: u.id, canAuthor: canAuthor(u), superadmin: isSuperadmin(u), reviewRole: r?.review_role ?? null };
}

type QRow = {
  id: string;
  origin_key: string | null;
  title: string;
  kind: PoolKind;
  topic: string;
  skill: string;
  audience: string;
  programme: string;
  intended_use: string;
  risk: Risk;
  owner: string | null;
  tags: string;
  next_review: string | null;
  review_trigger: string;
  source_id: string | null;
  source_ref: string;
  rationale: string;
  current_version: number;
  status: VersionStatus;
  stem: string;
  approved_version: number | null;
  approved_at: string | null;
  unreviewed: number;
  live_uses: number;
  total_uses: number;
  live_unapproved: number;
  surfaces: string;
  last_attempt: string | null;
  dup_group: string | null;
  created_at: string;
  updated_at: string;
};
type VRow = {
  question_id: string;
  version: number;
  hash: string;
  kind: PoolKind;
  content: string;
  status: VersionStatus;
  migrated: number;
  change_note: string;
  author: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
};
type PRow = {
  id: number;
  question_id: string;
  version: number;
  surface: Surface;
  designation: Designation;
  container_id: string;
  container_title: string;
  location: string;
  location_title: string;
  release: string;
  live: number;
  current: number;
  first_seen: string;
  last_seen: string;
};

const question = (db: Db, id: string) => db.prepare("SELECT * FROM pool_questions WHERE id = ?").get(id) as QRow | undefined;
const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM pool_versions WHERE question_id = ? ORDER BY version").all(id) as VRow[];

function record(
  db: Db,
  e: { question: string; version: number | null; action: string; from?: string | null; to?: string | null; actor: string | null; note?: string; at: Date },
) {
  db.prepare("INSERT INTO pool_review_events (question_id, version, action, from_status, to_status, actor, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    e.question,
    e.version,
    e.action,
    e.from ?? null,
    e.to ?? null,
    e.actor,
    (e.note ?? "").slice(0, 2000),
    e.at.toISOString(),
  );
}

// ---------------------------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------------------------

/** Every question in the Hub's native content right now: published first, then drafts that differ. */
export function collectQuestions(db: Db): Found[] {
  const out: Found[] = [];
  for (const l of lessons) out.push(...questionsInLesson(l, true));
  const drafts = db.prepare("SELECT slug, draft, published FROM authored_lessons WHERE deleted_at IS NULL AND draft IS NOT NULL").all() as {
    slug: string;
    draft: string;
    published: string | null;
  }[];
  for (const r of drafts) {
    if (r.draft === r.published) continue;
    try {
      out.push(...questionsInLesson({ ...(JSON.parse(r.draft) as Lesson), slug: r.slug }, false).map((f) => ({ ...f, release: "draft" })));
    } catch {}
  }
  const guides = db.prepare("SELECT id, title, audience, draft, revision_id FROM magazine_guides WHERE status != 'archived'").all() as {
    id: string;
    title: string;
    audience: string;
    draft: string;
    revision_id: string | null;
  }[];
  for (const g of guides) {
    const who = (JSON.parse(g.audience) as string[]).join(", ") || "everyone";
    const guide = { id: g.id, title: g.title || "Untitled course", audience: who };
    const rev = g.revision_id
      ? (db.prepare("SELECT number, doc, title FROM magazine_revisions WHERE id = ?").get(g.revision_id) as
          { number: number; doc: string; title: string } | undefined)
      : undefined;
    try {
      if (rev)
        out.push(
          ...questionsInGuide({ ...guide, title: rev.title || guide.title }, readGuideDoc(JSON.parse(rev.doc), { draft: true }), `Edition ${rev.number}`, true),
        );
      if (!rev || rev.doc !== g.draft) out.push(...questionsInGuide(guide, readGuideDoc(JSON.parse(g.draft), { draft: true }), "draft", false));
    } catch {}
  }
  const follow = db.prepare("SELECT id, version, status, content FROM follow_ups ORDER BY id, version").all() as {
    id: string;
    version: number;
    status: string;
    content: string;
  }[];
  const byId = new Map<string, typeof follow>();
  for (const f of follow) byId.set(f.id, [...(byId.get(f.id) ?? []), f]);
  for (const rows of byId.values()) {
    const approved = [...rows].reverse().find((r) => r.status === "approved");
    const latest = rows[rows.length - 1];
    try {
      if (approved) {
        const f = questionInFollowUp(JSON.parse(approved.content) as FollowUpContent, true);
        if (f) out.push(f);
      }
      if (latest && latest !== approved) {
        const f = questionInFollowUp(JSON.parse(latest.content) as FollowUpContent, false);
        if (f) out.push({ ...f, release: `v${latest.version} draft` });
      }
    } catch {}
  }
  return out;
}

const nextId = (db: Db) => {
  const n = Number(setting(db, "pool_next_id") ?? "1");
  setSetting(db, "pool_next_id", String(n + 1));
  return `Q-${String(n).padStart(5, "0")}`;
};

/** Brings the question's summary columns in step with its versions and placements. */
function refresh(db: Db, id: string, at: string) {
  const q = question(db, id);
  if (!q) return;
  const versions = versionsOf(db, id);
  const places = db.prepare("SELECT * FROM pool_placements WHERE question_id = ? AND current = 1").all(id) as PRow[];
  const placed = new Set(places.map((p) => p.version));
  const current =
    [...versions].reverse().find((v) => placed.has(v.version)) ?? [...versions].reverse().find((v) => v.status !== "retired") ?? versions[versions.length - 1];
  if (!current) return;
  const approved = [...versions].reverse().find((v) => v.status === "approved");
  const c = JSON.parse(current.content) as PoolContent;
  const statusOf = new Map(versions.map((v) => [v.version, v.status]));
  const live = places.filter((p) => p.live);
  const total = (
    db.prepare("SELECT COUNT(DISTINCT surface || '|' || container_id || '|' || location) AS n FROM pool_placements WHERE question_id = ?").get(id) as {
      n: number;
    }
  ).n;
  const search = [
    q.id,
    q.title,
    c.stem,
    c.context,
    c.explanation,
    c.feedback?.correct,
    c.feedback?.incorrect,
    ...c.options.map((o) => o.text),
    q.topic,
    q.skill,
    q.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .slice(0, 6000);
  db.prepare(
    `UPDATE pool_questions SET current_version = ?, status = ?, kind = ?, stem = ?, search = ?, approved_version = ?, approved_at = ?, unreviewed = ?,
       live_uses = ?, total_uses = ?, live_unapproved = ?, surfaces = ?, updated_at = ? WHERE id = ?`,
  ).run(
    current.version,
    current.status,
    current.kind,
    c.stem.slice(0, 600),
    search,
    approved?.version ?? null,
    approved?.approved_at ?? null,
    approved?.migrated ? 1 : 0,
    new Set(live.map((p) => `${p.surface}|${p.container_id}|${p.location}`)).size,
    total,
    live.some((p) => statusOf.get(p.version) !== "approved") ? 1 : 0,
    [...new Set(places.map((p) => p.surface))].join(","),
    at,
    id,
  );
}

/** First answers per question, from what's already recorded: assessed, knowledge check and practice kept apart. */
function refreshSignals(db: Db, found: Found[]) {
  const ids = new Map(
    (db.prepare("SELECT id, origin_key FROM pool_questions WHERE origin_key IS NOT NULL").all() as { id: string; origin_key: string }[]).map((r) => [
      r.origin_key,
      r.id,
    ]),
  );
  const designation = new Map<string, Designation>();
  for (const f of found) if (f.live || !designation.has(f.key)) designation.set(f.key, f.designation);
  type Tally = { attempts: number; correct: number; last: string | null; picks: Record<string, number> };
  const tallies = new Map<string, Tally>();
  const add = (key: string, d: Designation | undefined, correct: boolean, at: string | null, pick?: string) => {
    const id = ids.get(key);
    if (!id) return;
    const k = `${id}|${d ?? designation.get(key) ?? "formative"}`;
    const t = tallies.get(k) ?? { attempts: 0, correct: 0, last: null, picks: {} };
    t.attempts++;
    if (correct) t.correct++;
    if (at && (!t.last || at > t.last)) t.last = at;
    if (pick) t.picks[pick] = (t.picks[pick] ?? 0) + 1;
    tallies.set(k, t);
  };
  for (const r of db.prepare("SELECT lesson_slug, evidence, completed_at FROM lesson_completions WHERE evidence IS NOT NULL").all() as {
    lesson_slug: string;
    evidence: string;
    completed_at: string;
  }[]) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(r.evidence) as Record<string, unknown>)) {
        if (!k.startsWith("first:")) continue;
        add(`topic:${r.lesson_slug}:${k.slice(6).replace(".", ":")}`, undefined, v === 1, r.completed_at);
      }
    } catch {}
  }
  for (const r of db
    .prepare(
      "SELECT s.guide_id, r.item_id, r.choice_id, r.correct, r.at FROM magazine_practice_responses r JOIN magazine_practice_sessions s ON s.id = r.session_id",
    )
    .all() as { guide_id: string; item_id: string; choice_id: string; correct: number; at: string }[])
    add(`practice:${r.guide_id}:${r.item_id}`, "practice", Boolean(r.correct), r.at, r.choice_id);
  for (const r of db.prepare("SELECT guide_id, block_id, detail, at FROM magazine_events WHERE event = 'decision.answered'").all() as {
    guide_id: string;
    block_id: string | null;
    detail: string;
    at: string;
  }[]) {
    try {
      const d = JSON.parse(r.detail) as { choice?: string; verdict?: string; attempt?: number };
      if (d.attempt === 1 && r.block_id) add(`magazine:${r.guide_id}:${r.block_id}`, "formative", d.verdict === "best", r.at, d.choice);
    } catch {}
  }
  for (const r of db.prepare("SELECT question_id, initial_correct, initial_at FROM attempts WHERE follow_up_version > 0").all() as {
    question_id: string;
    initial_correct: number;
    initial_at: string;
  }[])
    add(`followup:${r.question_id}`, "formative", Boolean(r.initial_correct), r.initial_at);
  db.exec("DELETE FROM pool_signals");
  const last = new Map<string, string>();
  for (const [k, t] of tallies) {
    const [id, d] = k.split("|");
    db.prepare("INSERT INTO pool_signals (question_id, designation, attempts, correct, last_at, picks) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      d,
      t.attempts,
      t.correct,
      t.last,
      JSON.stringify(t.picks),
    );
    if (t.last && (!last.get(id) || t.last > last.get(id)!)) last.set(id, t.last);
  }
  db.exec("UPDATE pool_questions SET last_attempt = NULL");
  for (const [id, at] of last) db.prepare("UPDATE pool_questions SET last_attempt = ? WHERE id = ?").run(at, id);
}

export type Reconciliation = {
  at: string;
  cutover: boolean;
  found: { questions: number; placements: number; bySurface: Record<string, { questions: number; live: number; draft: number }> };
  newQuestions: number;
  newVersions: number;
  withdrawn: number;
  pool: { questions: number; versions: number; livePlacements: number };
  /** What still needs attention, counted rather than assumed away. */
  exceptions: { liveUnapproved: number; unreadable: number; duplicates: number };
};

/**
  Reconciles the pool with the Hub's content. Safe to run at any time: it never changes a learner's record,
  and never changes a version once written.
*/
export function syncPool(db: Db, actor: User | null, now: Date): Reconciliation {
  ensure(db);
  const found = collectQuestions(db);
  const at = now.toISOString();
  return tx(db, () => {
    const cutover = !setting(db, "pool_cutover");
    const liveHash = new Map<string, string>();
    const seen = new Set<string>();
    const touched = new Set<string>();
    let newQuestions = 0;
    let newVersions = 0;
    const bySurface: Reconciliation["found"]["bySurface"] = {};
    db.exec("UPDATE pool_placements SET current = 0 WHERE current = 1");
    for (const f of [...found.filter((x) => x.live), ...found.filter((x) => !x.live)]) {
      const hash = contentHash(f.kind, f.content);
      const s = (bySurface[f.surface] ??= { questions: 0, live: 0, draft: 0 });
      // A draft that says what's already live isn't a change.
      if (!f.live && liveHash.get(f.key) === hash) continue;
      if (f.live) {
        liveHash.set(f.key, hash);
        s.live++;
      } else s.draft++;
      let q = db.prepare("SELECT * FROM pool_questions WHERE origin_key = ?").get(f.key) as QRow | undefined;
      if (!q) {
        const id = nextId(db);
        db.prepare(
          `INSERT INTO pool_questions (id, origin_key, title, kind, topic, audience, intended_use, source_ref, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, f.key, shortTitle(f.content.stem), f.kind, f.topic, f.audience, f.designation, f.source ?? "", actor?.id ?? null, at, at);
        q = question(db, id)!;
        newQuestions++;
        s.questions++;
      } else if (!touched.has(q.id)) s.questions++;
      touched.add(q.id);
      let v = db.prepare("SELECT * FROM pool_versions WHERE question_id = ? AND hash = ?").get(q.id, hash) as VRow | undefined;
      if (!v) {
        const n = ((db.prepare("SELECT MAX(version) AS n FROM pool_versions WHERE question_id = ?").get(q.id) as { n: number | null }).n ?? 0) + 1;
        // Self-review questions are only ever approved in their course, never by being there at set-up.
        const grandfathered = !f.approved && f.live && cutover && f.surface !== "magazine-practice";
        const status: VersionStatus = f.approved || grandfathered ? "approved" : "draft";
        db.prepare(
          `INSERT INTO pool_versions (question_id, version, hash, kind, content, status, migrated, author, created_at, approved_by, approved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          q.id,
          n,
          hash,
          f.kind,
          JSON.stringify(f.content),
          status,
          grandfathered ? 1 : 0,
          cutover ? null : (actor?.id ?? null),
          at,
          f.approved?.by ?? null,
          f.approved?.at ?? (grandfathered ? at : null),
        );
        record(db, {
          question: q.id,
          version: n,
          action: grandfathered ? "migrated" : f.approved ? "approved_in_course" : n === 1 ? "registered" : "new_version",
          to: status,
          actor: actor?.id ?? null,
          note: grandfathered
            ? `Already live in “${f.containerTitle}” when the pool was set up. Recorded as approved; first review due.`
            : f.approved
              ? `Approved in the course editor by ${f.approved.by}.`
              : `${f.live ? "Published" : "In a draft"} in “${f.containerTitle}”. Needs approval here.`,
          at: now,
        });
        v = db.prepare("SELECT * FROM pool_versions WHERE question_id = ? AND version = ?").get(q.id, n) as VRow;
        newVersions++;
      } else if (f.approved && (v.status === "draft" || v.status === "in_review")) {
        db.prepare("UPDATE pool_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE question_id = ? AND version = ?").run(
          f.approved.by,
          f.approved.at,
          q.id,
          v.version,
        );
        record(db, {
          question: q.id,
          version: v.version,
          action: "approved_in_course",
          from: v.status,
          to: "approved",
          actor: null,
          note: `Approved in the course editor by ${f.approved.by}.`,
          at: now,
        });
      }
      seen.add(`${q.id}:${v.version}`);
      db.prepare(
        `INSERT INTO pool_placements (question_id, version, surface, designation, container_id, container_title, location, location_title, release, live, current, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (question_id, version, surface, container_id, location, release, live)
         DO UPDATE SET current = 1, last_seen = excluded.last_seen, container_title = excluded.container_title, location_title = excluded.location_title, designation = excluded.designation`,
      ).run(q.id, v.version, f.surface, f.designation, f.containerId, f.containerTitle, f.location, f.locationTitle, f.release, f.live ? 1 : 0, at, at);
    }
    // A draft wording that's no longer anywhere (edited again, or removed) is withdrawn, so it doesn't wait for review.
    let withdrawn = 0;
    for (const v of db.prepare("SELECT question_id, version, status FROM pool_versions WHERE status IN ('draft', 'in_review')").all() as VRow[]) {
      if (seen.has(`${v.question_id}:${v.version}`)) continue;
      db.prepare("UPDATE pool_versions SET status = 'retired' WHERE question_id = ? AND version = ?").run(v.question_id, v.version);
      record(db, {
        question: v.question_id,
        version: v.version,
        action: "withdrawn",
        from: v.status,
        to: "retired",
        actor: null,
        note: "This wording is no longer in any Topic or course.",
        at: now,
      });
      touched.add(v.question_id);
      withdrawn++;
    }
    const all = db.prepare("SELECT id FROM pool_questions").all() as { id: string }[];
    for (const { id } of all) refresh(db, id, at);
    // Possible duplicates: the same question and best answer under more than one id.
    const groups = new Map<string, string[]>();
    for (const r of db
      .prepare(
        "SELECT q.id, v.content FROM pool_questions q JOIN pool_versions v ON v.question_id = q.id AND v.version = q.current_version WHERE q.status != 'retired'",
      )
      .all() as { id: string; content: string }[]) {
      const k = duplicateKey(JSON.parse(r.content) as PoolContent);
      if (k) groups.set(k, [...(groups.get(k) ?? []), r.id]);
    }
    db.exec("UPDATE pool_questions SET dup_group = NULL WHERE dup_group IS NOT NULL");
    let duplicates = 0;
    for (const [k, ids] of groups)
      if (ids.length > 1) {
        duplicates += ids.length;
        for (const id of ids) db.prepare("UPDATE pool_questions SET dup_group = ? WHERE id = ?").run(k, id);
      }
    refreshSignals(db, found);
    if (cutover) setSetting(db, "pool_cutover", at);
    setSetting(db, "pool_synced_at", at);
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const report: Reconciliation = {
      at,
      cutover,
      found: { questions: touched.size, placements: found.length, bySurface },
      newQuestions,
      newVersions,
      withdrawn,
      pool: {
        questions: count("SELECT COUNT(*) AS n FROM pool_questions"),
        versions: count("SELECT COUNT(*) AS n FROM pool_versions"),
        livePlacements: count("SELECT COUNT(*) AS n FROM pool_placements WHERE current = 1 AND live = 1"),
      },
      exceptions: { liveUnapproved: count("SELECT COUNT(*) AS n FROM pool_questions WHERE live_unapproved = 1"), unreadable: 0, duplicates },
    };
    // Kept when it changed something, when asked for, and the first time.
    if (cutover || actor || newQuestions || newVersions || withdrawn)
      db.prepare("INSERT INTO pool_reconciliations (at, by_user, report) VALUES (?, ?, ?)").run(at, actor?.id ?? null, JSON.stringify(report));
    return report;
  });
}

/** Reconciles when it hasn't been done in the last minute, so the table is current without doing it on every request. */
function syncIfStale(db: Db, now: Date) {
  ensure(db);
  const last = setting(db, "pool_synced_at");
  if (!last || now.getTime() - Date.parse(last) > 60_000) syncPool(db, null, now);
}

// ---------------------------------------------------------------------------------------------
// The live table
// ---------------------------------------------------------------------------------------------

const PAGE = 50;
const viewWhere = (view: string | undefined, now: Date): string | null => {
  const soon = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  switch (view) {
    case "live":
      return "q.live_uses > 0";
    case "needs-review":
      return "(q.status IN ('needs_review', 'in_review', 'draft') OR q.live_unapproved = 1)";
    case "first-review":
      return "q.unreviewed = 1 AND q.status = 'approved'";
    case "due-soon":
      return `(q.next_review IS NOT NULL AND q.next_review <= '${soon}' AND q.status != 'retired')`;
    case "unplaced":
      return "q.status = 'approved' AND q.live_uses = 0";
    case "no-source":
      return "q.source_id IS NULL AND q.source_ref = '' AND q.status != 'retired'";
    case "duplicates":
      return "q.dup_group IS NOT NULL";
    case "high-risk":
      return "q.risk = 'high'";
    default:
      return null;
  }
};

function whereFor(query: PoolQuery, now: Date) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const v = viewWhere(query.view, now);
  if (v) where.push(v);
  for (const term of (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push("q.search LIKE ? ESCAPE '\\'");
    args.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const eq = (col: string, val: string | undefined) => {
    if (!val) return;
    where.push(`${col} = ?`);
    args.push(val);
  };
  eq("q.status", query.status);
  eq("q.kind", query.kind);
  eq("q.risk", query.risk);
  eq("q.topic", query.topic);
  if (query.audience) {
    where.push("q.audience LIKE ?");
    args.push(`%${query.audience}%`);
  }
  if (query.surface) {
    where.push("(',' || q.surfaces || ',') LIKE ?");
    args.push(`%,${query.surface},%`);
  }
  if (query.owner === "none") where.push("q.owner IS NULL");
  else eq("q.owner", query.owner);
  if (query.source === "none") where.push("q.source_id IS NULL AND q.source_ref = ''");
  else eq("q.source_id", query.source);
  if (query.due) {
    const today = now.toISOString().slice(0, 10);
    const days = query.due === "overdue" ? 0 : Number(query.due) || 30;
    where.push("q.next_review IS NOT NULL AND q.next_review <= ?");
    args.push(days ? new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10) : today);
  }
  if (query.use === "live") where.push("q.live_uses > 0");
  if (query.use === "unused") where.push("q.live_uses = 0");
  if (query.duplicate) where.push("q.dup_group IS NOT NULL");
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

const ORDER: Record<(typeof SORTS)[number], string> = {
  id: "q.id",
  title: "q.title COLLATE NOCASE",
  kind: "q.kind",
  topic: "q.topic COLLATE NOCASE",
  audience: "q.audience COLLATE NOCASE",
  risk: "q.risk",
  status: "q.status",
  owner: "u.name COLLATE NOCASE",
  approved: "q.approved_at",
  review: "q.next_review",
  used: "q.live_uses",
  attempted: "q.last_attempt",
};

type ListRow = QRow & { owner_name: string | null; source_title: string | null; source_status: string | null };

function rowView(db: Db, r: ListRow) {
  const signals = db.prepare("SELECT designation, attempts, correct FROM pool_signals WHERE question_id = ?").all(r.id) as {
    designation: Designation;
    attempts: number;
    correct: number;
  }[];
  return {
    id: r.id,
    title: r.title,
    stem: r.stem,
    kind: r.kind,
    topic: r.topic,
    skill: r.skill,
    audience: r.audience,
    programme: r.programme,
    intendedUse: r.intended_use,
    risk: r.risk,
    status: r.status,
    owner: r.owner ? { id: r.owner, name: r.owner_name ?? r.owner } : null,
    source: r.source_id ? { id: r.source_id, title: r.source_title ?? "", superseded: r.source_status === "superseded" } : null,
    sourceRef: r.source_ref,
    currentVersion: r.current_version,
    approvedVersion: r.approved_version,
    approvedAt: r.approved_at,
    unreviewed: Boolean(r.unreviewed),
    nextReview: r.next_review,
    reviewTrigger: r.review_trigger,
    liveUses: r.live_uses,
    totalUses: r.total_uses,
    liveUnapproved: Boolean(r.live_unapproved),
    surfaces: r.surfaces ? (r.surfaces.split(",") as Surface[]) : [],
    lastAttempt: r.last_attempt,
    duplicate: Boolean(r.dup_group),
    tags: JSON.parse(r.tags) as string[],
    signals,
  };
}
export type PoolRow = ReturnType<typeof rowView>;

const FROM = "FROM pool_questions q LEFT JOIN users u ON u.id = q.owner LEFT JOIN pool_sources s ON s.id = q.source_id";

/** Every row matching the query, sorted: for the export, which covers the whole result, not one page. */
export function poolRows(db: Db, query: PoolQuery, now: Date, limit?: { size: number; offset: number }) {
  const { sql, args } = whereFor(query, now);
  const sort = (SORTS as readonly string[]).includes(query.sort ?? "") ? (query.sort as (typeof SORTS)[number]) : "id";
  const dir = query.dir === "desc" ? "DESC" : "ASC";
  const rows = db
    .prepare(
      `SELECT q.*, u.name AS owner_name, s.title AS source_title, s.status AS source_status ${FROM} ${sql}
       ORDER BY (${ORDER[sort]} IS NULL), ${ORDER[sort]} ${dir}, q.id ${limit ? "LIMIT ? OFFSET ?" : ""}`,
    )
    .all(...args, ...(limit ? [limit.size, limit.offset] : [])) as ListRow[];
  const total = (db.prepare(`SELECT COUNT(*) AS n ${FROM} ${sql}`).get(...args) as { n: number }).n;
  return { rows: rows.map((r) => rowView(db, r)), total };
}

/** The live table: one page of the sorted, filtered result, with what the filters can offer and each view's size. */
export function listPool(db: Db, user: User, query: PoolQuery, now: Date) {
  requireAuthor(user);
  syncIfStale(db, now);
  const page = Math.max(1, Math.round(Number(query.page) || 1));
  const { rows, total } = poolRows(db, query, now, { size: PAGE, offset: (page - 1) * PAGE });
  const me = poolUser(db, user);
  const distinct = (col: string) =>
    (db.prepare(`SELECT DISTINCT ${col} AS v FROM pool_questions WHERE ${col} != '' ORDER BY ${col} COLLATE NOCASE`).all() as { v: string }[]).map((r) => r.v);
  const views: Record<string, number> = {};
  for (const id of ["all", "live", "needs-review", "first-review", "due-soon", "unplaced", "no-source", "duplicates", "high-risk"]) {
    const w = viewWhere(id, now);
    views[id] = (db.prepare(`SELECT COUNT(*) AS n FROM pool_questions q ${w ? `WHERE ${w}` : ""}`).get() as { n: number }).n;
  }
  return {
    rows,
    total,
    page,
    pageSize: PAGE,
    poolSize: views.all,
    views,
    facets: {
      topics: distinct("topic"),
      audiences: [...new Set(distinct("audience").flatMap((a) => a.split(",").map((x) => x.trim())))].filter(Boolean).sort(),
      owners: db.prepare("SELECT id, name FROM users WHERE role = 'author' ORDER BY name").all() as { id: string; name: string }[],
      sources: listSources(db),
    },
    saved: db.prepare("SELECT id, name, query FROM pool_views WHERE user_id = ? ORDER BY name").all(user.id) as { id: number; name: string; query: string }[],
    syncedAt: setting(db, "pool_synced_at"),
    me: { reviewRole: me.reviewRole, superadmin: me.superadmin, answerKeys: answerKeysFor(me), canApprove: Boolean(me.reviewRole) || me.superadmin },
  };
}

// ---------------------------------------------------------------------------------------------
// One question: its versions, where it's used, its history and what a problem with it would touch
// ---------------------------------------------------------------------------------------------

const nameOf = (db: Db, id: string | null) =>
  id ? ((db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id) : null;

export function questionDetail(db: Db, user: User, id: string) {
  requireAuthor(user);
  ensure(db);
  const q = db.prepare(`SELECT q.*, u.name AS owner_name, s.title AS source_title, s.status AS source_status ${FROM} WHERE q.id = ?`).get(id) as
    ListRow | undefined;
  if (!q) throw new HttpError(404, "That question isn’t in the pool.");
  const me = poolUser(db, user);
  const versions = versionsOf(db, id);
  const places = db.prepare("SELECT * FROM pool_placements WHERE question_id = ? ORDER BY current DESC, live DESC, last_seen DESC").all(id) as PRow[];
  const current = versions.find((v) => v.version === q.current_version)!;
  const practiceOnly = places.length > 0 && places.every((p) => p.surface === "magazine-practice");
  const live = places.filter((p) => p.current && p.live);
  const attempts = (db.prepare("SELECT COALESCE(SUM(attempts), 0) AS n FROM pool_signals WHERE question_id = ?").get(id) as { n: number }).n;
  return {
    ...rowView(db, q),
    rationale: q.rationale,
    sourceDetail: q.source_id ? ((db.prepare("SELECT * FROM pool_sources WHERE id = ?").get(q.source_id) as SourceRow | undefined) ?? null) : null,
    versions: versions
      .map((v) => ({
        version: v.version,
        status: v.status,
        kind: v.kind,
        content: JSON.parse(v.content) as PoolContent,
        migrated: Boolean(v.migrated),
        author: nameOf(db, v.author),
        createdAt: v.created_at,
        // Approved in the pool by a user, or in the course editor by name.
        approvedBy: v.approved_by ? (nameOf(db, v.approved_by) ?? v.approved_by) : null,
        approvedAt: v.approved_at,
        changeNote: v.change_note,
        live: live.some((p) => p.version === v.version),
      }))
      .reverse(),
    placements: places.map((p) => ({
      version: p.version,
      surface: p.surface,
      designation: p.designation,
      containerId: p.container_id,
      containerTitle: p.container_title,
      locationTitle: p.location_title,
      release: p.release,
      live: Boolean(p.live),
      current: Boolean(p.current),
      firstSeen: p.first_seen,
      lastSeen: p.last_seen,
    })),
    events: (
      db
        .prepare("SELECT e.*, u.name FROM pool_review_events e LEFT JOIN users u ON u.id = e.actor WHERE e.question_id = ? ORDER BY e.id DESC LIMIT 100")
        .all(id) as {
        id: number;
        version: number | null;
        action: string;
        from_status: string | null;
        to_status: string | null;
        name: string | null;
        note: string;
        at: string;
      }[]
    ).map((e) => ({ id: e.id, version: e.version, action: e.action, from: e.from_status, to: e.to_status, by: e.name ?? "The Hub", note: e.note, at: e.at })),
    signalDetail: (
      db.prepare("SELECT * FROM pool_signals WHERE question_id = ?").all(id) as {
        designation: Designation;
        attempts: number;
        correct: number;
        last_at: string | null;
        picks: string;
      }[]
    ).map((s) => ({
      designation: s.designation,
      attempts: s.attempts,
      correct: s.correct,
      lastAt: s.last_at,
      picks: JSON.parse(s.picks) as Record<string, number>,
    })),
    // What a problem with this question touches: where it's live now, for whom, and how many answers are on record.
    impact: {
      placements: live.length,
      containers: [
        ...new Map(
          live.map((p) => [`${p.surface}|${p.container_id}`, { surface: p.surface, title: p.container_title, release: p.release, designation: p.designation }]),
        ).values(),
      ],
      assessed: live.filter((p) => p.designation === "assessed").length,
      practice: live.filter((p) => p.designation === "practice").length,
      attempts,
    },
    duplicates: q.dup_group
      ? (db.prepare("SELECT id, title, topic FROM pool_questions WHERE dup_group = ? AND id != ?").all(q.dup_group, id) as {
          id: string;
          title: string;
          topic: string;
        }[])
      : [],
    practiceOnly,
    can: {
      approve: approvalBlock(me, q.risk, current?.author ?? null),
      answerKeys: answerKeysFor(me),
    },
  };
}
export type PoolDetail = ReturnType<typeof questionDetail>;

// ---------------------------------------------------------------------------------------------
// Review actions and details
// ---------------------------------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** A step in a version's review: submit, approve, ask for changes, flag, retire or restore. */
export function reviewQuestion(db: Db, user: User, id: string, input: { action?: unknown; version?: unknown; note?: unknown }, now: Date) {
  requireAuthor(user);
  ensure(db);
  const action = String(input.action) as ReviewAction;
  const rule = ACTIONS[action];
  if (!rule) throw new HttpError(400, "Unknown action.");
  return tx(db, () => {
    const q = question(db, id);
    if (!q) throw new HttpError(404, "That question isn’t in the pool.");
    const n = Number(input.version) || q.current_version;
    const v = db.prepare("SELECT * FROM pool_versions WHERE question_id = ? AND version = ?").get(id, n) as VRow | undefined;
    if (!v) throw new HttpError(404, "That version isn’t there.");
    const note = text(input.note, 2000);
    // Confirming a question that was approved at migration counts as approving it.
    const confirming = action === "approve" && v.status === "approved" && v.migrated === 1;
    if (!rule.from.includes(v.status) && !confirming) throw new HttpError(409, `A ${v.status.replace("_", " ")} version can’t be ${rule.label.toLowerCase()}.`);
    if (rule.needsNote && !note) throw new HttpError(400, "Say why, so the next person knows.");
    const practiceOnly = !(db.prepare("SELECT 1 FROM pool_placements WHERE question_id = ? AND surface != 'magazine-practice' LIMIT 1").get(id) as unknown);
    if (practiceOnly && (action === "approve" || action === "submit") && !confirming)
      throw new HttpError(409, "Self-review questions are approved in their course: open the course, then Self-review, then Manage questions.");
    if (action === "approve") {
      const block = approvalBlock(poolUser(db, user), q.risk, v.author);
      if (block) throw new HttpError(403, block);
      if (q.risk === "high" && !q.source_id && !q.source_ref) throw new HttpError(409, "A high-risk question needs its source recorded before it’s approved.");
      db.prepare(
        "UPDATE pool_versions SET status = 'approved', migrated = 0, approved_by = ?, approved_at = ?, change_note = CASE WHEN ? != '' THEN ? ELSE change_note END WHERE question_id = ? AND version = ?",
      ).run(user.id, now.toISOString(), note, note, id, n);
    } else db.prepare("UPDATE pool_versions SET status = ? WHERE question_id = ? AND version = ?").run(rule.to, id, n);
    record(db, { question: id, version: n, action: confirming ? "confirmed" : action, from: v.status, to: rule.to, actor: user.id, note, at: now });
    audit(db, {
      actor: user.id,
      event: `pool.${action}`,
      entity: `question:${id}`,
      previous: { version: n, status: v.status },
      next: { version: n, status: rule.to },
      reason: note || undefined,
      at: now,
    });
    refresh(db, id, now.toISOString());
    return questionDetail(db, user, id);
  });
}

/** The question's details: what it tests, who owns it, how risky, when it's next reviewed, and the source its answer rests on. */
export function updateQuestion(db: Db, user: User, id: string, input: Record<string, unknown>, now: Date) {
  requireAuthor(user);
  ensure(db);
  return tx(db, () => {
    const q = question(db, id);
    if (!q) throw new HttpError(404, "That question isn’t in the pool.");
    const next = {
      title: "title" in input ? text(input.title, 160) || q.title : q.title,
      topic: "topic" in input ? text(input.topic, 120) : q.topic,
      skill: "skill" in input ? text(input.skill, 200) : q.skill,
      audience: "audience" in input ? text(input.audience, 160) : q.audience,
      programme: "programme" in input ? text(input.programme, 120) : q.programme,
      intended_use:
        "intendedUse" in input && ["assessed", "formative", "practice", "any"].includes(String(input.intendedUse)) ? String(input.intendedUse) : q.intended_use,
      risk: "risk" in input ? (input.risk === "high" ? "high" : "standard") : q.risk,
      owner: "owner" in input ? text(input.owner, 80) || null : q.owner,
      tags:
        "tags" in input && Array.isArray(input.tags)
          ? JSON.stringify([...new Set((input.tags as unknown[]).map((t) => text(t, 40)).filter(Boolean))].slice(0, 12))
          : q.tags,
      next_review: "nextReview" in input ? day(input.nextReview) : q.next_review,
      review_trigger: "reviewTrigger" in input ? text(input.reviewTrigger, 300) : q.review_trigger,
      source_id: "sourceId" in input ? text(input.sourceId, 40) || null : q.source_id,
      source_ref: "sourceRef" in input ? text(input.sourceRef, 300) : q.source_ref,
      rationale: "rationale" in input ? text(input.rationale, 1500) : q.rationale,
    };
    if (next.owner && !db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'author'").get(next.owner))
      throw new HttpError(400, "Choose an author as the owner.");
    if (next.source_id && !db.prepare("SELECT 1 FROM pool_sources WHERE id = ?").get(next.source_id))
      throw new HttpError(400, "That source isn’t in the list.");
    db.prepare(
      `UPDATE pool_questions SET title = ?, topic = ?, skill = ?, audience = ?, programme = ?, intended_use = ?, risk = ?, owner = ?, tags = ?, next_review = ?,
         review_trigger = ?, source_id = ?, source_ref = ?, rationale = ?, updated_at = ? WHERE id = ?`,
    ).run(
      next.title,
      next.topic,
      next.skill,
      next.audience,
      next.programme,
      next.intended_use,
      next.risk,
      next.owner,
      next.tags,
      next.next_review,
      next.review_trigger,
      next.source_id,
      next.source_ref,
      next.rationale,
      now.toISOString(),
      id,
    );
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== (q as unknown as Record<string, unknown>)[k]);
    if (changed.length)
      record(db, { question: id, version: null, action: "details", actor: user.id, note: `Changed: ${changed.join(", ").replace(/_/g, " ")}.`, at: now });
    // Approval is for a version with its evidence: a different source, or a higher risk than it was approved at, asks for another look.
    const approved = q.approved_version
      ? (db.prepare("SELECT * FROM pool_versions WHERE question_id = ? AND version = ?").get(id, q.approved_version) as VRow | undefined)
      : undefined;
    const why =
      approved && q.source_id && next.source_id !== q.source_id
        ? "Its source was changed after approval."
        : approved && next.risk === "high" && q.risk !== "high"
          ? "Marked high-risk: it needs Quality and Compliance or the Hub owner to approve it."
          : null;
    if (approved && why && approved.status === "approved") {
      db.prepare("UPDATE pool_versions SET status = 'needs_review' WHERE question_id = ? AND version = ?").run(id, approved.version);
      record(db, { question: id, version: approved.version, action: "flag", from: "approved", to: "needs_review", actor: user.id, note: why, at: now });
    }
    refresh(db, id, now.toISOString());
    return questionDetail(db, user, id);
  });
}

/** For several questions at once: an owner, a tag, a review date, or submitting drafts. Never approval or answers. */
export function bulkUpdate(db: Db, user: User, input: { ids?: unknown; owner?: unknown; tag?: unknown; nextReview?: unknown; submit?: unknown }, now: Date) {
  requireAuthor(user);
  ensure(db);
  const ids = (Array.isArray(input.ids) ? (input.ids as unknown[]) : []).filter((x): x is string => typeof x === "string").slice(0, 500);
  if (!ids.length) throw new HttpError(400, "Choose some questions first.");
  let done = 0;
  let skipped = 0;
  for (const id of ids) {
    const q = question(db, id);
    if (!q) continue;
    const change: Record<string, unknown> = {};
    if (typeof input.owner === "string") change.owner = input.owner;
    if (typeof input.nextReview === "string") change.nextReview = input.nextReview;
    if (typeof input.tag === "string" && input.tag.trim()) change.tags = [...(JSON.parse(q.tags) as string[]), input.tag];
    if (Object.keys(change).length) updateQuestion(db, user, id, change, now);
    if (input.submit === true) {
      try {
        reviewQuestion(db, user, id, { action: "submit" }, now);
      } catch {
        skipped++;
        continue;
      }
    }
    done++;
  }
  return { done, skipped };
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

type SourceRow = {
  id: string;
  title: string;
  url: string;
  effective: string | null;
  authority: string;
  owner: string;
  status: "current" | "superseded";
  superseded_by: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

export function listSources(db: Db) {
  ensure(db);
  return (
    db
      .prepare(
        "SELECT s.*, (SELECT COUNT(*) FROM pool_questions q WHERE q.source_id = s.id) AS questions FROM pool_sources s ORDER BY s.status, s.title COLLATE NOCASE",
      )
      .all() as (SourceRow & { questions: number })[]
  ).map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    effective: s.effective,
    authority: s.authority,
    owner: s.owner,
    status: s.status,
    supersededBy: s.superseded_by,
    note: s.note,
    questions: s.questions,
  }));
}

export function saveSource(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(user);
  ensure(db);
  const title = text(input.title, 200);
  if (!title) throw new HttpError(400, "Give the source a title.");
  const url = text(input.url, 500);
  if (url && !/^https?:\/\//.test(url) && !url.startsWith("/")) throw new HttpError(400, "The link must be a web address or a page on the Hub.");
  const at = now.toISOString();
  const id =
    typeof input.id === "string" && db.prepare("SELECT 1 FROM pool_sources WHERE id = ?").get(input.id)
      ? input.id
      : `src-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO pool_sources (id, title, url, effective, authority, owner, note, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, url = excluded.url, effective = excluded.effective, authority = excluded.authority, owner = excluded.owner,
       note = excluded.note, updated_at = excluded.updated_at`,
  ).run(id, title, url, day(input.effective), text(input.authority, 120), text(input.owner, 120), text(input.note, 600), user.id, at, at);
  audit(db, { actor: user.id, event: "pool.source_saved", entity: `source:${id}`, next: { title }, at: now });
  return { id, sources: listSources(db) };
}

/**
  A source has been replaced or withdrawn: every approved question resting on it is flagged Needs review, and
  the questions and live placements it touches are returned, so nothing is missed.
*/
export function supersedeSource(db: Db, user: User, input: { id?: unknown; by?: unknown; note?: unknown }, now: Date) {
  requireAuthor(user);
  ensure(db);
  return tx(db, () => {
    const s = db.prepare("SELECT * FROM pool_sources WHERE id = ?").get(String(input.id)) as SourceRow | undefined;
    if (!s) throw new HttpError(404, "That source isn’t in the list.");
    const by = typeof input.by === "string" && input.by !== s.id && db.prepare("SELECT 1 FROM pool_sources WHERE id = ?").get(input.by) ? input.by : null;
    const note = text(input.note, 600) || "Source superseded.";
    db.prepare("UPDATE pool_sources SET status = 'superseded', superseded_by = ?, note = ?, updated_at = ? WHERE id = ?").run(
      by,
      note,
      now.toISOString(),
      s.id,
    );
    const affected = db.prepare("SELECT id, approved_version, live_uses FROM pool_questions WHERE source_id = ?").all(s.id) as {
      id: string;
      approved_version: number | null;
      live_uses: number;
    }[];
    let flagged = 0;
    for (const q of affected) {
      for (const v of db.prepare("SELECT version FROM pool_versions WHERE question_id = ? AND status = 'approved'").all(q.id) as { version: number }[]) {
        db.prepare("UPDATE pool_versions SET status = 'needs_review' WHERE question_id = ? AND version = ?").run(q.id, v.version);
        record(db, {
          question: q.id,
          version: v.version,
          action: "flag",
          from: "approved",
          to: "needs_review",
          actor: user.id,
          note: `Source superseded: “${s.title}”. ${note}`,
          at: now,
        });
        flagged++;
      }
      refresh(db, q.id, now.toISOString());
    }
    audit(db, {
      actor: user.id,
      event: "pool.source_superseded",
      entity: `source:${s.id}`,
      next: { by, questions: affected.length, flagged },
      reason: note,
      at: now,
    });
    return { questions: affected.length, flagged, live: affected.filter((q) => q.live_uses > 0).length, sources: listSources(db) };
  });
}

export function saveView(db: Db, user: User, input: { name?: unknown; query?: unknown; remove?: unknown }, now: Date) {
  requireAuthor(user);
  ensure(db);
  if (input.remove != null) db.prepare("DELETE FROM pool_views WHERE id = ? AND user_id = ?").run(Number(input.remove), user.id);
  else {
    const name = text(input.name, 60);
    if (!name) throw new HttpError(400, "Name the view.");
    db.prepare("INSERT INTO pool_views (user_id, name, query, created_at) VALUES (?, ?, ?, ?)").run(user.id, name, text(input.query, 1000), now.toISOString());
  }
  return { saved: db.prepare("SELECT id, name, query FROM pool_views WHERE user_id = ? ORDER BY name").all(user.id) };
}

// ---------------------------------------------------------------------------------------------
// Coverage: native content by surface, and imported SCORM packages
// ---------------------------------------------------------------------------------------------

export function externalCourses(db: Db) {
  ensure(db);
  return (
    db
      .prepare(
        `SELECT c.id, c.title, c.status, v.standard, v.version, v.uploaded_at, up.name AS uploaded_by, json_extract(v.report, '$.fileName') AS file,
                e.coverage, e.has_assessment, e.owner, e.question_count, e.review_date, e.note,
                (SELECT COUNT(*) FROM scorm_attempts a WHERE a.course_id = c.id AND a.preview = 0) AS attempts
         FROM scorm_courses c JOIN scorm_package_versions v ON v.id = c.version_id LEFT JOIN users up ON up.id = v.uploaded_by
         LEFT JOIN pool_external e ON e.course_id = c.id ORDER BY (c.status = 'archived'), c.title COLLATE NOCASE`,
      )
      .all() as Record<string, string | number | null>[]
  ).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    status: String(r.status),
    standard: r.standard === "scorm2004" ? "SCORM 2004" : "SCORM 1.2",
    version: Number(r.version),
    file: (r.file as string | null) ?? "",
    uploadedAt: String(r.uploaded_at),
    uploadedBy: (r.uploaded_by as string | null) ?? "",
    coverage: ((r.coverage as string | null) ?? "unavailable") as "unavailable" | "supplied" | "reconciled",
    hasAssessment: ((r.has_assessment as string | null) ?? "unknown") as "unknown" | "yes" | "no",
    owner: (r.owner as string | null) ?? "",
    questionCount: r.question_count as number | null,
    reviewDate: r.review_date as string | null,
    note: (r.note as string | null) ?? "",
    attempts: Number(r.attempts),
  }));
}

export function saveExternal(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(user);
  ensure(db);
  const id = String(input.courseId);
  if (!db.prepare("SELECT 1 FROM scorm_courses WHERE id = ?").get(id)) throw new HttpError(404, "That eLearning course isn’t there.");
  const coverage = input.coverage === "supplied" || input.coverage === "reconciled" ? input.coverage : "unavailable";
  const count = input.questionCount === "" || input.questionCount == null ? null : Math.max(0, Math.round(Number(input.questionCount)));
  // A question count is only kept when the list has been supplied or reconciled: never a guess.
  db.prepare(
    `INSERT INTO pool_external (course_id, coverage, has_assessment, owner, question_count, review_date, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (course_id) DO UPDATE SET coverage = excluded.coverage, has_assessment = excluded.has_assessment, owner = excluded.owner,
       question_count = excluded.question_count, review_date = excluded.review_date, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(
    id,
    coverage,
    input.hasAssessment === "yes" || input.hasAssessment === "no" ? input.hasAssessment : "unknown",
    text(input.owner, 120),
    coverage === "unavailable" || Number.isNaN(count) ? null : count,
    day(input.reviewDate),
    text(input.note, 600),
    user.id,
    now.toISOString(),
  );
  audit(db, { actor: user.id, event: "pool.external_saved", entity: `scorm_course:${id}`, next: { coverage }, at: now });
  return { external: externalCourses(db) };
}

/** Whether publishing a Topic or course waits for the pool's approval (a Hub administrator's setting). Off: it only reports. */
export const enforcing = (db: Db) => setting(db, "pool_enforce") === "1";

export function coverage(db: Db, user: User, now: Date) {
  requireAuthor(user);
  syncIfStale(db, now);
  const bySurface = db
    .prepare(
      `SELECT p.surface, COUNT(DISTINCT p.question_id) AS questions, COUNT(*) AS placements,
              SUM(CASE WHEN v.status = 'approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN v.status = 'approved' AND v.migrated = 1 THEN 1 ELSE 0 END) AS unreviewed
       FROM pool_placements p JOIN pool_versions v ON v.question_id = p.question_id AND v.version = p.version
       WHERE p.current = 1 AND p.live = 1 GROUP BY p.surface`,
    )
    .all() as { surface: Surface; questions: number; placements: number; approved: number; unreviewed: number }[];
  const last = db.prepare("SELECT at, report FROM pool_reconciliations ORDER BY id DESC LIMIT 5").all() as { at: string; report: string }[];
  return {
    bySurface,
    exceptions: db.prepare("SELECT id, title, topic, status FROM pool_questions WHERE live_unapproved = 1 ORDER BY id LIMIT 200").all() as {
      id: string;
      title: string;
      topic: string;
      status: string;
    }[],
    // Decisions scored outside the Hub's question components: listed, not yet in the pool.
    notCovered: [
      { name: "The Coordinator’s Day", where: "Play", why: "Its scenarios are written in the app’s code and progress stays on the learner’s device." },
      { name: "Neighbourhood Explorer", where: "Play", why: "Its quest choices are written in the app’s code and progress stays on the learner’s device." },
      {
        name: "Sorting, sequencing, matching and fill-the-gap blocks",
        where: "Magazine",
        why: "Practice activities without a single best answer; they aren’t scored.",
      },
    ],
    cutover: setting(db, "pool_cutover"),
    reconciliations: last.map((r) => JSON.parse(r.report) as Reconciliation),
    external: externalCourses(db),
    enforce: enforcing(db),
    canEnforce: isSuperadmin(user),
  };
}

export function setEnforce(db: Db, user: User, on: boolean, now: Date) {
  if (!isSuperadmin(user)) throw new HttpError(403, "Only a Hub administrator can change this.");
  ensure(db);
  setSetting(db, "pool_enforce", on ? "1" : "0");
  audit(db, { actor: user.id, event: "pool.enforce", entity: "question_pool", next: { on }, at: now });
  return { enforce: on };
}

// ---------------------------------------------------------------------------------------------
// Where the pool acts on the rest of the Hub
// ---------------------------------------------------------------------------------------------

/**
  Self-review questions the pool has flagged or retired: they stop being served at once, whatever the course
  editor says. Returns the blocked items' ids.
*/
export function practiceBlocked(db: Db, guideId: string, items: PracticeItem[]): Set<string> {
  ensure(db);
  const out = new Set<string>();
  for (const it of items) {
    const f = practiceFound(guideId, it);
    const r = db
      .prepare("SELECT v.status FROM pool_questions q JOIN pool_versions v ON v.question_id = q.id WHERE q.origin_key = ? AND v.hash = ?")
      .get(f.key, contentHash(f.kind, f.content)) as { status: VersionStatus } | undefined;
    if (r && (r.status === "needs_review" || r.status === "retired")) out.add(it.id);
  }
  return out;
}

/**
  Before a Topic or course is published: each question in it that isn't an approved version in the pool, with
  what to do. Used as a blocker only when "require approval" is on.
*/
export function publishPreflight(db: Db, found: Found[]) {
  ensure(db);
  const out: { id: string | null; title: string; problem: string }[] = [];
  for (const f of found) {
    // Self-review has its own approval in the course, checked when it's served.
    if (f.surface === "magazine-practice") continue;
    const q = db.prepare("SELECT id FROM pool_questions WHERE origin_key = ?").get(f.key) as { id: string } | undefined;
    const v = q
      ? (db.prepare("SELECT status FROM pool_versions WHERE question_id = ? AND hash = ?").get(q.id, contentHash(f.kind, f.content)) as
          { status: VersionStatus } | undefined)
      : undefined;
    if (v?.status === "approved") continue;
    const title = shortTitle(f.content.stem);
    out.push({
      id: q?.id ?? null,
      title,
      problem: !v
        ? `“${title}” is new or changed and isn’t in the Question Pool yet: open Questions, then approve it.`
        : v.status === "needs_review"
          ? `${q!.id} “${title}” is flagged Needs review in the Question Pool.`
          : v.status === "retired"
            ? `${q!.id} “${title}” has been retired in the Question Pool: replace it.`
            : `${q!.id} “${title}” has changes that aren’t approved in the Question Pool yet.`,
    });
  }
  return out;
}

/**
  Called as a Topic or course is published. With "require approval" on, publishing waits until every
  question in it is an approved version in the pool, and says which aren't. With it off, nothing is held up:
  the same questions show in the pool's review queue instead.
*/
export function publishGate(db: Db, found: Found[], now: Date) {
  if (!enforcing(db)) return;
  syncPool(db, null, now);
  const issues = publishPreflight(db, found);
  if (issues.length)
    throw Object.assign(
      new HttpError(
        409,
        `${issues.length === 1 ? "1 question isn’t" : `${issues.length} questions aren’t`} approved in the Question Pool. Approve ${issues.length === 1 ? "it" : "them"} under Admin, Questions, then publish.`,
      ),
      { problems: issues.map((i) => i.problem) },
    );
}

/** After a publish: the pool records the release each question went out in. Never stops the publish. */
export function afterPublish(db: Db, actor: User, now: Date) {
  try {
    syncPool(db, actor, now);
  } catch (e) {
    console.error("Question Pool reconciliation failed after a publish", e);
  }
}
