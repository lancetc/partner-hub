import "server-only";
import { assessmentRecord } from "@/lib/assessment";
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

export function people(db: Db, viewer: User): Person[] {
  const ids = new Set(assignableUsers(db, viewer).map((u) => u.id));
  return (
    db.prepare("SELECT u.id, u.name, u.email, u.audience, o.name AS org FROM users u JOIN orgs o ON o.id = u.org_id ORDER BY u.name").all() as Person[]
  ).filter((p) => ids.has(p.id));
}

/** Everything known about who did what, read once per report. */
export function facts(db: Db) {
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
  // Topics people enrolled in themselves: they always show on that topic's report.
  const enrolled = new Set(
    (db.prepare("SELECT user_id, lesson_slug FROM topic_enrolments").all() as { user_id: string; lesson_slug: string }[]).map(
      (r) => `${r.user_id}|${r.lesson_slug}`,
    ),
  );
  const refresher = new Map<string, boolean>();
  const needsRefresher = (slug: string, version: string) => {
    const k = `${slug}|${version}`;
    if (!refresher.has(k)) refresher.set(k, importantChangesSince(db, slug, version).length > 0);
    return refresher.get(k)!;
  };
  return { completions, progress, enrolled, needsRefresher };
}

/** First-try quiz score from someone's saved answers, e.g. 1 of 2. */
export function quizScore(lesson: Lesson, answers: Record<string, unknown> | undefined) {
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

/** The topic's assessment card, if it has one (a quiz in assessment mode). */
const assessmentCard = (lesson: Lesson) =>
  Object.values(lesson.nodes).find((c) => c.type === "quiz" && c.assessment) as Extract<Lesson["nodes"][string], { type: "quiz" }> | undefined;

/** Someone's assessment record for a topic: first and latest score, attempts, and when they passed. */
export function assessmentOf(lesson: Lesson, answers: Record<string, unknown> | undefined) {
  const card = assessmentCard(lesson);
  if (!card) return null;
  const record = assessmentRecord(card.id, answers);
  return record ? { ...record, passMark: card.assessment!.passMark } : null;
}

export function stateOf(f: ReturnType<typeof facts>, lesson: Lesson, userId: string) {
  const done = f.completions.get(`${userId}|${lesson.slug}`);
  const prog = f.progress.get(`${userId}|${lesson.slug}`);
  const state: LessonState = done ? "completed" : prog ? "in_progress" : "not_started";
  const cards = Object.keys(lesson.nodes).length;
  const reached = prog?.attempt.nodeId ? lesson.nodes[prog.attempt.nodeId] : undefined;
  return {
    state,
    /** They enrolled in this topic themselves. */
    enrolled: f.enrolled.has(`${userId}|${lesson.slug}`),
    completedAt: done?.at ?? null,
    version: done?.version ?? null,
    needsRefresher: done ? f.needsRefresher(lesson.slug, done.version) : false,
    lastActive: prog?.savedAt ?? done?.at ?? null,
    // Where someone who hasn't finished got to.
    reached:
      !done && reached ? { title: reached.heading || reached.label || reached.id, step: Math.min(prog?.attempt.route?.length ?? 1, cards), of: cards } : null,
    score: quizScore(lesson, prog?.attempt.answers),
    assessment: assessmentOf(lesson, prog?.attempt.answers),
  };
}

const findLesson = (slug: string) => {
  const l = catalogue().find((x) => x.slug === slug);
  if (!l) throw new HttpError(404, "Topic not found.");
  return l;
};

/** Every lesson with how many of the people it's for have finished, started or not opened it. */
export function lessonsOverview(db: Db, viewer: User) {
  requireReporter(viewer);
  const ps = people(db, viewer);
  const f = facts(db);
  return catalogue().map((l) => {
    // The people it's for, plus anyone else who has opened it or enrolled in it (as on the lesson's own page).
    const rows = ps
      .map((p) => ({ expected: isFor(l, p.audience), ...stateOf(f, l, p.id) }))
      .filter((r) => r.expected || r.enrolled || r.state !== "not_started");
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
    // People it isn't meant for only show if they've opened it or enrolled in it.
    .filter((r) => r.expected || r.enrolled || r.state !== "not_started");

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
  const assessment = assessmentCard(l)?.assessment ?? null;
  return { lesson: { slug: l.slug, title: l.title, version: l.version, track: l.track, assessment }, people: rows, questions };
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
      "SELECT p.id, p.name, a.due_date, a.self FROM learning_path_assignments a JOIN learning_paths p ON p.id = a.path_id WHERE a.user_id = ? AND p.archived = 0 ORDER BY a.assigned_at",
    )
    .all(userId) as { id: string; name: string; due_date: string | null; self: number }[];
  return rows.map((r) => {
    const slugs = (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(r.id) as { lesson_slug: string }[]).map(
      (x) => x.lesson_slug,
    );
    // Draft lessons in a path are "coming soon" and don't count yet.
    const live = slugs.filter((s) => catalogue().some((l) => l.slug === s));
    const completed = live.filter((s) => f.completions.has(`${userId}|${s}`)).length;
    return {
      id: r.id,
      name: r.name,
      dueDate: r.due_date,
      selfEnrolled: Boolean(r.self),
      completed,
      total: live.length,
      done: live.length > 0 && completed === live.length,
    };
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
    .filter((r) => r.expected || r.enrolled || r.state !== "not_started");
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

export const csvCell = (v: unknown) => {
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
    "Topic",
    "Status",
    "Version completed",
    "Completed at",
    "Live version",
    "Needs refresher",
    "Quiz first try",
    "Assessment first score",
    "Assessment latest score",
    "Assessment attempts",
    "Assessment passed at",
    "Last active",
    "Self-enrolled",
  ];
  const lines = [header];
  for (const p of people(db, viewer))
    for (const l of ls) {
      const s = stateOf(f, l, p.id);
      if (!isFor(l, p.audience) && !s.enrolled && s.state === "not_started") continue;
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
        s.assessment ? `${s.assessment.firstScore}%` : "",
        s.assessment ? `${s.assessment.latestScore}%` : "",
        s.assessment ? String(s.assessment.attempts) : "",
        s.assessment?.passedAt ?? "",
        s.lastActive ?? "",
        s.enrolled ? "Yes" : "",
      ]);
    }
  return lines.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* Learning paths: who's been given each path, and how far each person has got. */

type PathPerson = {
  person: Person;
  completed: number;
  total: number;
  state: "completed" | "in_progress" | "not_started";
  dueDate: string | null;
  /** They enrolled themselves rather than being assigned. */
  selfEnrolled: boolean;
  overdue: boolean;
  lastActive: string | null;
  next: { slug: string; title: string } | null;
};

function pathPeople(db: Db, viewer: User, pathId: string, slugs: string[], f: ReturnType<typeof facts>, today: string): PathPerson[] {
  const inScope = new Map(people(db, viewer).map((p) => [p.id, p]));
  const live = slugs.filter((s) => catalogue().some((l) => l.slug === s));
  const rows = db.prepare("SELECT user_id, due_date, self FROM learning_path_assignments WHERE path_id = ? ORDER BY assigned_at").all(pathId) as {
    user_id: string;
    due_date: string | null;
    self: number;
  }[];
  return rows
    .filter((r) => inScope.has(r.user_id))
    .map((r) => {
      const done = live.filter((s) => f.completions.has(`${r.user_id}|${s}`));
      const started = live.some((s) => f.progress.has(`${r.user_id}|${s}`)) || done.length > 0;
      const times = live
        .flatMap((s) => [f.completions.get(`${r.user_id}|${s}`)?.at, f.progress.get(`${r.user_id}|${s}`)?.savedAt])
        .filter((x): x is string => Boolean(x));
      const complete = live.length > 0 && done.length === live.length;
      const nextSlug = live.find((s) => !done.includes(s));
      const next = nextSlug ? catalogue().find((l) => l.slug === nextSlug) : undefined;
      return {
        person: inScope.get(r.user_id)!,
        completed: done.length,
        total: live.length,
        state: complete ? "completed" : started ? "in_progress" : "not_started",
        dueDate: r.due_date,
        selfEnrolled: Boolean(r.self),
        overdue: !complete && Boolean(r.due_date && r.due_date < today),
        lastActive: times.sort().at(-1) ?? null,
        next: next ? { slug: next.slug, title: next.title } : null,
      } satisfies PathPerson;
    });
}

const activePaths = (db: Db) => db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { id: string; name: string }[];
const pathSlugs = (db: Db, id: string) =>
  (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ? ORDER BY position").all(id) as { lesson_slug: string }[]).map(
    (r) => r.lesson_slug,
  );

/** Every learning path with how its assigned people are getting on. */
export function pathsOverview(db: Db, viewer: User, now: Date) {
  requireReporter(viewer);
  const f = facts(db);
  const today = now.toISOString().slice(0, 10);
  return activePaths(db).map((p) => {
    const slugs = pathSlugs(db, p.id);
    const rows = pathPeople(db, viewer, p.id, slugs, f, today);
    return {
      id: p.id,
      name: p.name,
      topics: slugs.filter((s) => catalogue().some((l) => l.slug === s)).length,
      assigned: rows.length,
      completed: rows.filter((r) => r.state === "completed").length,
      inProgress: rows.filter((r) => r.state === "in_progress").length,
      notStarted: rows.filter((r) => r.state === "not_started").length,
      overdue: rows.filter((r) => r.overdue).length,
    };
  });
}

/** One learning path: each assigned person's progress, and how far everyone has got with each topic in it. */
export function pathReport(db: Db, viewer: User, pathId: string, now: Date) {
  requireReporter(viewer);
  const p = db.prepare("SELECT id, name, archived FROM learning_paths WHERE id = ?").get(pathId) as { id: string; name: string; archived: number } | undefined;
  if (!p || p.archived) throw new HttpError(404, "Learning path not found.");
  const f = facts(db);
  const slugs = pathSlugs(db, pathId);
  const rows = pathPeople(db, viewer, pathId, slugs, f, now.toISOString().slice(0, 10));
  const topics = slugs
    .map((s) => catalogue().find((l) => l.slug === s))
    .filter((l): l is Lesson => Boolean(l))
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      completed: rows.filter((r) => f.completions.has(`${r.person.id}|${l.slug}`)).length,
      inProgress: rows.filter((r) => !f.completions.has(`${r.person.id}|${l.slug}`) && f.progress.has(`${r.person.id}|${l.slug}`)).length,
    }));
  return { path: { id: p.id, name: p.name }, people: rows, topics };
}
