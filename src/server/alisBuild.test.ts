import { beforeEach, describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { ALIS_COURSE, ALIS_MODULES, ALIS_PARTS } from "@/content/alisCourse";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { syncPublishedLessons } from "./lessonRegistry";
import { editorLesson, publishLesson } from "./authoredLessons";
import { createLearningPath, slugsFor } from "./learningPaths";
import { quizOffer, startQuiz, submitQuiz } from "./pathQuiz";
import { authorGuide, completionGap, publishGuide, readGuide } from "./magazine";
import { ALIS_GUIDE_SLUG, buildAlis } from "./alisBuild";
import { storedExciter } from "./pathExciterStore";
import { exciterAction } from "./pathExciter";
import { ensureNarrationJobs } from "./narrationJobs";

/* Building the ALIS course into the Hub (docs/alis-course.md): drafts only, idempotent, three paths, one course. */

let db: Db;
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-24T02:00:00Z");
const count = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;
const slugsOf = (part: number) => ALIS_MODULES.filter((m) => m.part === part).map((m) => m.slug);

beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});

/**
  Publishes the course in this test database only. The Job Aid, case thread and Spot the Hazard scene need their own
  approvals, which "Publish anyway" never covers, so this test copy leaves them out: these tests are about the quizzes.
*/
function publishCourse(r: ReturnType<typeof buildAlis>) {
  const row = db.prepare("SELECT draft FROM magazine_guides WHERE id = ?").get(r.guide.id) as { draft: string };
  const doc = JSON.parse(row.draft) as { pages: { sections: { blocks: { type: string }[] }[] }[] };
  for (const p of doc.pages) for (const sec of p.sections) sec.blocks = sec.blocks.filter((b) => !["playbook", "casethread", "hazardscan"].includes(b.type));
  db.prepare("UPDATE magazine_guides SET draft = ? WHERE id = ?").run(JSON.stringify(doc), r.guide.id);
  publishGuide(db, u("jordan"), r.guide.id, "Test edition", now, { allowUnverified: true });
}

/** Publishes a part's Topics and the course (in this test database only), so its path quiz can be taken. */
function publishPart(r: ReturnType<typeof buildAlis>, part: number) {
  for (const slug of slugsOf(part)) publishLesson(db, u("jordan"), slug, now);
  publishCourse(r);
}

/** Takes a path quiz, getting `wrong` questions wrong. */
function take(pathId: string, wrong: number, who = "riley") {
  const s = startQuiz(db, u(who), pathId, now);
  const right = (key: string) => {
    const [slug, card, id] = key.split("|");
    const c = lessons.find((l) => l.slug === slug)!.nodes[card];
    if (c.type !== "quiz") throw new Error(key);
    return c.questions.find((q) => q.id === id)!.correct;
  };
  const answers = Object.fromEntries(s.questions.map((q, i) => [q.key, i < wrong ? q.options.find((o) => o.id !== right(q.key))!.id : right(q.key)]));
  return { asked: s.questions, result: submitQuiz(db, u(who), pathId, s.attempt, answers, now) };
}

describe("buildAlis", () => {
  it("creates 19 short draft Topics, three Discovery Paths with path quizzes, and one draft Magazine course", () => {
    const r = buildAlis(db, u("jordan"), now);
    expect(r.topics.map((t) => t.slug)).toEqual(ALIS_MODULES.map((m) => m.slug));
    for (const m of ALIS_MODULES) {
      const e = editorLesson(db, m.slug)!;
      expect(e.lesson.title).toBe(m.title);
      expect(e.status.state).toBe("unpublished");
      expect(Object.values(e.lesson.nodes).some((c) => c.type === "quiz" && c.assessment)).toBe(false);
    }
    expect(r.paths.map((p) => p.title)).toEqual(ALIS_PARTS.map((p) => p.title));
    // Each path's description is the part's short summary; its spoken introduction is the Discovery Exciter, a draft to approve.
    expect(r.paths.map((p) => (db.prepare("SELECT description FROM learning_paths WHERE id = ?").get(p.id) as { description: string }).description)).toEqual(
      ALIS_PARTS.map((p) => p.description),
    );
    expect(r.paths.map((p) => storedExciter(db, p.id))).toEqual(
      ALIS_PARTS.map((p) => ({ script: p.intro, status: "draft", version: 1, source: "seed", updatedAt: now.toISOString() })),
    );
    r.paths.forEach((p) => {
      expect(slugsFor(db, p.id)).toEqual(slugsOf(p.part));
      expect(JSON.parse((db.prepare("SELECT quiz FROM learning_paths WHERE id = ?").get(p.id) as { quiz: string }).quiz)).toEqual({
        questions: 5,
        passMark: 100,
        attempts: 5,
      });
    });
    const g = authorGuide(db, u("jordan"), r.guide.id);
    expect(g).toMatchObject({ slug: ALIS_GUIDE_SLUG, title: ALIS_COURSE.title, status: "draft" });
  });

  it("writes the Exciter again only while it's an untouched seed: an author's script (or approval) is kept when it's run again", () => {
    const first = buildAlis(db, u("jordan"), now);
    const [p1, p2] = first.paths;
    // An author edits part 1's script and approves part 2's.
    exciterAction(db, u("jordan"), p1.id, { action: "save", script: "An author’s own Exciter, with its own words." }, now);
    exciterAction(db, u("jordan"), p2.id, { action: "approve-script" }, now);
    buildAlis(db, u("jordan"), new Date(now.getTime() + 60_000));
    expect(storedExciter(db, p1.id)).toMatchObject({ script: "An author’s own Exciter, with its own words.", source: "author" });
    expect(storedExciter(db, p2.id)).toMatchObject({ script: ALIS_PARTS[1].intro, status: "approved" });
    // No audio is ever asked for.
    ensureNarrationJobs(db);
    expect(count("SELECT COUNT(*) AS n FROM magazine_narration_jobs")).toBe(0);
  });

  it("links each chapter's quiz in the Magazine course to its part's path", () => {
    const r = buildAlis(db, u("jordan"), now);
    const doc = authorGuide(db, u("jordan"), r.guide.id).doc;
    const quizzes = doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks).flatMap((b) => (b.type === "quiz" ? [[p.id, b.pathId]] : [])));
    expect(quizzes).toEqual(r.paths.map((p) => [`p${p.part}-check`, p.id]));
  });

  it("updates the drafts when run again, and creates nothing twice", () => {
    const first = buildAlis(db, u("jordan"), now);
    const second = buildAlis(db, u("jordan"), new Date(now.getTime() + 60_000));
    expect(second.topics.some((t) => t.created)).toBe(false);
    expect(second.paths.map((p) => [p.id, p.created])).toEqual(first.paths.map((p) => [p.id, false]));
    expect(second.guide).toEqual({ ...first.guide, created: false });
    expect(second.archived).toEqual([]);
    expect(count("SELECT COUNT(*) AS n FROM authored_lessons WHERE slug LIKE 'alis-%'")).toBe(19);
    expect(count("SELECT COUNT(*) AS n FROM learning_paths WHERE name LIKE 'SIRS %' AND archived = 0")).toBe(3);
    expect(count("SELECT COUNT(*) AS n FROM magazine_guides WHERE slug LIKE 'aged-care-learning-information-solution%'")).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM magazine_revisions WHERE guide_id = ?", first.guide.id)).toBe(0);
  });

  it("archives the first version's single path and module check paths", () => {
    const slug = ALIS_MODULES[0].slug;
    buildAlis(db, u("jordan"), now);
    const old = [
      createLearningPath(db, u("jordan"), { name: ALIS_COURSE.title, lessons: [slug] }, now).id,
      createLearningPath(db, u("jordan"), { name: `ALIS check 1.1: ${ALIS_MODULES[0].title}`, lessons: [slug] }, now).id,
    ];
    const r = buildAlis(db, u("jordan"), now);
    expect(r.archived.sort()).toEqual(old.sort());
    for (const id of old) expect((db.prepare("SELECT archived FROM learning_paths WHERE id = ?").get(id) as { archived: number }).archived).toBe(1);
  });

  it("keeps a published Topic live when it's run again, changing only its draft", () => {
    buildAlis(db, u("jordan"), now);
    const slug = ALIS_MODULES[0].slug;
    publishLesson(db, u("jordan"), slug, now);
    buildAlis(db, u("jordan"), new Date(now.getTime() + 60_000));
    const e = editorLesson(db, slug)!;
    expect(e.lesson.version).toBe("1.0");
    expect(e.status.state).toBe("live");
  });

  it("asks 5 questions spread over a part's Topics, failing at 4 out of 5 and passing at 5 out of 5", () => {
    const r = buildAlis(db, u("jordan"), now);
    const p1 = r.paths[0];
    // A path quiz draws from published Topics, so nothing is offered while they're drafts.
    expect(quizOffer(db, u("riley"), p1.id)).toBeNull();
    publishPart(r, 1);
    const first = take(p1.id, 1);
    expect(first.asked).toHaveLength(5);
    expect(new Set(first.asked.map((q) => q.key.split("|")[0])).size).toBe(5);
    expect(first.result).toMatchObject({ score: 4, total: 5, percent: 80, passed: false });
    expect(readGuide(db, u("riley"), ALIS_GUIDE_SLUG).quizzes["p1-check-quiz"]).toMatchObject({ passed: false, passMark: 100 });
    expect(take(p1.id, 0).result).toMatchObject({ score: 5, total: 5, percent: 100, passed: true });
    expect(readGuide(db, u("riley"), ALIS_GUIDE_SLUG).quizzes["p1-check-quiz"]).toMatchObject({ passed: true });
  });

  it("spreads Part 3's 5 questions over 5 of its 9 Topics", () => {
    const r = buildAlis(db, u("jordan"), now);
    publishPart(r, 3);
    const { asked } = take(r.paths[2].id, 0);
    expect(asked).toHaveLength(5);
    const topics = asked.map((q) => q.key.split("|")[0]);
    expect(new Set(topics).size).toBe(5);
    for (const t of topics) expect(slugsOf(3)).toContain(t);
  });

  it("counts a chapter's Magazine quiz as passed when the learner has finished that path's Topics", () => {
    const r = buildAlis(db, u("jordan"), now);
    publishPart(r, 2);
    for (const slug of slugsOf(2))
      db.prepare("INSERT INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES (?, ?, ?, ?)").run(
        "riley",
        slug,
        "1.0",
        now.toISOString(),
      );
    expect(quizOffer(db, u("riley"), r.paths[1].id)).toMatchObject({ available: false, passed: false, done: true });
    expect(readGuide(db, u("riley"), ALIS_GUIDE_SLUG).quizzes["p2-check-quiz"]).toMatchObject({ passed: true });
    // Someone who hasn't done the Topics still takes the quiz.
    expect(readGuide(db, u("dana"), ALIS_GUIDE_SLUG).quizzes["p2-check-quiz"]).toMatchObject({ passed: false, available: true });
  });

  // Publishes all 19 Topics and the course: slow under a full parallel run, so it gets longer than the default.
  it("completes the Magazine course only when all three chapter quizzes are passed", { timeout: 20_000 }, () => {
    const r = buildAlis(db, u("jordan"), now);
    for (const part of [1, 2, 3]) for (const slug of slugsOf(part)) publishLesson(db, u("jordan"), slug, now);
    publishCourse(r);
    expect(completionGap(readGuide(db, u("riley"), ALIS_GUIDE_SLUG))).toBe("Pass all the quizzes first: Chapter 1, Chapter 2, Chapter 3.");
    take(r.paths[0].id, 0);
    take(r.paths[2].id, 0);
    expect(completionGap(readGuide(db, u("riley"), ALIS_GUIDE_SLUG))).toBe("Pass all the quizzes first: Chapter 2.");
    take(r.paths[1].id, 0);
    // With every quiz passed, what's left is finishing the pages.
    expect(completionGap(readGuide(db, u("riley"), ALIS_GUIDE_SLUG))).toMatch(/^Finish 22 more required pages first\.$/);
  });
});
