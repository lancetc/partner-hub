import "server-only";
import { lessons, type Lesson } from "@/content/lessons";
import type { Db } from "./db";
import { HttpError, requireReporter, type User } from "./auth";
import { assignableUsers } from "./learningPaths";
import { importantChangesSince } from "./lessonVersions";

/*
  Completion reports: by lesson (who has finished, started or not opened it, and how the quiz went)
  and by person (every lesson, path and sign-off). Completions record the version finished, so
  anyone who finished before an important change is flagged for a refresher. Organisation admins
  see their own organisation only; authors see everyone.
*/

type Person = { id: string; name: string; email: string; org: string; audience: string };
type Attempt = { version?: string; status?: string; nodeId?: string; route?: string[]; answers?: Record<string, unknown> };
export type LessonState = "completed" | "in_progress" | "not_started";

const catalogue = () => lessons.filter((l) => l.track !== "reinforcement");

/** Who a lesson is for: partner and coordinator lessons for that audience, everything else for both. */
export const isFor = (l: Pick<Lesson, "track">, audience: string) => (l.track === "partner" || l.track === "coordinator" ? l.track === audience : true);

function people(db: Db, viewer: User): Person[] {
  const ids = new Set(assignableUsers(db, viewer).map((u) => u.id));
  return (
    db.prepare("SELECT u.id, u.name, u.email, u.audience, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.name").all() as Person[]
  ).filter((p) => ids.has(p.id));
}

/** Everything known about who did what, read once per report. */
function facts(db: Db) {
  const completions = new Map<string, { version: string; at: string }>();
  for (const r of db.prepare("SELECT user_id, lesson_slug, lesson_version, completed_at FROM lesson_completions ORDER BY completed_at").all() as {
    user_id: string;
    lesson_slug: string;
    lesson_version: string;
    completed_at: string;
  }[])
    // The latest completion counts: someone who redoes a lesson after a change is up to date again.
    completions.set(`${r.user_id}|${r.lesson_slug}`, { version: r.lesson_version, at: r.completed_at });
  const progress = new Map<string, { attempt: Attempt; savedAt: string }>();
  for (const r of db.prepare("SELECT user_id, slug, attempt, saved_at FROM lesson_progress").all() as {
    user_id: string;
    slug: string;
    attempt: string;
    saved_at: string;
  }[])
    progress.set(`${r.user_id}|${r.slug}`, { attempt: JSON.parse(r.attempt) as Attempt, savedAt: r.saved_at });
  const refresher = new Map<string, boolean>();
  const needsRefresher = (slug: string, version: string) => {
    const k = `${slug}|${version}`;
    if (!refresher.has(k)) refresher.set(k, importantChangesSince(db, slug, version).length > 0);
    return refresher.get(k)!;
  };
  return { completions, progress, needsRefresher };
}

/** First-try quiz score from someone's saved answers, e.g. 1 of 2. */
function quizScore(lesson: Lesson, answers: Record<string, unknown> | undefined) {
  if (!answers) return null;
  let right = 0;
  let asked = 0;
  for (const card of Object.values(lesson.nodes))
    if (card.type === "quiz")
      for (const q of card.questions) {
        const v = answers[`first:${card.id}.${q.id}`];
        if (v === undefined) continue;
        asked++;
        if (v === 1) right++;
      }
  return asked ? { right, asked } : null;
}

function stateOf(f: ReturnType<typeof facts>, lesson: Lesson, userId: string) {
  const done = f.completions.get(`${userId}|${lesson.slug}`);
  const prog = f.progress.get(`${userId}|${lesson.slug}`);
  const state: LessonState = done ? "completed" : prog ? "in_progress" : "not_started";
  const cards = Object.keys(lesson.nodes).length;
  const reached = prog?.attempt.nodeId ? lesson.nodes[prog.attempt.nodeId] : undefined;
  return {
    state,
    completedAt: done?.at ?? null,
    version: done?.version ?? null,
    needsRefresher: done ? f.needsRefresher(lesson.slug, done.version) : false,
    lastActive: prog?.savedAt ?? done?.at ?? null,
    // Where someone who hasn't finished got to.
    reached:
      !done && reached ? { title: reached.heading || reached.label || reached.id, step: Math.min(prog?.attempt.route?.length ?? 1, cards), of: cards } : null,
    score: quizScore(lesson, prog?.attempt.answers),
  };
}

const findLesson = (slug: string) => {
  const l = catalogue().find((x) => x.slug === slug);
  if (!l) throw new HttpError(404, "Lesson not found.");
  return l;
};

/** Every lesson with how many of the people it's for have finished, started or not opened it. */
export function lessonsOverview(db: Db, viewer: User) {
  requireReporter(viewer);
  const ps = people(db, viewer);
  const f = facts(db);
  return catalogue().map((l) => {
    // The people it's for, plus anyone else who has opened it (as on the lesson's own page).
    const rows = ps.map((p) => ({ expected: isFor(l, p.audience), ...stateOf(f, l, p.id) })).filter((r) => r.expected || r.state !== "not_started");
    const scored = rows.filter((r) => r.score);
    return {
      slug: l.slug,
      title: l.title,
      track: l.track,
      version: l.version,
      people: rows.length,
      completed: rows.filter((r) => r.state === "completed").length,
      inProgress: rows.filter((r) => r.state === "in_progress").length,
      notStarted: rows.filter((r) => r.state === "not_started").length,
      needsRefresher: rows.filter((r) => r.needsRefresher).length,
      firstTry: scored.length ? Math.round((100 * scored.reduce((n, r) => n + r.score!.right, 0)) / scored.reduce((n, r) => n + r.score!.asked, 0)) : null,
    };
  });
}

/** One lesson: each person's progress, and how each quiz question went on the first try. */
export function lessonReport(db: Db, viewer: User, slug: string) {
  requireReporter(viewer);
  const l = findLesson(slug);
  const f = facts(db);
  const ps = people(db, viewer);
  const rows = ps
    .map((p) => ({ person: p, expected: isFor(l, p.audience), ...stateOf(f, l, p.id) }))
    // People it isn't meant for only show if they've opened it.
    .filter((r) => r.expected || r.state !== "not_started");

  const inScope = new Set(ps.map((p) => p.id));
  const questions = Object.values(l.nodes).flatMap((card) =>
    card.type === "quiz"
      ? card.questions.map((q) => {
          let answered = 0;
          let right = 0;
          const picks: Record<string, number> = {};
          for (const [key, prog] of f.progress) {
            const [userId, s] = key.split("|");
            if (s !== slug || !inScope.has(userId)) continue;
            const a = prog.attempt.answers ?? {};
            const first = a[`first:${card.id}.${q.id}`];
            if (first === undefined) continue;
            answered++;
            if (first === 1) right++;
            const pick = a[`pick:${card.id}.${q.id}`];
            if (typeof pick === "string" && pick !== q.correct) picks[pick] = (picks[pick] ?? 0) + 1;
          }
          return {
            cardId: card.id,
            id: q.id,
            prompt: q.prompt,
            answered,
            right,
            wrongPicks: Object.entries(picks)
              .map(([id, n]) => ({ label: q.options.find((o) => o.id === id)?.label ?? id, count: n }))
              .sort((a, b) => b.count - a.count),
          };
        })
      : [],
  );
  return { lesson: { slug: l.slug, title: l.title, version: l.version, track: l.track }, people: rows, questions };
}

/** Everyone in scope with a summary of their lessons and paths. */
export function peopleOverview(db: Db, viewer: User, now: Date) {
  requireReporter(viewer);
  const f = facts(db);
  const today = now.toISOString().slice(0, 10);
  return people(db, viewer).map((p) => {
    const states = catalogue()
      .filter((l) => isFor(l, p.audience))
      .map((l) => stateOf(f, l, p.id));
    const paths = pathsFor(db, p.id, f);
    return {
      ...p,
      lessons: states.length,
      completed: states.filter((s) => s.state === "completed").length,
      inProgress: states.filter((s) => s.state === "in_progress").length,
      needsRefresher: states.filter((s) => s.needsRefresher).length,
      overduePaths: paths.filter((x) => !x.done && x.dueDate && x.dueDate < today).length,
      lastActive:
        states
          .map((s) => s.lastActive)
          .filter(Boolean)
          .sort()
          .pop() ?? null,
    };
  });
}

function pathsFor(db: Db, userId: string, f: ReturnType<typeof facts>) {
  const rows = db
    .prepare(
      "SELECT p.id, p.name, a.due_date FROM learning_path_assignments a JOIN learning_paths p ON p.id = a.path_id WHERE a.user_id = ? AND p.archived = 0 ORDER BY a.assigned_at",
    )
    .all(userId) as { id: string; name: string; due_date: string | null }[];
  return rows.map((r) => {
    const slugs = (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(r.id) as { lesson_slug: string }[]).map(
      (x) => x.lesson_slug,
    );
    // Draft lessons in a path are "coming soon" and don't count yet.
    const live = slugs.filter((s) => catalogue().some((l) => l.slug === s));
    const completed = live.filter((s) => f.completions.has(`${userId}|${s}`)).length;
    return { id: r.id, name: r.name, dueDate: r.due_date, completed, total: live.length, done: live.length > 0 && completed === live.length };
  });
}

/** One person: every lesson (meant for them, or that they've opened), their paths and sign-offs. */
export function personReport(db: Db, viewer: User, userId: string) {
  requireReporter(viewer);
  const person = people(db, viewer).find((p) => p.id === userId);
  if (!person) throw new HttpError(404, "Person not found.");
  const f = facts(db);
  const lessonRows = catalogue()
    .map((l) => ({ slug: l.slug, title: l.title, track: l.track, liveVersion: l.version, expected: isFor(l, person.audience), ...stateOf(f, l, userId) }))
    .filter((r) => r.expected || r.state !== "not_started");
  const titles = new Map(lessons.map((l) => [l.slug, l.title]));
  const signoffs = (
    db
      .prepare(
        "SELECT s.lesson_slug, s.outcome, s.note, s.decided_at, u.name AS by FROM signoffs s JOIN users u ON u.id = s.decided_by WHERE s.user_id = ? ORDER BY s.decided_at DESC",
      )
      .all(userId) as { lesson_slug: string; outcome: string; note: string; decided_at: string; by: string }[]
  ).map((s) => ({ lesson: titles.get(s.lesson_slug) ?? s.lesson_slug, outcome: s.outcome, note: s.note, at: s.decided_at, by: s.by }));
  return { person, lessons: lessonRows, paths: pathsFor(db, userId, f), signoffs };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything, and stop spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Every person-and-lesson row in scope as CSV, for records and audits. Optionally one lesson only. */
export function completionsCsv(db: Db, viewer: User, slug?: string) {
  requireReporter(viewer);
  const f = facts(db);
  const ls = slug ? [findLesson(slug)] : catalogue();
  const header = [
    "Name",
    "Email",
    "Organisation",
    "Audience",
    "Lesson",
    "Status",
    "Version completed",
    "Completed at",
    "Live version",
    "Needs refresher",
    "Quiz first try",
    "Last active",
  ];
  const lines = [header];
  for (const p of people(db, viewer))
    for (const l of ls) {
      const s = stateOf(f, l, p.id);
      if (!isFor(l, p.audience) && s.state === "not_started") continue;
      lines.push([
        p.name,
        p.email,
        p.org,
        p.audience,
        l.title,
        s.state === "completed" ? "Completed" : s.state === "in_progress" ? "In progress" : "Not started",
        s.version ?? "",
        s.completedAt ?? "",
        l.version,
        s.needsRefresher ? "Yes" : "",
        s.score ? `${s.score.right}/${s.score.asked}` : "",
        s.lastActive ?? "",
      ]);
    }
  return lines.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
