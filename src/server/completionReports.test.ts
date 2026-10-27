import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons, type Lesson } from "@/content/lessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { editorLesson, publishLesson, saveDraft } from "./authoredLessons";
import { recordLessonCompletion } from "./learning";
import { saveProgress } from "./progress";
import { completionsCsv, isFor, lessonReport, lessonsOverview, peopleOverview, personReport } from "./completionReports";

/* Completion reports: by lesson and by person, scoped to the viewer's organisation. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T01:00:00Z");
const slug = "a-little-extra-time";
const lesson = () => lessons.find((l) => l.slug === slug)!;
const quiz = () => Object.values(lesson().nodes).find((c) => c.type === "quiz") as Extract<Lesson["nodes"][string], { type: "quiz" }>;

/** Someone part way through, with first-try quiz answers: right for the first question, a wrong pick for the rest. */
function partWay(userId: string) {
  const q = quiz();
  const answers: Record<string, string | number> = {};
  q.questions.forEach((x, i) => {
    const wrong = x.options.find((o) => o.id !== x.correct)!.id;
    answers[`first:${q.id}.${x.id}`] = i === 0 ? 1 : 0;
    answers[`pick:${q.id}.${x.id}`] = i === 0 ? x.correct : wrong;
  });
  saveProgress(
    db,
    u(userId),
    slug,
    { version: lesson().version, nodeId: q.id, route: ["welcome", "visit", q.id], answers, status: "in_progress" },
    now.toISOString(),
  );
}

const row = (r: ReturnType<typeof lessonReport>, id: string) => r.people.find((p) => p.person.id === id);

describe("who a lesson is for", () => {
  it("matches partner and coordinator lessons to that audience, and others to everyone", () => {
    expect(isFor({ track: "partner" }, "partner")).toBe(true);
    expect(isFor({ track: "partner" }, "coordinator")).toBe(false);
    expect(isFor({ track: "core" }, "coordinator")).toBe(true);
  });
});

describe("by lesson", () => {
  it("shows who finished, who is part way and who hasn't started", () => {
    recordLessonCompletion(db, u("sam"), { slug, version: lesson().version }, now);
    partWay("ash");
    const r = lessonReport(db, u("jordan"), slug);
    expect(row(r, "sam")).toMatchObject({ state: "completed", version: lesson().version, needsRefresher: false });
    expect(row(r, "ash")).toMatchObject({ state: "in_progress", reached: { step: 3 } });
    expect(row(r, "ash")!.score).toEqual({ right: 1, asked: quiz().questions.length });
    // A partner lesson isn't listed for a coordinator who hasn't opened it.
    expect(row(r, "riley")).toBeUndefined();

    const o = lessonsOverview(db, u("jordan")).find((l) => l.slug === slug)!;
    expect(o.completed).toBeGreaterThanOrEqual(1);
    expect(o.inProgress).toBeGreaterThanOrEqual(1);
    expect(o.completed + o.inProgress + o.notStarted).toBe(o.people);
  });

  it("counts first-try results and the wrong answers people chose", () => {
    partWay("ash");
    partWay("sam");
    const qs = lessonReport(db, u("jordan"), slug).questions;
    expect(qs[0]).toMatchObject({ answered: 2, right: 2, wrongPicks: [] });
    if (qs.length > 1) expect(qs[1]).toMatchObject({ answered: 2, right: 0, wrongPicks: [expect.objectContaining({ count: 2 })] });
  });

  it("flags people who finished before an important change", () => {
    recordLessonCompletion(db, u("sam"), { slug, version: lesson().version }, now);
    const f = editorLesson(db, slug)!;
    f.lesson.summary = "Updated";
    saveDraft(db, u("jordan"), slug, f.lesson, now);
    publishLesson(db, u("jordan"), slug, now, { notes: "The rate changed", kind: "important" });
    expect(row(lessonReport(db, u("jordan"), slug), "sam")).toMatchObject({ state: "completed", needsRefresher: true });
  });
});

describe("by person", () => {
  it("shows every lesson, path and sign-off for one person", () => {
    recordLessonCompletion(db, u("sam"), { slug, version: lesson().version }, now);
    const r = personReport(db, u("jordan"), "sam");
    expect(r.person.name).toMatch(/Sam/);
    expect(r.lessons.find((l) => l.slug === slug)).toMatchObject({ state: "completed" });
    expect(r.lessons.every((l) => l.expected || l.state !== "not_started")).toBe(true);
    expect(Array.isArray(r.paths)).toBe(true);
    expect(Array.isArray(r.signoffs)).toBe(true);
    expect(peopleOverview(db, u("jordan"), now).find((p) => p.id === "sam")!.completed).toBeGreaterThanOrEqual(1);
  });
});

describe("who can see what", () => {
  it("limits organisation admins to their own people, and learners to nothing", () => {
    const ids = peopleOverview(db, u("casey"), now).map((p) => p.id);
    expect(ids).toContain("sam");
    expect(ids).not.toContain("ash");
    expect(() => personReport(db, u("casey"), "ash")).toThrow(/not found/);
    expect(lessonReport(db, u("casey"), slug).people.every((p) => p.person.org === lessonReport(db, u("casey"), slug).people[0]?.person.org)).toBe(true);
    expect(() => lessonsOverview(db, u("sam"))).toThrow();
    expect(() => completionsCsv(db, u("sam"))).toThrow();
  });
});

describe("spreadsheet export", () => {
  it("has a row per person and lesson, quoted safely", () => {
    recordLessonCompletion(db, u("sam"), { slug, version: lesson().version }, now);
    db.prepare("UPDATE users SET name = ? WHERE id = 'ash'").run('=HYPERLINK("x")');
    const csv = completionsCsv(db, u("jordan"), slug);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toMatch(/^"Name","Email","Organisation"/);
    expect(lines.some((l) => l.startsWith('"Sam') && l.includes('"Completed"'))).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(() => completionsCsv(db, u("jordan"), "no-such-lesson")).toThrow(/not found/);
  });
});
