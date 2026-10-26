import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons } from "@/content/lessons";
import { blankLesson } from "@/content/blankLesson";
import {
  createLesson,
  deletedLessons,
  deleteLesson,
  discardDraft,
  editorLesson,
  lessonStatus,
  nextVersion,
  publishLesson,
  restoreLesson,
  saveDraft,
} from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";

/* Saving lessons from the editor: drafts stay private until published, and publishing starts a new version. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T01:00:00Z");
const later = new Date("2026-10-26T02:00:00Z");

describe("new lessons", () => {
  it("saves a draft learners can't see, then publishes it as version 1.0", () => {
    const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "Talking about money" }, now);
    expect(slug).toBe("talking-about-money");
    expect(lessonStatus(db, slug).state).toBe("unpublished");
    expect(lessons.some((l) => l.slug === slug)).toBe(false);

    const edited = { ...editorLesson(db, slug)!.lesson, summary: "When a client asks what something costs." };
    saveDraft(db, u("jordan"), slug, edited, later);
    expect(editorLesson(db, slug)!.lesson.summary).toMatch(/costs/);

    expect(publishLesson(db, u("jordan"), slug, later).version).toBe("1.0");
    expect(lessonStatus(db, slug).state).toBe("live");
    expect(lessons.find((l) => l.slug === slug)?.summary).toMatch(/costs/);
  });

  it("gives each new lesson its own address", () => {
    createLesson(db, u("jordan"), { ...blankLesson(), title: "Same name" }, now);
    expect(createLesson(db, u("jordan"), { ...blankLesson(), title: "Same name" }, now).slug).toBe("same-name-2");
    // Never clashes with an existing lesson.
    expect(createLesson(db, u("jordan"), { ...blankLesson(), title: "Legislative Framework" }, now).slug).toBe("legislative-framework-2");
  });

  it("deletes a never-published draft on discard", () => {
    const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "Scrap this" }, now);
    expect(discardDraft(db, u("jordan"), slug, now).deleted).toBe(true);
    expect(editorLesson(db, slug)).toBeUndefined();
  });
});

describe("editing a published lesson", () => {
  const slug = "legislative-framework";

  it("keeps learners on the live version until the changes are published", () => {
    const live = lessons.find((l) => l.slug === slug)!;
    saveDraft(db, u("jordan"), slug, { ...live, title: "The legislative framework" }, now);
    expect(lessonStatus(db, slug).state).toBe("changes");
    expect(lessons.find((l) => l.slug === slug)?.title).toBe("Legislative Framework");

    const r = publishLesson(db, u("jordan"), slug, later);
    expect(r.version).toBe(nextVersion(live.version, false));
    expect(lessons.find((l) => l.slug === slug)?.title).toBe("The legislative framework");
    expect(lessonStatus(db, slug).state).toBe("live");
  });

  it("can throw away saved changes", () => {
    const live = lessons.find((l) => l.slug === slug)!;
    saveDraft(db, u("jordan"), slug, { ...live, title: "Oops" }, now);
    discardDraft(db, u("jordan"), slug, later);
    expect(editorLesson(db, slug)!.lesson.title).toBe(live.title);
    expect(lessonStatus(db, slug).state).toBe("live");
  });
});

describe("checks", () => {
  it("only lets authors save, and refuses broken lessons", () => {
    expect(() => createLesson(db, u("sam"), blankLesson(), now)).toThrow();
    expect(() => createLesson(db, u("jordan"), { ...blankLesson(), title: "  " }, now)).toThrow(/title/);
    expect(() => createLesson(db, u("jordan"), { ...blankLesson(), start: "missing" }, now)).toThrow(/first card/);
    expect(() => saveDraft(db, u("jordan"), "no-such-lesson", blankLesson(), now)).toThrow(/not found/);
  });

  it("numbers versions", () => {
    expect(nextVersion("1.0-demo", false)).toBe("1.1");
    expect(nextVersion("1.9", false)).toBe("1.10");
    expect(nextVersion(undefined, true)).toBe("1.0");
  });
});

describe("deleting lessons", () => {
  const slug = "a-little-extra-time";
  // Take the lesson out of any seeded learning paths so it can be deleted.
  const clearPaths = () => db.prepare("DELETE FROM learning_path_lessons WHERE lesson_slug = ?").run(slug);

  it("won't delete a lesson that's still in a learning path", () => {
    const inPath = db.prepare("SELECT 1 FROM learning_path_lessons WHERE lesson_slug = ?").get(slug);
    if (!inPath) db.prepare("INSERT INTO learning_path_lessons VALUES ('lp-welcome', 99, ?)").run(slug);
    expect(() => deleteLesson(db, u("jordan"), slug, now)).toThrow(/learning path/);
  });

  it("hides a lesson from learners and lists it for restoring", () => {
    clearPaths();
    deleteLesson(db, u("jordan"), slug, now);
    expect(lessons.some((l) => l.slug === slug)).toBe(false);
    expect(editorLesson(db, slug)).toBeUndefined();
    expect(deletedLessons(db).map((d) => d.slug)).toEqual([slug]);
    expect(() => saveDraft(db, u("jordan"), slug, blankLesson(), now)).toThrow(/not found/);

    restoreLesson(db, u("jordan"), slug, later);
    expect(lessons.find((l) => l.slug === slug)?.title).toBe("A little extra time");
    expect(deletedLessons(db)).toEqual([]);
  });

  it("only lets authors delete", () => {
    clearPaths();
    expect(() => deleteLesson(db, u("sam"), slug, now)).toThrow();
  });
});
