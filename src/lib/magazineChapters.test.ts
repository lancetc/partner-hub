import { describe, expect, it } from "vitest";
import { GuideDocError, readGuideDoc, type GuideDoc, type Page } from "./magazine";
import { chapterLabel, chapterOf, chaptersOf, hasChapters, pageGroups } from "./magazineChapters";
import { quizGap } from "./magazineQuizzes";

/* Chapters in a Magazine course, and an assessed course with a quiz per chapter. */

const page = (id: string, extra: Partial<Page> = {}): Page => ({
  id,
  title: `Page ${id}`,
  purpose: "",
  template: "blank",
  kind: "content",
  required: true,
  sections: [{ id: `${id}-s`, title: "Section", blocks: [{ id: `${id}-t`, type: "text", body: "Words." }] }],
  ...extra,
});
const quizPage = (id: string, pathId: string): Page => ({
  ...page(id),
  kind: "assessment",
  sections: [{ id: `${id}-s`, title: "Quiz", blocks: [{ id: `${id}-quiz`, type: "quiz", pathId }] }],
});
const doc = (pages: Page[]): GuideDoc => ({ schema: 2, pages });

describe("chapters", () => {
  it("groups pages under the page that starts each chapter, until the next", () => {
    const pages = [
      page("intro"),
      page("a", { chapter: { title: "Building your IMS", intro: "Start here." } }),
      page("b"),
      page("c", { chapter: { title: "Managing an incident" } }),
      page("d"),
    ];
    expect(pageGroups(pages).map((g) => [g.chapter?.title ?? null, g.pages.map((p) => p.id)])).toEqual([
      [null, ["intro"]],
      ["Building your IMS", ["a", "b"]],
      ["Managing an incident", ["c", "d"]],
    ]);
    expect(chaptersOf(pages).map((c) => [c.number, c.startPageId, c.intro])).toEqual([
      [1, "a", "Start here."],
      [2, "c", undefined],
    ]);
    expect(chapterOf(pages, "d")?.number).toBe(2);
    expect(chapterOf(pages, "intro")).toBeNull();
    expect(chapterLabel(chapterOf(pages, "b")!)).toBe("Chapter 1 · Building your IMS");
  });

  it("leaves a course without chapter markers exactly as it was", () => {
    const pages = [page("a"), page("b")];
    expect(hasChapters(pages)).toBe(false);
    expect(chaptersOf(pages)).toEqual([]);
    expect(pageGroups(pages)).toEqual([{ chapter: null, pages }]);
    const read = readGuideDoc(doc(pages));
    expect(read.pages.map((p) => Object.keys(p).includes("chapter"))).toEqual([false, false]);
    expect(read.pages).toEqual(pages);
  });

  it("keeps a chapter through validation, and checks it", () => {
    const read = readGuideDoc(doc([page("a", { chapter: { title: "  One  ", intro: "Why it matters." } }), page("b")]));
    expect(read.pages[0].chapter).toEqual({ title: "One", intro: "Why it matters." });
    // An untitled chapter is fine in a draft but can't be published.
    expect(readGuideDoc(doc([page("a", { chapter: { title: "" } }), page("b")]), { draft: true }).pages[0].chapter).toEqual({ title: "" });
    expect(() => readGuideDoc(doc([page("a", { chapter: { title: "" } }), page("b")]))).toThrow(GuideDocError);
    expect(() => readGuideDoc(doc([page("a", { chapter: "One" as unknown as Page["chapter"] }), page("b")]), { draft: true })).toThrow(/chapter should be/);
    expect(() => readGuideDoc(doc([page("a", { chapter: { title: "x".repeat(121) } }), page("b")]), { draft: true })).toThrow(/longer than 120/);
  });
});

describe("an assessed course's quizzes", () => {
  const passed = (ids: string[], all: string[]) => Object.fromEntries(all.map((id) => [id, { passed: ids.includes(id), pathName: id }]));

  it("with one quiz, behaves as before", () => {
    const d = doc([page("a"), quizPage("q", "lp-1")]);
    expect(quizGap(d, passed([], ["q-quiz"]))).toBe("Pass the quiz first.");
    expect(quizGap(d, passed(["q-quiz"], ["q-quiz"]))).toBeNull();
    // A quiz whose path has gone still holds the course, as it always has.
    expect(quizGap(d, { "q-quiz": null })).toBe("Pass the quiz first.");
  });

  it("with a quiz per chapter, needs every one, and says which are left", () => {
    const d = doc([
      page("a", { chapter: { title: "One" } }),
      quizPage("q1", "lp-1"),
      page("b", { chapter: { title: "Two" } }),
      quizPage("q2", "lp-2"),
      page("c", { chapter: { title: "Three" } }),
      quizPage("q3", "lp-3"),
    ]);
    const all = ["q1-quiz", "q2-quiz", "q3-quiz"];
    expect(quizGap(d, passed(["q1-quiz"], all))).toBe("Pass all the quizzes first: Chapter 2, Chapter 3.");
    expect(quizGap(d, passed(["q1-quiz", "q3-quiz"], all))).toBe("Pass all the quizzes first: Chapter 2.");
    expect(quizGap(d, passed(all, all))).toBeNull();
    // A quiz whose path has gone is left out.
    expect(quizGap(d, { "q1-quiz": { passed: true }, "q2-quiz": null, "q3-quiz": { passed: true } })).toBeNull();
  });
});
