import "server-only";
import { lessons } from "@/content/lessons";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, requireReporter, userById, type User } from "./auth";
import { activityInfo, enrol, parseVersion, type PathVersionRow, type PinnedStep } from "./learning";

/*
  Manager sign-off for spaced learning. When someone finishes the last follow up of a lesson with
  sign-off switched on, their manager confirms they're applying it at work, or flags that they need
  support. Learners see the outcome on the lesson's tile.
*/

type EnrolmentRow = { id: number; user_id: string; org_id: string; path_id: string; path_version: number; state: string };
type SignoffRow = { enrolment_id: number; user_id: string; lesson_slug: string; outcome: "confirmed" | "support"; note: string; decided_by: string; decided_at: string };

/** The master lesson a spaced path belongs to, if sign-off is switched on for it. */
function lessonForPath(db: Db, pathId: string) {
  const row = db.prepare("SELECT slug, signoff FROM lesson_settings WHERE path_id = ?").get(pathId) as { slug: string; signoff: number } | undefined;
  return row ? { slug: row.slug, signoff: Boolean(row.signoff) } : null;
}

function masterInfo(slug: string) {
  const l = lessons.find((x) => x.slug === slug);
  const summary = l && Object.values(l.nodes).find((n) => n.type === "summary");
  return { slug, title: l?.title ?? slug, outcome: l?.outcome ?? "", action: summary && summary.type === "summary" ? summary.action : "" };
}

/** Authors can sign off anyone; organisation admins their own people and anyone they manage. */
function canSignOff(actor: User, learner: User) {
  return canAuthor(actor) || learner.manager_id === actor.id || (actor.role === "org_admin" && learner.org_id === actor.org_id);
}

/** What the learner did in each follow up: first-try result, and whether they got the extra-practice version. */
function followUpResults(db: Db, e: EnrolmentRow) {
  const pv = db.prepare("SELECT * FROM path_versions WHERE path_id = ? AND version = ?").get(e.path_id, e.path_version) as PathVersionRow | undefined;
  const steps: PinnedStep[] = pv ? parseVersion(pv).steps : [];
  const rows = db
    .prepare(
      `SELECT si.step_index, si.follow_up_id, si.completed_at, a.initial_correct FROM step_instances si LEFT JOIN attempts a ON a.step_instance_id = si.id
       WHERE si.enrolment_id = ? AND si.cancelled_at IS NULL ORDER BY si.step_index`,
    )
    .all(e.id) as { step_index: number; follow_up_id: string; completed_at: string | null; initial_correct: number | null }[];
  return rows.map((r) => {
    const step = steps[r.step_index];
    return {
      stage: step?.stage ?? `Follow up ${r.step_index + 1}`,
      title: activityInfo(db, r.follow_up_id)?.title ?? r.follow_up_id,
      completedAt: r.completed_at,
      firstTry: r.initial_correct === null ? null : r.initial_correct === 1,
      extraPractice: Boolean(step?.adaptive && r.follow_up_id === step.adaptive?.ifStruggled),
    };
  });
}

function describe(db: Db, e: EnrolmentRow) {
  const learner = userById(db, e.user_id)!;
  const lesson = lessonForPath(db, e.path_id)!;
  const results = followUpResults(db, e);
  const org = (db.prepare("SELECT name FROM orgs WHERE id = ?").get(e.org_id) as { name: string } | undefined)?.name ?? e.org_id;
  return {
    enrolmentId: e.id,
    learner: { id: learner.id, name: learner.name, role: learner.service_role ?? learner.audience, org },
    manager: learner.manager_id ? (userById(db, learner.manager_id)?.name ?? null) : null,
    lesson: masterInfo(lesson.slug),
    finishedAt: results.map((r) => r.completedAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
    results,
  };
}

/** Finished sequences waiting for sign-off, and recent decisions, for the people this actor can sign off. */
export function signoffQueue(db: Db, actor: User) {
  requireReporter(actor);
  ensureDemo(db);
  const completed = db.prepare("SELECT * FROM enrolments WHERE state = 'completed' ORDER BY id DESC").all() as EnrolmentRow[];
  const decided = new Map((db.prepare("SELECT * FROM signoffs").all() as SignoffRow[]).map((s) => [s.enrolment_id, s]));
  const waiting = [];
  const history = [];
  for (const e of completed) {
    const lesson = lessonForPath(db, e.path_id);
    const learner = userById(db, e.user_id);
    if (!lesson || !learner || !canSignOff(actor, learner)) continue;
    const d = decided.get(e.id);
    if (d) history.push({ ...describe(db, e), outcome: d.outcome, note: d.note, decidedBy: userById(db, d.decided_by)?.name ?? d.decided_by, decidedAt: d.decided_at });
    else if (lesson.signoff) waiting.push(describe(db, e));
  }
  return { waiting, history: history.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)) };
}

export function decideSignoff(db: Db, actor: User, enrolmentId: number, outcome: "confirmed" | "support", note: string, now: Date) {
  requireReporter(actor);
  if (!["confirmed", "support"].includes(outcome)) throw new HttpError(400, "Choose confirmed or needs support.");
  const e = db.prepare("SELECT * FROM enrolments WHERE id = ?").get(enrolmentId) as EnrolmentRow | undefined;
  const learner = e && userById(db, e.user_id);
  if (!e || !learner) throw new HttpError(404, "Not found.");
  if (!canSignOff(actor, learner)) throw new HttpError(403, "You can only sign off people you manage.");
  if (e.state !== "completed") throw new HttpError(409, `${learner.name} hasn’t finished the follow ups yet.`);
  const lesson = lessonForPath(db, e.path_id);
  if (!lesson) throw new HttpError(409, "This isn’t a spaced lesson.");
  const text = (note ?? "").trim().slice(0, 1000);
  if (outcome === "support" && !text) throw new HttpError(400, "Say what support would help, so it can be followed up.");
  const at = now.toISOString();
  tx(db, () => {
    const res = db.prepare("INSERT OR IGNORE INTO signoffs VALUES (?, ?, ?, ?, ?, ?, ?)").run(enrolmentId, learner.id, lesson.slug, outcome, text, actor.id, at);
    if (!res.changes) throw new HttpError(409, "This has already been signed off.");
    audit(db, { actor: actor.id, event: `signoff.${outcome}`, entity: `enrolment:${enrolmentId}`, next: { learner: learner.id, lesson: lesson.slug, note: text }, at: now });
  });
  return { ok: true };
}

/** The learner's own sign-off status for each spaced lesson that has sign-off switched on. */
export function mySignoffs(db: Db, user: User) {
  ensureDemo(db);
  const rows = db.prepare("SELECT * FROM enrolments WHERE user_id = ? ORDER BY id").all(user.id) as EnrolmentRow[];
  const out: Record<string, { status: "after_follow_ups" | "waiting" | "confirmed" | "support"; manager: string | null; by?: string; at?: string; note?: string }> = {};
  const manager = user.manager_id ? (userById(db, user.manager_id)?.name ?? null) : null;
  for (const e of rows) {
    const lesson = lessonForPath(db, e.path_id);
    if (!lesson || e.state === "withdrawn") continue;
    const d = db.prepare("SELECT * FROM signoffs WHERE enrolment_id = ?").get(e.id) as SignoffRow | undefined;
    if (d) out[lesson.slug] = { status: d.outcome, manager, by: userById(db, d.decided_by)?.name ?? d.decided_by, at: d.decided_at, note: d.note };
    else if (lesson.signoff) out[lesson.slug] = { status: e.state === "completed" ? "waiting" : "after_follow_ups", manager };
  }
  return out;
}

/*
  Demo data: two people who finished their follow ups about three months ago, so the queue has
  someone in it. Only for the running prototype, never in tests, and never for someone already
  part way through the same sequence.
*/
function ensureDemo(db: Db) {
  if (process.env.VITEST) return;
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'signoff_demo'").get()) return;
  const now = new Date();
  const demos: { user: string; lesson: string; firstTries: boolean[] }[] = [
    { user: "ash", lesson: "a-little-extra-time", firstTries: [true, false, true] },
    { user: "riley", lesson: "legislative-framework", firstTries: [true, true, true] },
  ];
  tx(db, () => {
    for (const d of demos) {
      const pathId = (db.prepare("SELECT path_id FROM lesson_settings WHERE slug = ?").get(d.lesson) as { path_id: string | null } | undefined)?.path_id;
      const user = userById(db, d.user);
      if (!pathId || !user) continue;
      if (db.prepare("SELECT 1 FROM enrolments WHERE user_id = ? AND path_id = ?").get(user.id, pathId)) continue;
      const pv = db.prepare("SELECT version, steps FROM path_versions WHERE path_id = ? AND status = 'published'").get(pathId) as { version: number; steps: string } | undefined;
      if (!pv) continue;
      const steps = JSON.parse(pv.steps) as PinnedStep[];
      const anchor = new Date(now.getTime() - 110 * 86400000);
      const { enrolment } = enrol(db, user, pathId, pv.version, "demo-signoff", anchor, anchor);
      const instances = db.prepare("SELECT id, step_index, planned_release FROM step_instances WHERE enrolment_id = ? ORDER BY step_index").all(enrolment.id) as {
        id: number;
        step_index: number;
        planned_release: string;
      }[];
      let struggled = false;
      for (const inst of instances) {
        const step = steps[inst.step_index];
        const done = new Date(new Date(inst.planned_release).getTime() + 2 * 3600000).toISOString();
        const correct = d.firstTries[inst.step_index] ?? true;
        if (step?.adaptive && struggled) db.prepare("UPDATE step_instances SET follow_up_id = ? WHERE id = ?").run(step.adaptive.ifStruggled, inst.id);
        db.prepare("UPDATE step_instances SET released_at = planned_release, notified_at = planned_release, started_at = ?, feedback_viewed_at = ?, completed_at = ? WHERE id = ?").run(done, done, done, inst.id);
        db.prepare(
          "INSERT INTO attempts (step_instance_id, question_id, follow_up_version, concept, initial_response, initial_correct, initial_at, feedback_shown_at) VALUES (?, 'lesson', 0, 'demo', '[]', ?, ?, ?)",
        ).run(inst.id, correct ? 1 : 0, done, done);
        if (!correct) struggled = true;
      }
      db.prepare("UPDATE enrolments SET state = 'completed' WHERE id = ?").run(enrolment.id);
      db.prepare("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES (?, ?, 'demo', ?)").run(user.id, d.lesson, anchor.toISOString());
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('signoff_demo', '1')").run();
  });
}
