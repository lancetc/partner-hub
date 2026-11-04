import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import {
  cleanRegisterSettings,
  expiryFor,
  REGISTER_DEFAULTS,
  STATUS_LABELS,
  validMonths,
  type AssessmentMethod,
  type RegisterSettings,
  type RegisterStatus,
  type TestOut,
} from "@/lib/complianceRegister";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, requireReporter, type User } from "./auth";
import { assessmentOf, csvCell, facts, isFor, people, quizScore, stateOf } from "./completionReports";

/*
  The compliance register. Each mandatory topic on it carries the organisation's rules: how often
  it's redone, how people are assessed, whether they can test out, who owns the competency, what
  counts as evidence, when training expires and which policy version the content was approved
  against. For each person it shows whether they're trained, what they demonstrated, when they
  completed it and when it needs refreshing.
*/

type EntryRow = { lesson_slug: string; settings: string; created_by: string; created_at: string; updated_by: string; updated_at: string };
type TestOutRow = {
  id: number;
  user_id: string;
  lesson_slug: string;
  path_id: string;
  attempt_id: number;
  score: number;
  total: number;
  lesson_version: string;
  status: "pending" | "approved" | "declined";
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  note: string;
};

const catalogue = () => lessons.filter((l) => l.track !== "reinforcement");
const findLesson = (slug: string) => {
  const l = catalogue().find((x) => x.slug === slug);
  if (!l) throw new HttpError(404, "Topic not found.");
  return l;
};
const DAY = 24 * 60 * 60 * 1000;

function entryRow(db: Db, slug: string) {
  return db.prepare("SELECT * FROM compliance_register WHERE lesson_slug = ?").get(slug) as EntryRow | undefined;
}
const settingsOf = (r: EntryRow): RegisterSettings => cleanRegisterSettings(JSON.parse(r.settings));

/** The register's test-out rule for a topic. Topics not on the register can be tested out of. */
export function testOutRule(db: Db, slug: string): TestOut {
  const r = entryRow(db, slug);
  return r ? settingsOf(r).testOut : "allowed";
}

/** How a topic assesses people, read from its cards (and its sign-off setting). */
export function detectedMethods(db: Db, l: Lesson): AssessmentMethod[] {
  const types = new Set(Object.values(l.nodes).map((c) => c.type));
  const cards = Object.values(l.nodes);
  const found: AssessmentMethod[] = [];
  if (cards.some((c) => c.type === "quiz" && !c.assessment)) found.push("quiz");
  if (cards.some((c) => c.type === "decision" && c.options.some((o) => o.correct !== undefined))) found.push("scenarios");
  if (types.has("written")) found.push("written");
  if (cards.some((c) => c.type === "quiz" && c.assessment)) found.push("assessment");
  const signoff = db.prepare("SELECT signoff FROM lesson_settings WHERE slug = ?").get(l.slug) as { signoff: number } | undefined;
  if (signoff?.signoff) found.push("signoff");
  return found;
}

/** Everything about one topic's people, read once. */
function context(db: Db, slug: string) {
  const completions = new Map<string, { version: string; at: string; via: string | null; evidence: Record<string, unknown> | null }>();
  for (const r of db
    .prepare("SELECT user_id, lesson_version, completed_at, via, evidence FROM lesson_completions WHERE lesson_slug = ? ORDER BY completed_at")
    .all(slug) as { user_id: string; lesson_version: string; completed_at: string; via: string | null; evidence: string | null }[])
    completions.set(r.user_id, { version: r.lesson_version, at: r.completed_at, via: r.via, evidence: r.evidence ? JSON.parse(r.evidence) : null });
  const signoffs = new Map<string, { outcome: string; at: string; by: string; note: string }>();
  for (const r of db
    .prepare(
      "SELECT s.user_id, s.outcome, s.decided_at, s.note, u.name AS by FROM signoffs s JOIN users u ON u.id = s.decided_by WHERE s.lesson_slug = ? ORDER BY s.decided_at",
    )
    .all(slug) as { user_id: string; outcome: string; decided_at: string; note: string; by: string }[])
    signoffs.set(r.user_id, { outcome: r.outcome, at: r.decided_at, by: r.by, note: r.note });
  const testouts = db.prepare("SELECT * FROM compliance_testouts WHERE lesson_slug = ? ORDER BY id").all(slug) as TestOutRow[];
  const names = new Map((db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const pathNames = new Map((db.prepare("SELECT id, name FROM learning_paths").all() as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return { f: facts(db), completions, signoffs, testouts, names, pathNames, db };
}
type Ctx = ReturnType<typeof context>;

/** One person on one register topic: status, what they demonstrated, when, and when it runs out. */
function personRow(ctx: Ctx, l: Lesson, s: RegisterSettings, person: { id: string; name: string; email: string; org: string; audience: string }, now: Date) {
  const st = stateOf(ctx.f, l, person.id);
  const done = ctx.completions.get(person.id);
  const pending = ctx.testouts.find((t) => t.user_id === person.id && t.status === "pending");
  // Results kept with the completion; older completions only have whatever is still in their saved progress.
  const answers = done?.evidence ?? ctx.f.progress.get(`${person.id}|${l.slug}`)?.attempt.answers;
  const score = done?.evidence ? quizScore(l, done.evidence) : st.score;
  const assessment = done?.evidence ? assessmentOf(l, done.evidence) : st.assessment;
  const demonstrated: string[] = [];

  // How it was completed.
  if (done?.via?.startsWith("path-quiz:")) {
    const pathId = done.via.slice("path-quiz:".length);
    const a = ctx.db
      .prepare("SELECT score, total FROM path_quiz_attempts WHERE path_id = ? AND user_id = ? AND passed = 1 ORDER BY id DESC LIMIT 1")
      .get(pathId, person.id) as { score: number; total: number } | undefined;
    demonstrated.push(
      `Tested out: passed the “${ctx.pathNames.get(pathId) ?? "learning path"}” upfront quiz${a ? `, ${a.score}/${a.total} (${Math.round((a.score / a.total) * 100)}%)` : ""}`,
    );
  } else if (done?.via?.startsWith("testout:")) {
    const t = ctx.testouts.find((x) => `testout:${x.id}` === done.via);
    if (t)
      demonstrated.push(
        `Tested out: ${t.score}/${t.total} (${Math.round((t.score / t.total) * 100)}%) on the “${ctx.pathNames.get(t.path_id) ?? "learning path"}” upfront quiz, approved by ${ctx.names.get(t.decided_by ?? "") ?? "the competency owner"}`,
      );
  } else if (done) demonstrated.push("Worked through the topic");

  if (score) demonstrated.push(`Quick check: ${score.right} of ${score.asked} right first time`);
  // Scenario choices scored on the first try.
  const decisions = Object.values(l.nodes).filter((c) => c.type === "decision" && c.options.some((o) => o.correct !== undefined));
  const chosen = decisions.map((c) => answers?.[`first:${c.id}`]).filter((v) => v !== undefined);
  if (chosen.length) demonstrated.push(`Scenarios: ${chosen.filter((v) => v === 1).length} of ${chosen.length} best choices first time`);
  if (assessment)
    demonstrated.push(
      `Assessment: ${assessment.passedAt ? `passed with ${assessment.latestScore}%` : `${assessment.latestScore}%, not yet passed`} (${assessment.attempts} ${assessment.attempts === 1 ? "attempt" : "attempts"}; pass mark ${assessment.passMark}%)`,
    );
  const sign = ctx.signoffs.get(person.id);
  if (sign) demonstrated.push(`Manager sign-off: ${sign.outcome === "confirmed" ? "confirmed" : "more support needed"} by ${sign.by}`);
  if (pending)
    demonstrated.push(`Upfront quiz: ${pending.score}/${pending.total} (${Math.round((pending.score / pending.total) * 100)}%), waiting for approval`);

  // Evidence the register asks for.
  const assessed = Boolean(score || assessment?.passedAt || done?.via);
  const signedOff = Boolean(sign && sign.outcome === "confirmed" && done && sign.at >= done.at);
  const missing: string[] = [];
  if (done && (s.evidence === "assessment" || s.evidence === "assessment_signoff") && !assessed) missing.push("an assessment record");
  if (done && (s.evidence === "signoff" || s.evidence === "assessment_signoff") && !signedOff) missing.push("a manager sign-off");

  const expiresAt = done ? expiryFor(done.at, validMonths(s)) : null;
  const today = now.toISOString().slice(0, 10);
  const daysLeft = expiresAt ? Math.round((Date.parse(expiresAt) - Date.parse(today)) / DAY) : null;
  const status: RegisterStatus = !done
    ? pending
      ? "approval"
      : st.state === "in_progress"
        ? "in_progress"
        : "not_trained"
    : daysLeft !== null && daysLeft <= 0
      ? "expired"
      : st.needsRefresher
        ? "refresher"
        : missing.length
          ? "evidence"
          : daysLeft !== null && daysLeft <= s.dueSoonDays
            ? "due_soon"
            : "current";
  return {
    userId: person.id,
    name: person.name,
    email: person.email,
    org: person.org,
    status,
    statusLabel: STATUS_LABELS[status],
    completedAt: done?.at ?? null,
    version: done?.version ?? null,
    expiresAt,
    daysLeft,
    demonstrated,
    missing,
    pendingTestOut: pending ? { id: pending.id, score: pending.score, total: pending.total, at: pending.requested_at } : null,
  };
}

/** The people a register topic applies to, in the viewer's scope: those it's for, and anyone who has done it. */
function rowsFor(db: Db, viewer: User, l: Lesson, s: RegisterSettings, now: Date, ctx = context(db, l.slug)) {
  return rowsOf(people(db, viewer), l, s, now, ctx);
}

type Person = { id: string; name: string; email: string; org: string; audience: string };
function rowsOf(persons: Person[], l: Lesson, s: RegisterSettings, now: Date, ctx: Ctx) {
  return persons
    .map((p) => ({ p, row: personRow(ctx, l, s, p, now) }))
    .filter(({ p, row }) => isFor(l, p.audience) || row.status !== "not_trained")
    .map(({ row }) => row);
}

const countBy = (rows: { status: RegisterStatus }[]) => {
  const c = Object.fromEntries(Object.keys(STATUS_LABELS).map((k) => [k, 0])) as Record<RegisterStatus, number>;
  for (const r of rows) c[r.status]++;
  return c;
};

/** The register: each topic on it with its rules and how many people are where; plus test-outs waiting for approval. */
export function listRegister(db: Db, viewer: User, now: Date) {
  requireReporter(viewer);
  const entries = db.prepare("SELECT * FROM compliance_register ORDER BY created_at").all() as EntryRow[];
  const topics = entries.flatMap((e) => {
    const l = catalogue().find((x) => x.slug === e.lesson_slug);
    if (!l) return [];
    const s = settingsOf(e);
    const rows = rowsFor(db, viewer, l, s, now);
    return [
      {
        slug: l.slug,
        title: l.title,
        version: l.version,
        settings: s,
        people: rows.length,
        counts: countBy(rows),
        policyChanged: Boolean(s.approvedVersion && s.approvedVersion !== l.version),
        updatedAt: e.updated_at,
      },
    ];
  });
  const on = new Set(entries.map((e) => e.lesson_slug));
  return {
    topics,
    approvals: pendingApprovals(db, viewer),
    canEdit: canAuthor(viewer),
    // Topics that can be added: published, not on the register yet.
    available: canAuthor(viewer)
      ? catalogue()
          .filter((l) => !on.has(l.slug))
          .map((l) => ({ slug: l.slug, title: l.title }))
      : [],
  };
}

/** Test-outs waiting for the competency owner, in the viewer's scope. */
export function pendingApprovals(db: Db, viewer: User) {
  requireReporter(viewer);
  const inScope = new Set(people(db, viewer).map((p) => p.id));
  return (
    db
      .prepare(
        `SELECT t.*, u.name, o.name AS org, p.name AS path FROM compliance_testouts t JOIN users u ON u.id = t.user_id JOIN orgs o ON o.id = u.org_id
         LEFT JOIN learning_paths p ON p.id = t.path_id WHERE t.status = 'pending' ORDER BY t.requested_at`,
      )
      .all() as (TestOutRow & { name: string; org: string; path: string | null })[]
  )
    .filter((t) => inScope.has(t.user_id))
    .map((t) => ({
      id: t.id,
      userId: t.user_id,
      name: t.name,
      org: t.org,
      slug: t.lesson_slug,
      topic: catalogue().find((l) => l.slug === t.lesson_slug)?.title ?? t.lesson_slug,
      path: t.path ?? "A learning path",
      score: t.score,
      total: t.total,
      percent: Math.round((t.score / t.total) * 100),
      at: t.requested_at,
    }));
}

/** One register topic: its rules, what its cards can assess, and every person's record. */
export function registerTopic(db: Db, viewer: User, slug: string, now: Date) {
  requireReporter(viewer);
  const l = findLesson(slug);
  const e = entryRow(db, slug);
  if (!e) throw new HttpError(404, "That topic isn’t on the compliance register.");
  const s = settingsOf(e);
  const rows = rowsFor(db, viewer, l, s, now);
  return {
    slug,
    title: l.title,
    version: l.version,
    owner: l.owner ?? "",
    reviewDate: l.reviewDate ?? null,
    settings: s,
    detected: detectedMethods(db, l),
    validMonths: validMonths(s),
    policyChanged: Boolean(s.approvedVersion && s.approvedVersion !== l.version),
    counts: countBy(rows),
    people: rows,
    updatedAt: e.updated_at,
    updatedBy: (db.prepare("SELECT name FROM users WHERE id = ?").get(e.updated_by) as { name: string } | undefined)?.name ?? e.updated_by,
    canEdit: canAuthor(viewer),
  };
}

/** Puts a topic on the register, with the usual settings and the assessment methods its cards use. */
export function addToRegister(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const l = findLesson(slug);
  if (entryRow(db, slug)) throw new HttpError(409, "That topic is already on the register.");
  const s: RegisterSettings = { ...REGISTER_DEFAULTS, assessment: detectedMethods(db, l) };
  const at = now.toISOString();
  db.prepare("INSERT INTO compliance_register (lesson_slug, settings, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    slug,
    JSON.stringify(s),
    actor.id,
    at,
    actor.id,
    at,
  );
  audit(db, { actor: actor.id, event: "compliance.added", entity: `lesson:${slug}`, next: s, at: now });
  return { slug };
}

export function saveRegisterEntry(db: Db, actor: User, slug: string, input: unknown, now: Date) {
  requireAuthor(actor);
  findLesson(slug);
  const e = entryRow(db, slug);
  if (!e) throw new HttpError(404, "That topic isn’t on the compliance register.");
  const s = cleanRegisterSettings(input);
  if (!s.owner) throw new HttpError(400, "Say who owns the competency, for example: Compliance team.");
  if (s.expiry === "months" && !s.expiryMonths) throw new HttpError(400, "Say how many months the training lasts.");
  db.prepare("UPDATE compliance_register SET settings = ?, updated_by = ?, updated_at = ? WHERE lesson_slug = ?").run(
    JSON.stringify(s),
    actor.id,
    now.toISOString(),
    slug,
  );
  audit(db, { actor: actor.id, event: "compliance.updated", entity: `lesson:${slug}`, previous: settingsOf(e), next: s, at: now });
  return { slug };
}

/** Takes a topic off the register. Completions and test-out decisions stay on record. */
export function removeFromRegister(db: Db, actor: User, slug: string, now: Date) {
  requireAuthor(actor);
  const e = entryRow(db, slug);
  if (!e) throw new HttpError(404, "That topic isn’t on the compliance register.");
  db.prepare("DELETE FROM compliance_register WHERE lesson_slug = ?").run(slug);
  audit(db, { actor: actor.id, event: "compliance.removed", entity: `lesson:${slug}`, previous: settingsOf(e), at: now });
}

/**
  Records a pass of a path's upfront quiz on a register topic that needs approval. The topic isn't
  complete until the competency owner approves it.
*/
export function requestTestOut(db: Db, user: User, slug: string, pathId: string, attempt: { id: number; score: number; total: number }, now: Date) {
  const l = findLesson(slug);
  db.prepare(
    `INSERT OR IGNORE INTO compliance_testouts (user_id, lesson_slug, path_id, attempt_id, score, total, lesson_version, requested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(user.id, slug, pathId, attempt.id, attempt.score, attempt.total, l.version, now.toISOString());
}

/** The competency owner approves (the topic counts as complete) or declines (they work through it) a test-out. */
export function decideTestOut(db: Db, actor: User, id: number, approve: boolean, note: string, now: Date) {
  requireAuthor(actor);
  const t = db.prepare("SELECT * FROM compliance_testouts WHERE id = ?").get(id) as TestOutRow | undefined;
  if (!t) throw new HttpError(404, "That request isn’t here any more.");
  if (t.status !== "pending") throw new HttpError(409, `That request was already ${t.status}.`);
  const clean = String(note ?? "")
    .trim()
    .slice(0, 500);
  tx(db, () => {
    db.prepare("UPDATE compliance_testouts SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?").run(
      approve ? "approved" : "declined",
      actor.id,
      now.toISOString(),
      clean,
      id,
    );
    // Trained as of when they demonstrated it, against the version they were tested on.
    if (approve)
      db.prepare("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at, via) VALUES (?, ?, ?, ?, ?)").run(
        t.user_id,
        t.lesson_slug,
        t.lesson_version,
        t.requested_at,
        `testout:${id}`,
      );
    audit(db, {
      actor: actor.id,
      event: approve ? "compliance.testout_approved" : "compliance.testout_declined",
      entity: `lesson:${t.lesson_slug}`,
      next: { userId: t.user_id, score: t.score, total: t.total },
      reason: clean || undefined,
      at: now,
    });
  });
  return { ok: true };
}

/** The register as CSV for audits: one row per person and register topic. Optionally one topic. */
export function registerCsv(db: Db, viewer: User, now: Date, slug?: string) {
  requireReporter(viewer);
  const entries = (db.prepare("SELECT * FROM compliance_register ORDER BY created_at").all() as EntryRow[]).filter((e) => !slug || e.lesson_slug === slug);
  const lines = [
    [
      "Topic",
      "Classification",
      "Competency owner",
      "Policy",
      "Name",
      "Email",
      "Organisation",
      "Status",
      "What they demonstrated",
      "Evidence missing",
      "Completed",
      "Version completed",
      "Refresh by",
    ],
  ];
  for (const e of entries) {
    const l = catalogue().find((x) => x.slug === e.lesson_slug);
    if (!l) continue;
    const s = settingsOf(e);
    for (const r of rowsFor(db, viewer, l, s, now))
      lines.push([
        l.title,
        s.classification,
        s.owner,
        [s.policyName, s.policyVersion].filter(Boolean).join(" "),
        r.name,
        r.email,
        r.org,
        r.statusLabel,
        r.demonstrated.join("; "),
        r.missing.join("; "),
        r.completedAt?.slice(0, 10) ?? "",
        r.version ?? "",
        r.expiresAt ?? "",
      ]);
  }
  return lines.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* Refreshing, and reminders. */

/** Everyone the register applies to, whatever organisation: learners, as on the register screens. */
const learners = (db: Db) =>
  db
    .prepare("SELECT u.id, u.name, u.email, u.audience, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id WHERE u.role = 'learner' ORDER BY u.name")
    .all() as Person[];

/**
  When someone's training in a register topic is due soon or has expired: when it runs out. Doing
  the topic again then counts as a refresh. Null otherwise (not on the register, not done, or current).
*/
export function refreshDue(db: Db, user: { id: string; name: string; email: string; audience: string }, slug: string, now: Date) {
  const e = entryRow(db, slug);
  const l = catalogue().find((x) => x.slug === slug);
  if (!e || !l) return null;
  const s = settingsOf(e);
  const row = personRow(context(db, slug), l, s, { ...user, org: "" }, now);
  const stage = refreshStage(row, s);
  if (stage) return { status: stage === "expired" ? ("expired" as const) : ("due_soon" as const), expiresAt: row.expiresAt, daysLeft: row.daysLeft };
  // Done, but with no result on record (e.g. it was finished before results were kept): doing it again records one.
  if (row.missing.includes("an assessment record")) return { status: "evidence" as const, expiresAt: row.expiresAt, daysLeft: row.daysLeft };
  return null;
}

/** Whether completed training is due soon or has expired, by its dates alone (whatever else is outstanding). */
function refreshStage(row: { completedAt: string | null; daysLeft: number | null }, s: RegisterSettings) {
  if (!row.completedAt || row.daysLeft === null) return null;
  return row.daysLeft <= 0 ? ("expired" as const) : row.daysLeft <= s.dueSoonDays ? ("due" as const) : null;
}

/** The signed-in person's register topics: status, when they did each, and when it needs refreshing. Most urgent first. */
export function myRequiredTraining(db: Db, user: User, now: Date) {
  const entries = db.prepare("SELECT * FROM compliance_register ORDER BY created_at").all() as EntryRow[];
  const me: Person = { id: user.id, name: user.name, email: user.email, audience: user.audience, org: "" };
  const urgency: RegisterStatus[] = ["expired", "due_soon", "refresher", "not_trained", "in_progress", "approval", "evidence", "current"];
  return entries
    .flatMap((e) => {
      const l = catalogue().find((x) => x.slug === e.lesson_slug);
      if (!l || !isFor(l, user.audience)) return [];
      const s = settingsOf(e);
      if (s.classification === "recommended") return [];
      const r = personRow(context(db, l.slug), l, s, me, now);
      return [
        {
          slug: l.slug,
          title: l.title,
          minutes: l.minutes,
          status: r.status,
          label: STATUS_LABELS[r.status],
          completedAt: r.completedAt,
          expiresAt: r.expiresAt,
          daysLeft: r.daysLeft,
          missing: r.missing,
        },
      ];
    })
    .sort((a, b) => urgency.indexOf(a.status) - urgency.indexOf(b.status) || (a.expiresAt ?? "9").localeCompare(b.expiresAt ?? "9"));
}

export type ReminderItem = { slug: string; title: string; stage: "due" | "expired"; expiresAt: string };

/** A reminder email listing what's due and what has expired. */
export function reminderText(user: { name: string }, items: ReminderItem[], baseUrl: string) {
  const expired = items.filter((i) => i.stage === "expired");
  const due = items.filter((i) => i.stage === "due");
  const when = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const subject = expired.length
    ? `Your ${expired.length === 1 ? `${expired[0].title} training has` : `required training has`} expired`
    : `Your ${due.length === 1 ? `${due[0].title} training is` : "required training is"} due soon`;
  const lines = [
    `Hi ${user.name.split(" ")[0]},`,
    "",
    expired.length && due.length
      ? "Some of your required training has expired, and more is due soon."
      : expired.length
        ? `Your required training ${expired.length === 1 ? "has" : "have"} expired. Please refresh ${expired.length === 1 ? "it" : "them"} as soon as you can.`
        : "Your required training is due for a refresh soon.",
    "",
    ...expired.map((i) => `• ${i.title}: expired on ${when(i.expiresAt)}\n  ${baseUrl}/learning/${i.slug}`),
    ...due.map((i) => `• ${i.title}: refresh by ${when(i.expiresAt)}\n  ${baseUrl}/learning/${i.slug}`),
    "",
    "Open the topic and choose Refresh your training. It takes a few minutes, and your record updates as soon as you finish.",
  ];
  return { subject, body: lines.join("\n") };
}

/**
  Queues one email per person for register topics that have just become due soon, or have expired,
  each stage once per training cycle. Several topics on the same day go in one email.
*/
export function queueComplianceReminders(db: Db, now: Date, baseUrl: string) {
  const entries = db.prepare("SELECT * FROM compliance_register").all() as EntryRow[];
  const persons = learners(db);
  const byUser = new Map<string, ReminderItem[]>();
  const sent = db.prepare("SELECT 1 FROM compliance_reminders WHERE user_id = ? AND lesson_slug = ? AND stage = ? AND expires_at = ?");
  for (const e of entries) {
    const l = catalogue().find((x) => x.slug === e.lesson_slug);
    if (!l) continue;
    const s = settingsOf(e);
    for (const r of rowsOf(persons, l, s, now, context(db, l.slug))) {
      const stage = refreshStage(r, s);
      if (!stage || !r.expiresAt) continue;
      if (sent.get(r.userId, l.slug, stage, r.expiresAt)) continue;
      byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { slug: l.slug, title: l.title, stage, expiresAt: r.expiresAt }]);
    }
  }
  const today = now.toISOString().slice(0, 10);
  let queued = 0;
  for (const [userId, items] of byUser) {
    const person = persons.find((p) => p.id === userId)!;
    const text = reminderText(person, items, baseUrl);
    const at = now.toISOString();
    tx(db, () => {
      const r = db
        .prepare(
          `INSERT OR IGNORE INTO outbox (user_id, kind, channel, local_date, idempotency_key, items, subject, body, status, created_at, updated_at)
           VALUES (?, 'compliance_reminder', 'email', ?, ?, ?, ?, ?, 'queued', ?, ?)`,
        )
        .run(userId, today, `compliance:${userId}:${today}`, JSON.stringify(items), text.subject, text.body, at, at);
      // Marked as reminded only once it's in the outbox; anything that missed today's email goes tomorrow.
      if (!r.changes) return;
      queued++;
      for (const i of items)
        db.prepare("INSERT OR IGNORE INTO compliance_reminders (user_id, lesson_slug, stage, expires_at, queued_at) VALUES (?, ?, ?, ?, ?)").run(
          userId,
          i.slug,
          i.stage,
          i.expiresAt,
          at,
        );
    });
  }
  return queued;
}

/** Just before sending: the items still needing a refresh (someone may have refreshed since it was queued). */
export function remindersStillDue(db: Db, userId: string, items: ReminderItem[], now: Date) {
  const user = learners(db).find((p) => p.id === userId);
  if (!user) return [];
  // Only the dates count here: a reminder is about training running out, not missing results.
  return items.filter((i) => {
    const due = refreshDue(db, user, i.slug, now);
    return due && due.status !== "evidence";
  });
}
