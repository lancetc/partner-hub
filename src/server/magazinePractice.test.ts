import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { publishChecks, readGuideDoc, type GuideDoc, type PracticeItem } from "@/lib/magazine";
import { itemState, itemVersion, pickItems } from "@/lib/magazineReview";
import { pageSnapshot } from "@/lib/magazineNarration";
import { createGuide, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";
import { answerPractice, practiceMoment, practiceState, practiceStats, startPractice } from "./magazinePractice";

/* Self-review ("Test myself"): practice that never counts, built from approved questions only. */

let db: Db;
let author: User, partner: User, other: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);

const page = (id: string, words: string) => ({
  id,
  title: `Page ${id}`,
  purpose: "",
  template: "blank",
  kind: "content",
  required: true,
  allActivities: false,
  sections: [{ id: `${id}-s`, title: "S", blocks: [{ id: `${id}-t`, type: "text", body: words }] }],
});
const pages = [page("one", "Report every incident the same day."), page("two", "Never take a client's PIN or bank card.")];

/** An approved question about a page, as an author would approve it. */
function approved(id: string, pageId: string, doc = readGuideDoc({ schema: 2, pages }, { draft: true })): PracticeItem {
  const it: PracticeItem = {
    id,
    kind: "scenario",
    pageId,
    sectionId: `${pageId}-s`,
    prompt: `Question ${id}?`,
    choices: [
      { id: "a", text: "The right thing" },
      { id: "b", text: "A tempting mistake", feedback: "Not quite." },
      { id: "c", text: "Another mistake" },
    ],
    answer: "a",
    explanation: "Because the page says so.",
    status: "approved",
  };
  const pg = doc.pages.find((p) => p.id === pageId)!;
  return { ...it, basis: pageSnapshot(pg), approved: { by: "Jordan Lee", at: now.toISOString(), version: itemVersion(it) } };
}

const withReview = (items: PracticeItem[], enabled = true) => ({ schema: 2, pages, review: { enabled, items } });

function publish(items: PracticeItem[]) {
  const c = createGuide(db, author, { title: "Practice course", completion: "confirm", doc: withReview(items) }, now);
  publishGuide(db, author, c.id, "", now);
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  partner = userById(db, "riley")!;
  other = userById(db, "sam") ?? userById(db, "alex")!;
});

describe("the question bank", () => {
  it("serves only approved questions whose page and wording haven't changed since", () => {
    const doc = readGuideDoc(withReview([approved("q1", "one")]), { draft: true }) as GuideDoc;
    const q = doc.review!.items[0];
    expect(itemState(q, doc)).toBe("live");
    // Edited after approval: a draft again until approved.
    expect(itemState({ ...q, prompt: "Changed?" }, doc)).toBe("draft");
    // Its page rewritten: to check again.
    const moved = readGuideDoc({ ...withReview([q]), pages: [page("one", "Something else entirely about rosters and invoices."), pages[1]] }, { draft: true });
    expect(itemState(moved.review!.items[0], moved)).toBe("review");
    expect(itemState({ ...q, status: "retired" }, doc)).toBe("retired");
  });

  it("holds up publishing when it's on and a reading page has no approved question, and not when it's off", () => {
    const on = readGuideDoc(withReview([approved("q1", "one")]), { draft: true });
    expect(publishChecks(on, "confirm").blocking.join(" ")).toMatch(/page 2 .* has no approved questions/);
    const off = readGuideDoc(withReview([approved("q1", "one")], false), { draft: true });
    expect(publishChecks(off, "confirm").blocking.join(" ")).not.toMatch(/Self-review/);
  });

  it("rotates: unseen first, then missed a while ago, the last review's questions only when nothing else", () => {
    const pool = ["a", "b", "c", "d", "e"].map((id) => approved(id, "one"));
    const history = [
      { itemId: "a", correct: true, at: now.toISOString() },
      { itemId: "b", correct: false, at: new Date(now.getTime() - 3 * 86_400_000).toISOString() },
    ];
    const { items, repeats } = pickItems(pool, history, ["c"], now, 3, () => 0);
    expect(items.map((i) => i.id).sort()).toEqual(["b", "d", "e"]);
    expect(repeats).toBe(true);
  });
});

describe("a learner's review", () => {
  it("never reaches the reader's copy of the course with answers in it", () => {
    const c = publish([approved("q1", "one"), approved("q2", "two")]);
    const g = readGuide(db, partner, c.slug);
    expect(g.doc.review).toBeUndefined();
    expect(g.practice).toEqual({ pages: { one: 1, two: 1 } });
  });

  it("asks, saves each answer once, and never finishes a page or the course", () => {
    const c = publish(["q1", "q2", "q3"].map((id) => approved(id, "one")).concat(approved("q4", "two")));
    const g = readGuide(db, partner, c.slug);
    const s = startPractice(db, partner, c.id, { revisionId: g.revisionId, scope: "page", pageId: "one" }, now);
    expect(s.total).toBe(3);
    // Nothing gives the answer away before it's answered.
    expect(JSON.stringify(s.questions)).not.toMatch(/"answer"|explanation|Not quite/);
    const first = s.questions[0];
    const a1 = answerPractice(db, partner, c.id, { sessionId: s.id, itemId: first.id, choiceId: "b" }, later(1));
    expect(a1.session.questions[0].result).toMatchObject({ correct: false, answer: "a", feedback: "Not quite." });
    // A retry (a slow network) returns the first answer, not a second one.
    const again = answerPractice(db, partner, c.id, { sessionId: s.id, itemId: first.id, choiceId: "a" }, later(2));
    expect(again.session.questions[0].result).toMatchObject({ correct: false, choiceId: "b" });
    expect(() => answerPractice(db, partner, c.id, { sessionId: s.id, itemId: s.questions[2].id, choiceId: "a" }, later(2))).toThrow(/in order/);
    answerPractice(db, partner, c.id, { sessionId: s.id, itemId: s.questions[1].id, choiceId: "a" }, later(3));
    const done = answerPractice(db, partner, c.id, { sessionId: s.id, itemId: s.questions[2].id, choiceId: "a" }, later(4));
    expect(done.session.status).toBe("completed");
    // Practice counts for nothing else.
    const after = readGuide(db, partner, c.slug);
    expect(after.progress.finished).toEqual([]);
    expect(after.completed).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM magazine_completions").get()).toEqual({ n: 0 });
    expect(practiceState(db, partner, c.id, "one", later(5)).history[0]).toMatchObject({ total: 3, correct: 2 });
  });

  it("draws 'course so far' only from pages they've opened", () => {
    const c = publish([approved("q1", "one"), approved("q2", "two")]);
    const g = readGuide(db, partner, c.slug);
    recordGuideEvent(db, partner, c.id, { event: "page", revisionId: g.revisionId, pageId: "one" }, now);
    const s = startPractice(db, partner, c.id, { revisionId: g.revisionId, scope: "course", pageId: "one" }, now);
    expect(s.questions.map((q) => q.id)).toEqual(["q1"]);
    recordGuideEvent(db, partner, c.id, { event: "page", revisionId: g.revisionId, pageId: "two" }, later(1));
    expect(practiceState(db, partner, c.id, "two", later(1)).course).toMatchObject({ pages: 2, questions: 2 });
  });

  it("pauses and resumes, and ends a paused review safely when its next question is changed", () => {
    const c = publish(["q1", "q2"].map((id) => approved(id, "one")).concat(approved("q3", "two")));
    const g = readGuide(db, partner, c.slug);
    const s = startPractice(db, partner, c.id, { revisionId: g.revisionId, scope: "page", pageId: "one" }, now);
    answerPractice(db, partner, c.id, { sessionId: s.id, itemId: s.questions[0].id, choiceId: "a" }, later(1));
    practiceMoment(db, partner, c.id, { action: "pause", sessionId: s.id }, later(2));
    expect(practiceState(db, partner, c.id, "one", later(3)).session).toMatchObject({ status: "paused", position: 1 });
    // The author retires the next question and publishes a new edition.
    const next = s.questions[1].id;
    const doc = readGuideDoc(withReview(["q1", "q2"].map((id) => approved(id, "one")).concat(approved("q3", "two"))), { draft: true });
    doc.review!.items.find((it) => it.id === next)!.status = "retired";
    doc.review!.items.push(approved("q4", "one"));
    saveGuideDraft(db, author, c.id, { doc }, later(4));
    publishGuide(db, author, c.id, "", later(4), { moveLearners: true });
    const state = practiceState(db, partner, c.id, "one", later(5));
    expect(state.session).toBeNull();
    expect(state.changed).toBe(true);
  });

  it("is private: no one else can answer or read a learner's review; authors see totals only", () => {
    const c = publish(["q1", "q2", "q3"].map((id) => approved(id, "one")).concat(approved("q4", "two")));
    const g = readGuide(db, partner, c.slug);
    const s = startPractice(db, partner, c.id, { revisionId: g.revisionId, scope: "page", pageId: "one" }, now);
    expect(() => answerPractice(db, other, c.id, { sessionId: s.id, itemId: s.questions[0].id, choiceId: "a" }, now)).toThrow(/isn’t there/);
    expect(practiceState(db, other, c.id, "one", now).session).toBeNull();
    answerPractice(db, partner, c.id, { sessionId: s.id, itemId: s.questions[0].id, choiceId: "a" }, now);
    const stats = practiceStats(db, author, c.id);
    expect(stats).toMatchObject({ started: 1, learners: 1 });
    expect(JSON.stringify(stats)).not.toMatch(/riley/);
    expect(() => practiceStats(db, partner, c.id)).toThrow();
  });

  it("isn't there when self-review is off", () => {
    const c = createGuide(db, author, { title: "Off", completion: "confirm", doc: withReview([approved("q1", "one")], false) }, now);
    publishGuide(db, author, c.id, "", now, { allowUnverified: true });
    expect(() => practiceState(db, partner, c.id, "one", now)).toThrow(/isn’t switched on/);
    expect(readGuide(db, partner, c.slug).practice).toBeNull();
  });
});
