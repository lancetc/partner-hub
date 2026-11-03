import "server-only";
import { lessons, type QuizQuestion } from "@/content/lessons";
import { parseQuizSettings, quizMinutes } from "@/lib/pathQuizSettings";
import { audit, tx, type Db } from "./db";
import { HttpError, requireReporter, type User } from "./auth";
import { chaptersFor, getRow, inScope, slugsFor } from "./learningPaths";

/*
  The upfront quiz on a learning path. Its questions are drawn from the path's topics' own quick
  checks, so it stays in step as topics are edited. Passing records every topic in the path as
  complete (marked as by quiz); a fail leaves the path as it was, with the topics to focus on.
*/

type AttemptRow = {
  id: number;
  path_id: string;
  user_id: string;
  /** JSON list of AskedQuestion. */
  questions: string;
  answers: string | null;
  score: number | null;
  total: number;
  pass_mark: number;
  passed: number | null;
  started_at: string;
  submitted_at: string | null;
};
/** A question as asked: where it came from, and the order its options were shown in. */
type AskedQuestion = { slug: string; card: string; id: string; options: string[] };
type PoolQuestion = { slug: string; card: string; q: QuizQuestion };

const VIA = (pathId: string) => `path-quiz:${pathId}`;
const keyOf = (q: { slug: string; card: string; id: string }) => `${q.slug}|${q.card}|${q.id}`;
const published = (slug: string) => lessons.find((l) => l.slug === slug && l.track !== "reinforcement");

export const quizSettingsFor = (db: Db, pathId: string) =>
  parseQuizSettings((db.prepare("SELECT quiz FROM learning_paths WHERE id = ?").get(pathId) as { quiz: string | null } | undefined)?.quiz);

/** Every quick-check question in the path's published topics, topic by topic in path order. */
function poolFor(db: Db, pathId: string) {
  return slugsFor(db, pathId).flatMap((slug) => {
    const l = published(slug);
    if (!l) return [];
    return Object.values(l.nodes).flatMap((card) =>
      card.type === "quiz" ? card.questions.filter((q) => q.options.some((o) => o.id === q.correct)).map((q) => ({ slug, card: card.id, q })) : [],
    );
  });
}

function shuffle<T>(items: T[], rand: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
  Picks the questions for one attempt, spread across the path: one from each topic first (topics
  taken across chapters in turn, so a short quiz still reaches every chapter), then a second from
  each, and so on. They're asked in path order, with their options shuffled.
*/
export function drawQuestions(db: Db, pathId: string, count: number | null, rand: () => number = Math.random): AskedQuestion[] {
  const pool = poolFor(db, pathId);
  const slugs = slugsFor(db, pathId);
  const byTopic = new Map<string, PoolQuestion[]>();
  for (const p of pool) byTopic.set(p.slug, [...(byTopic.get(p.slug) ?? []), p]);
  for (const [s, qs] of byTopic) byTopic.set(s, shuffle(qs, rand));
  const want = Math.min(count ?? byTopic.size, pool.length);

  // Topics in an order that visits each chapter in turn.
  const chapters = chaptersFor(db, pathId);
  const groups = chapters.length ? chapters.map((c) => shuffle(c.lessons, rand)) : [shuffle(slugs, rand)];
  const order: string[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) for (const g of groups) if (i < g.length && byTopic.has(g[i])) order.push(g[i]);

  const picked: PoolQuestion[] = [];
  for (let round = 0; picked.length < want; round++)
    for (const s of order) {
      const q = byTopic.get(s)![round];
      if (q && picked.length < want) picked.push(q);
    }
  const position = (p: PoolQuestion) => slugs.indexOf(p.slug);
  return picked
    .sort((a, b) => position(a) - position(b))
    .map((p) => ({
      slug: p.slug,
      card: p.card,
      id: p.q.id,
      options: shuffle(
        p.q.options.map((o) => o.id),
        rand,
      ),
    }));
}

/** Attempts that still count (an administrator can clear them to allow another try), oldest first. */
const attemptsOf = (db: Db, pathId: string, userId: string) =>
  db.prepare("SELECT * FROM path_quiz_attempts WHERE path_id = ? AND user_id = ? AND cleared_at IS NULL ORDER BY id").all(pathId, userId) as AttemptRow[];

const resultOf = (a: AttemptRow) => ({
  score: a.score ?? 0,
  total: a.total,
  percent: a.total ? Math.round(((a.score ?? 0) / a.total) * 100) : 0,
  passed: Boolean(a.passed),
  passMark: a.pass_mark,
  at: a.submitted_at!,
});

/** True when every published topic in the path is already complete. */
function pathDone(db: Db, userId: string, pathId: string) {
  const live = slugsFor(db, pathId).filter((s) => published(s));
  if (!live.length) return false;
  const done = new Set(
    (db.prepare("SELECT DISTINCT lesson_slug FROM lesson_completions WHERE user_id = ?").all(userId) as { lesson_slug: string }[]).map((r) => r.lesson_slug),
  );
  return live.every((s) => done.has(s));
}

/**
  What the learner's path page shows about the quiz: null when the path has none. Otherwise the
  settings, how many tries they have left, their latest result, and whether they can take it now.
*/
export function quizOffer(db: Db, user: User, pathId: string) {
  const s = quizSettingsFor(db, pathId);
  if (!s) return null;
  const pool = poolFor(db, pathId);
  if (!pool.length) return null;
  const topics = new Set(pool.map((p) => p.slug)).size;
  const questions = Math.min(s.questions ?? topics, pool.length);
  const tries = attemptsOf(db, pathId, user.id);
  const submitted = tries.filter((a) => a.submitted_at);
  const latest = submitted.at(-1);
  const passed = submitted.some((a) => a.passed);
  const left = Math.max(0, s.attempts - submitted.length);
  const done = pathDone(db, user.id, pathId);
  return {
    questions,
    passMark: s.passMark,
    attempts: s.attempts,
    left,
    minutes: quizMinutes(questions),
    inProgress: tries.some((a) => !a.submitted_at),
    latest: latest ? { ...resultOf(latest), focus: focusOf(latest) } : null,
    passed,
    // Open until they pass, run out of tries, or finish the path the usual way.
    available: !passed && !done && left > 0,
  };
}

/** The topics they missed questions on, in path order. */
function focusOf(a: AttemptRow) {
  const answers = JSON.parse(a.answers ?? "{}") as Record<string, string>;
  const asked = JSON.parse(a.questions) as AskedQuestion[];
  const missed = new Set<string>();
  for (const q of asked) {
    const found = questionFor(q);
    if (found && answers[keyOf(q)] !== found.correct) missed.add(q.slug);
  }
  return [...missed].map((slug) => ({ slug, title: published(slug)?.title ?? "A topic" }));
}

function questionFor(q: AskedQuestion) {
  const card = published(q.slug)?.nodes[q.card];
  return card?.type === "quiz" ? card.questions.find((x) => x.id === q.id) : undefined;
}

/** The questions as the learner sees them: no answers. */
function asLearnerSees(asked: AskedQuestion[]) {
  return asked.flatMap((q) => {
    const found = questionFor(q);
    if (!found) return [];
    const label = new Map(found.options.map((o) => [o.id, o.label]));
    return [
      {
        key: keyOf(q),
        topic: published(q.slug)!.title,
        prompt: found.prompt,
        options: q.options.filter((id) => label.has(id)).map((id) => ({ id, label: label.get(id)! })),
      },
    ];
  });
}

/** Starts an attempt, or picks up the one they left part way. */
export function startQuiz(db: Db, user: User, pathId: string, now: Date, rand: () => number = Math.random) {
  const p = getRow(db, pathId);
  const offer = quizOffer(db, user, pathId);
  if (!offer) throw new HttpError(404, "This learning path doesn’t have a quiz.");
  const open = attemptsOf(db, pathId, user.id).find((a) => !a.submitted_at);
  if (!open && !offer.available)
    throw new HttpError(
      409,
      offer.passed
        ? "You’ve already passed this quiz."
        : !offer.left
          ? "You’ve used your tries at this quiz. Work through the topics to complete the path."
          : "You’ve already finished this path.",
    );
  let row = open;
  if (!row) {
    const s = quizSettingsFor(db, pathId)!;
    const asked = drawQuestions(db, pathId, s.questions, rand);
    const id = db
      .prepare("INSERT INTO path_quiz_attempts (path_id, user_id, questions, total, pass_mark, started_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(pathId, user.id, JSON.stringify(asked), asked.length, s.passMark, now.toISOString()).lastInsertRowid;
    row = db.prepare("SELECT * FROM path_quiz_attempts WHERE id = ?").get(id) as AttemptRow;
  }
  const questions = asLearnerSees(JSON.parse(row.questions));
  return { attempt: row.id, path: { id: p.id, name: p.name }, passMark: row.pass_mark, left: offer.left, questions };
}

/** Marks an attempt. A pass records every published topic in the path as complete. */
export function submitQuiz(db: Db, user: User, pathId: string, attemptId: number, answers: Record<string, string>, now: Date) {
  const row = db
    .prepare("SELECT * FROM path_quiz_attempts WHERE id = ? AND path_id = ? AND user_id = ? AND cleared_at IS NULL")
    .get(attemptId, pathId, user.id) as AttemptRow | undefined;
  if (!row) throw new HttpError(404, "That quiz attempt isn’t here any more. Start the quiz again.");
  if (row.submitted_at) return { ...resultOf(row), focus: focusOf(row), left: quizOffer(db, user, pathId)?.left ?? 0 };
  if (!answers || typeof answers !== "object") throw new HttpError(400, "Send your answers.");
  const asked = (JSON.parse(row.questions) as AskedQuestion[]).filter((q) => questionFor(q));
  const missing = asked.filter((q) => typeof answers[keyOf(q)] !== "string").length;
  if (missing) throw new HttpError(400, `Answer every question first. ${missing} ${missing === 1 ? "is" : "are"} still to go.`);
  const kept = Object.fromEntries(asked.map((q) => [keyOf(q), answers[keyOf(q)]]));
  const score = asked.filter((q) => kept[keyOf(q)] === questionFor(q)!.correct).length;
  // A question whose topic changed since the quiz started is left out of the total.
  const total = asked.length;
  const passed = total > 0 && score * 100 >= row.pass_mark * total;
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("UPDATE path_quiz_attempts SET answers = ?, score = ?, total = ?, passed = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(kept),
      score,
      total,
      passed ? 1 : 0,
      at,
      row.id,
    );
    if (passed)
      for (const slug of slugsFor(db, pathId)) {
        const l = published(slug);
        if (l)
          db.prepare("INSERT OR IGNORE INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at, via) VALUES (?, ?, ?, ?, ?)").run(
            user.id,
            slug,
            l.version,
            at,
            VIA(pathId),
          );
      }
    audit(db, {
      actor: user.id,
      event: passed ? "path_quiz.passed" : "path_quiz.not_passed",
      entity: `learning_path:${pathId}`,
      next: { score, total },
      at: now,
    });
  });
  const done = db.prepare("SELECT * FROM path_quiz_attempts WHERE id = ?").get(row.id) as AttemptRow;
  return { ...resultOf(done), focus: focusOf(done), left: quizOffer(db, user, pathId)?.left ?? 0 };
}

/** For the path editor: each person's quiz result, by user id. */
export function quizResults(db: Db, pathId: string) {
  const rows = db
    .prepare("SELECT * FROM path_quiz_attempts WHERE path_id = ? AND cleared_at IS NULL AND submitted_at IS NOT NULL ORDER BY id")
    .all(pathId) as AttemptRow[];
  const by = new Map<string, { tries: number; passed: boolean; best: ReturnType<typeof resultOf> }>();
  for (const r of rows) {
    const prev = by.get(r.user_id);
    const res = resultOf(r);
    by.set(r.user_id, {
      tries: (prev?.tries ?? 0) + 1,
      passed: Boolean(prev?.passed) || res.passed,
      best: !prev || res.percent > prev.best.percent ? res : prev.best,
    });
  }
  return by;
}

/**
  Lets someone try the quiz again: their attempts so far stop counting but stay on record. Topics
  completed by an earlier pass stay complete.
*/
export function clearQuizAttempts(db: Db, actor: User, pathId: string, userId: string, now: Date) {
  getRow(db, pathId);
  requireReporter(actor);
  if (userId !== actor.id && !inScope(db, actor, userId)) throw new HttpError(403, "You can only change quiz attempts for people in your organisation.");
  const n = db
    .prepare("UPDATE path_quiz_attempts SET cleared_at = ?, cleared_by = ? WHERE path_id = ? AND user_id = ? AND cleared_at IS NULL")
    .run(now.toISOString(), actor.id, pathId, userId).changes;
  audit(db, { actor: actor.id, event: "path_quiz.cleared", entity: `learning_path:${pathId}`, next: { userId, attempts: n }, at: now });
  return { cleared: n };
}
