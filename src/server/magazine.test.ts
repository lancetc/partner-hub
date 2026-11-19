import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { GuideDocError, activityDone, pageBlocks, publishChecks, readGuideDoc, readingMinutes, templatePage, type GuideDoc } from "@/lib/magazine";
import { seedGuides } from "@/content/magazine";
import {
  adminGuides,
  archiveGuide,
  authorGuide,
  completeGuide,
  completionGap,
  createGuide,
  duplicateGuide,
  finishPage,
  learnerGuides,
  previewGuide,
  publishGuide,
  readGuide,
  recordGuideEvent,
  restoreGuide,
  saveGuideDraft,
} from "./magazine";

/* Magazine: the course schema, who can read a course, what counts as finishing a page and completing a course, and versions. */

let db: Db;
let author: User, coordinator: User, partner: User;
const now = new Date("2026-11-19T00:00:00Z");
const later = new Date("2026-11-20T00:00:00Z");
const GUIDE = "when-an-invoice-doesnt-match";
const COURSE = "checking-supplier-invoices";

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  coordinator = userById(db, "riley")!;
  partner = userById(db, "sam")!;
});

let n = 0;
const ids = (p: string) => `${p}-${++n}`;
/** A one-page course with these blocks. */
const doc = (blocks: unknown[], page: object = {}): unknown => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "one", title: "One", blocks }], ...page }],
});
/** Work through every activity on a page: answer its decisions with their first choice, and do the rest. */
function workThrough(user: User, slug: string, pageId: string) {
  const g = readGuide(db, user, slug);
  const page = g.doc.pages.find((p) => p.id === pageId)!;
  for (const b of pageBlocks(page)) {
    if (b.type === "decision") recordGuideEvent(db, user, g.id, { event: "decision", revisionId: g.revisionId, blockId: b.id, choiceId: b.choices[0].id }, now);
    else if (b.type !== "quiz" && b.type !== "confidence" && activityDone(b, {}) === false)
      recordGuideEvent(db, user, g.id, { event: "engaged", revisionId: g.revisionId, blockId: b.id }, now);
  }
}

/** A course of pages, each with one text block. */
const course = (...pages: { id: string; required?: boolean; kind?: "assessment"; blocks?: unknown[] }[]): unknown => ({
  schema: 2,
  pages: pages.map((p) => ({
    id: p.id,
    title: `Page ${p.id}`,
    purpose: "",
    template: "do",
    kind: p.kind ?? "content",
    required: p.required !== false,
    sections: [{ id: `${p.id}-s`, title: "Section", blocks: p.blocks ?? [{ id: `${p.id}-t`, type: "text", body: "Words." }] }],
  })),
});

describe("the course schema", () => {
  it("accepts the pilot guide and course, and works out reading times", () => {
    const guide = readGuideDoc(seedGuides[0].doc);
    expect(guide.pages).toHaveLength(1);
    expect(guide.pages[0].sections.map((s) => s.id)).toEqual(["situation", "agreed", "closer", "decide", "why", "takeaways"]);
    const c = readGuideDoc(seedGuides.find((g) => g.slug === COURSE)!.doc);
    expect(c.pages.map((p) => p.template)).toEqual(["decide", "do", "notice", "decide"]);
    expect(readingMinutes(c)).toBeGreaterThan(1);
    expect(publishChecks(guide, "decision").blocking).toEqual([]);
    expect(publishChecks(c, "confirm").blocking).toEqual([]);
  });

  it("reads a guide saved on the first schema as a one-page course", () => {
    const v1 = { schema: 1, sections: [{ id: "a", title: "A", blocks: [{ id: "t", type: "text", body: "Hello" }] }] };
    expect(readGuideDoc(v1)).toMatchObject({ schema: 2, pages: [{ id: "page-1", required: true, kind: "content", sections: [{ id: "a" }] }] });
  });

  it("refuses content that could put another site's media, a script or HTML on the page", () => {
    const bad: [unknown, RegExp][] = [
      [doc([{ id: "a", type: "image", media: { src: "https://evil.example/x.png", alt: "x" }, width: "column" }]), /uploaded to the Hub/],
      [doc([{ id: "a", type: "callout", style: "tip", body: "Hi", link: { href: "javascript:alert(1)", label: "Go" } }]), /web address/],
      [doc([{ id: "a", type: "html", body: "<script>" }]), /unknown kind/],
      [
        doc([
          {
            id: "a",
            type: "decision",
            prompt: "?",
            choices: [
              { id: "x", text: "X", verdict: "risky", feedback: "No" },
              { id: "y", text: "Y", verdict: "risky", feedback: "No" },
            ],
          },
        ]),
        /best choice/,
      ],
      [
        doc([
          { id: "a", type: "text", body: "x" },
          { id: "a", type: "text", body: "y" },
        ]),
        /repeats the id/,
      ],
      [{ schema: 3, pages: [] }, /schema 3/],
    ];
    for (const [d, why] of bad) {
      expect(() => readGuideDoc(d)).toThrow(GuideDocError);
      try {
        readGuideDoc(d);
      } catch (e) {
        expect((e as GuideDocError).problems.join(" ")).toMatch(why);
      }
    }
  });

  it("drops fields it doesn't know", () => {
    const d = readGuideDoc(doc([{ id: "a", type: "text", body: "Hello", style: "color:red", onClick: "x" }]));
    expect(d.pages[0].sections[0].blocks[0]).toEqual({ id: "a", type: "text", body: "Hello" });
  });

  it("starts each teaching pattern with a different page, not the same blocks with a new label", () => {
    const kinds = (t: "decide" | "do" | "notice" | "adapt") => pageBlocks(templatePage(t, ids)).map((b) => b.type);
    expect(kinds("decide")).toContain("decision");
    expect(kinds("do")).toContain("checklist");
    expect(templatePage("notice", ids).sections[0].blocks[0]).toMatchObject({ type: "image", width: "wide", enlarge: true });
    expect(templatePage("adapt", ids).sections[0].title).toMatch(/changed/);
    expect(new Set((["decide", "do", "notice", "adapt"] as const).map((t) => JSON.stringify(kinds(t)))).size).toBe(4);
    expect(templatePage("assessment", ids)).toMatchObject({ kind: "assessment", sections: [{ blocks: [{ type: "quiz" }] }] });
  });
});

describe("who can read a course", () => {
  it("shows the pilots to coordinators and staff, and hides them from everyone else, even by address", () => {
    expect(learnerGuides(db, coordinator).map((g) => g.slug)).toEqual(expect.arrayContaining([GUIDE, COURSE]));
    expect(learnerGuides(db, author).map((g) => g.slug)).toContain(COURSE);
    expect(learnerGuides(db, partner).map((g) => g.slug)).not.toContain(GUIDE);
    expect(() => readGuide(db, partner, COURSE)).toThrow(/not found/);
    expect(() => recordGuideEvent(db, partner, "mag-checking-invoices", { event: "opened" }, now)).toThrow(/not found/);
    expect(() => finishPage(db, partner, COURSE, "x", "why-detail", now)).toThrow(/not found/);
  });

  it("labels a one-page Magazine a Guide and a longer one a Course", () => {
    const list = learnerGuides(db, coordinator);
    expect(list.find((g) => g.slug === GUIDE)).toMatchObject({ format: "Guide", pages: 1 });
    expect(list.find((g) => g.slug === COURSE)).toMatchObject({ format: "Course", pages: 4 });
  });
});

describe("finishing pages and completing a course", () => {
  it("a one-page decision guide: opening and scrolling never complete it; its question must be answered first", () => {
    const g = readGuide(db, coordinator, GUIDE);
    const revisionId = g.revisionId;
    const page = g.doc.pages[0];
    recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId }, now);
    for (const s of page.sections) recordGuideEvent(db, coordinator, g.id, { event: "section", revisionId, sectionId: s.id }, now);
    expect(readGuide(db, coordinator, GUIDE).completed).toBeNull();
    expect(() => finishPage(db, coordinator, GUIDE, revisionId, page.id, now)).toThrow(/decision question/);

    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "decision", revisionId, blockId: "decide-question", choiceId: "nope" }, now)).toThrow(
      /Choose/,
    );
    expect(recordGuideEvent(db, coordinator, g.id, { event: "decision", revisionId, blockId: "decide-question", choiceId: "approve" }, now)).toMatchObject({
      verdict: "risky",
      attempt: 1,
    });
    expect(recordGuideEvent(db, coordinator, g.id, { event: "decision", revisionId, blockId: "decide-question", choiceId: "itemise" }, now)).toMatchObject({
      verdict: "best",
      attempt: 2,
    });
    expect(readGuide(db, coordinator, GUIDE).progress).toMatchObject({
      lastPage: page.id,
      lastSection: "takeaways",
      answers: { "decide-question": "itemise" },
    });

    // Its job aid is an activity too: every item ticked.
    expect(() => finishPage(db, coordinator, GUIDE, revisionId, page.id, now)).toThrow(/every activity on this page first: checklist/);
    workThrough(coordinator, GUIDE, page.id);
    expect(finishPage(db, coordinator, GUIDE, revisionId, page.id, now)).toMatchObject({ finished: [page.id], completed: { kind: "completed" } });
    expect(readGuide(db, coordinator, GUIDE).completed).toMatchObject({ kind: "completed", thisRevision: true });
    expect(learnerGuides(db, coordinator).find((x) => x.slug === GUIDE)?.state).toBe("completed");
    const events = db.prepare("SELECT event FROM magazine_events WHERE user_id = 'riley' ORDER BY id").all() as { event: string }[];
    expect(events.map((e) => e.event)).toEqual(
      expect.arrayContaining(["course.started", "section.visited", "decision.answered", "page.finished", "course.completed"]),
    );
  });

  it("a course completes when every required page is finished, and moving between pages finishes nothing", () => {
    const g = readGuide(db, coordinator, COURSE);
    for (const p of g.doc.pages) recordGuideEvent(db, coordinator, g.id, { event: "page", revisionId: g.revisionId, pageId: p.id }, now);
    expect(readGuide(db, coordinator, COURSE).progress).toMatchObject({ finished: [], lastPage: "make-the-call" });
    for (const p of g.doc.pages.slice(0, 3)) {
      workThrough(coordinator, COURSE, p.id);
      expect(finishPage(db, coordinator, COURSE, g.revisionId, p.id, now).completed).toBeNull();
    }
    expect(completionGap(readGuide(db, coordinator, COURSE))).toMatch(/1 more required page/);
    expect(() => completeGuide(db, coordinator, COURSE, g.revisionId, now)).toThrow(/1 more required page/);
    workThrough(coordinator, COURSE, "make-the-call");
    expect(finishPage(db, coordinator, COURSE, g.revisionId, "make-the-call", now).completed).toMatchObject({ kind: "completed" });
    const finished = db.prepare("SELECT page_id FROM magazine_events WHERE event = 'page.finished' AND user_id = 'riley' ORDER BY id").all() as {
      page_id: string;
    }[];
    expect(finished.map((r) => r.page_id)).toEqual(["why-detail", "what-to-check", "read-invoice", "make-the-call"]);
  });

  it("asks readers to work through every activity on a page before finishing it, unless the author turns that off", () => {
    const blocks = [
      { id: "t", type: "text", body: "Words only." },
      {
        id: "cards",
        type: "flashcards",
        cards: [
          { id: "c1", front: "A", back: "a" },
          { id: "c2", front: "B", back: "b" },
        ],
      },
    ];
    const c = createGuide(db, author, { title: "Activities", completion: "confirm", doc: doc(blocks) }, now);
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, coordinator, c.slug);
    expect(() => finishPage(db, coordinator, c.slug, g.revisionId, "p1", now)).toThrow(/every activity on this page first: flashcards/);
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "engaged", revisionId: g.revisionId, blockId: "t" }, now)).toThrow(/isn’t in this course/);
    recordGuideEvent(db, coordinator, g.id, { event: "engaged", revisionId: g.revisionId, blockId: "cards" }, now);
    expect(readGuide(db, coordinator, c.slug).progress.answers).toMatchObject({ "done:cards": "1" });
    expect(finishPage(db, coordinator, c.slug, g.revisionId, "p1", now).completed).toMatchObject({ kind: "completed" });

    // Turned off for a page: it can be finished straight away.
    const off = createGuide(db, author, { title: "Optional activities", completion: "confirm", doc: doc(blocks, { allActivities: false }) }, now);
    publishGuide(db, author, off.id, "", now);
    expect(finishPage(db, coordinator, off.slug, readGuide(db, coordinator, off.slug).revisionId, "p1", now).completed).toMatchObject({ kind: "completed" });
  });

  it("optional pages never hold up completion", () => {
    const c = createGuide(db, author, { title: "With an extra", completion: "confirm", doc: course({ id: "main" }, { id: "extra", required: false }) }, now);
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, coordinator, c.slug);
    expect(finishPage(db, coordinator, c.slug, g.revisionId, "main", now).completed).toMatchObject({ kind: "completed" });
  });

  it("refuses records against an edition the reader no longer has", () => {
    const g = readGuide(db, coordinator, GUIDE);
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId: "old" }, now)).toThrow(/updated/);
    expect(() => finishPage(db, coordinator, GUIDE, "old", "page-1", now)).toThrow(/updated/);
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "page", revisionId: g.revisionId, pageId: "nope" }, now)).toThrow(/isn’t in this course/);
  });

  it("an assessed course completes only through the path quiz, and its assessment page needs the quiz passed", () => {
    const c = createGuide(
      db,
      author,
      {
        title: "Assessed course",
        completion: "assessed",
        doc: course({ id: "read" }, { id: "check", kind: "assessment", blocks: [{ id: "q", type: "quiz", pathId: "lp-care-coordination" }] }),
      },
      now,
    );
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, coordinator, c.slug);
    finishPage(db, coordinator, c.slug, g.revisionId, "read", now);
    expect(() => finishPage(db, coordinator, c.slug, g.revisionId, "check", now)).toThrow(/quiz/);
    expect(() => completeGuide(db, coordinator, c.slug, g.revisionId, now)).toThrow(/quiz/);
  });

  it("a reference course is marked read, not completed", () => {
    const c = createGuide(db, author, { title: "Look it up", completion: "reference", doc: course({ id: "a" }, { id: "b" }) }, now);
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, coordinator, c.slug);
    expect(completeGuide(db, coordinator, c.slug, g.revisionId, now)).toMatchObject({ kind: "acknowledged" });
    expect(learnerGuides(db, coordinator).find((x) => x.slug === c.slug)?.state).toBe("started");
  });
});

describe("authoring and versions", () => {
  const draft = (extra: object = {}): unknown =>
    doc([
      { id: "intro", type: "text", body: "Before you start." },
      { id: "pic", type: "image", media: { src: "/images/magazine/agreed-services.svg", alt: "" }, width: "wide" },
      { id: "claim", type: "text", body: "The rule is X.", flag: { kind: "verify", note: "Check with Finance." }, ...extra },
    ]);

  it("holds publishing until claims are verified and pictures described", () => {
    expect(() => createGuide(db, coordinator, { title: "Mine" }, now)).toThrow(/authors/);
    const g = createGuide(db, author, { title: "Calling a supplier", completion: "confirm", audience: ["coordinator"], doc: draft() }, now);
    expect(g.slug).toBe("calling-a-supplier");
    expect(g.checks.blocking).toHaveLength(2);
    expect(() => publishGuide(db, author, g.id, "", now)).toThrow(/Resolve 2 checks/);
    expect(() => readGuide(db, coordinator, g.slug)).toThrow(/not found/);

    const fixed = readGuideDoc(draft()) as GuideDoc;
    fixed.pages[0].sections[0].blocks = fixed.pages[0].sections[0].blocks.map((b) =>
      b.type === "image" ? { ...b, media: { ...b.media, alt: "Agreed services" } } : { ...b, flag: undefined },
    );
    saveGuideDraft(db, author, g.id, { doc: fixed }, now);
    expect(publishGuide(db, author, g.id, "First edition", now)).toMatchObject({ status: "published", checks: { blocking: [] } });
    expect(readGuide(db, coordinator, g.slug).revision).toBe(1);
  });

  it("keeps completions with the edition read when a course is republished", () => {
    const g = createGuide(db, author, { title: "Short read", completion: "confirm", doc: doc([{ id: "t", type: "text", body: "One." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    const r1 = readGuide(db, coordinator, g.slug).revisionId;
    finishPage(db, coordinator, g.slug, r1, "p1", now);

    // The author edits: learners still read edition 1 until it's published, and it stays listed.
    saveGuideDraft(db, author, g.id, { doc: doc([{ id: "t", type: "text", body: "One, revised." }]) }, later);
    expect(authorGuide(db, author, g.id)).toMatchObject({ status: "published", changed: true });
    expect(learnerGuides(db, coordinator).map((x) => x.slug)).toContain(g.slug);
    expect(readGuide(db, coordinator, g.slug).doc.pages[0].sections[0].blocks[0]).toMatchObject({ body: "One." });
    publishGuide(db, author, g.id, "Revised", later);

    // They'd completed edition 1, so they read the new one; that completion is kept.
    const after = readGuide(db, coordinator, g.slug);
    expect(after.revision).toBe(2);
    expect(after.completed).toMatchObject({ thisRevision: false });
    const rows = db.prepare("SELECT revision_id FROM magazine_completions WHERE guide_id = ? AND user_id = 'riley'").all(g.id) as { revision_id: string }[];
    expect(rows.map((r) => r.revision_id)).toEqual([r1]);
    finishPage(db, coordinator, g.slug, after.revisionId, "p1", later);
    expect((db.prepare("SELECT COUNT(*) AS n FROM magazine_completions WHERE guide_id = ?").get(g.id) as { n: number }).n).toBe(2);
  });

  it("someone part-way through keeps the edition they started, unless the author moves them", () => {
    const g = createGuide(db, author, { title: "Two pages", completion: "confirm", doc: course({ id: "a" }, { id: "b" }) }, now);
    publishGuide(db, author, g.id, "", now);
    const r1 = readGuide(db, coordinator, g.slug).revisionId;
    finishPage(db, coordinator, g.slug, r1, "a", now);
    saveGuideDraft(db, author, g.id, { doc: course({ id: "a" }, { id: "b" }, { id: "c" }) }, later);
    publishGuide(db, author, g.id, "A third page", later);
    const mine = readGuide(db, coordinator, g.slug);
    expect(mine).toMatchObject({ revisionId: r1, olderEdition: true, progress: { finished: ["a"] } });
    expect(mine.doc.pages).toHaveLength(2);
    // Someone new gets the new edition.
    expect(readGuide(db, userById(db, "dana")!, g.slug).doc.pages).toHaveLength(3);

    saveGuideDraft(db, author, g.id, { standfirst: "Material change" }, later);
    publishGuide(db, author, g.id, "Material", later, { moveLearners: true });
    expect(readGuide(db, coordinator, g.slug)).toMatchObject({ revision: 3, olderEdition: false, progress: { finished: [] } });
  });

  it("grows a one-page guide into a course, keeping its address and records", () => {
    const g = createGuide(db, author, { title: "Grows", completion: "confirm", doc: doc([{ id: "t", type: "text", body: "One." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    finishPage(db, coordinator, g.slug, readGuide(db, coordinator, g.slug).revisionId, "p1", now);
    const grown = readGuideDoc(authorGuide(db, author, g.id).doc);
    grown.pages[0].title = "First";
    grown.pages.push({ ...templatePage("blank", ids), title: "Second" });
    grown.pages[1].sections[0].blocks = [{ id: "t2", type: "text", body: "Two." }];
    saveGuideDraft(db, author, g.id, { doc: grown }, later);
    const after = publishGuide(db, author, g.id, "Second page", later);
    expect(after).toMatchObject({ id: g.id, slug: g.slug });
    expect(learnerGuides(db, coordinator).find((x) => x.id === g.id)).toMatchObject({ format: "Course", pages: 2 });
    expect((db.prepare("SELECT COUNT(*) AS n FROM magazine_completions WHERE guide_id = ?").get(g.id) as { n: number }).n).toBe(1);
  });
});

describe("the editor", () => {
  it("starts a new course on the chosen teaching pattern", () => {
    const g = createGuide(db, author, { title: "Working title", template: "notice" }, now);
    expect(g.doc.pages).toHaveLength(1);
    expect(g.doc.pages[0]).toMatchObject({ template: "notice", required: true });
    expect(g.doc.pages[0].sections.map((s) => s.title)).toEqual([
      "The example",
      "What to notice",
      "Why it matters",
      "Your turn",
      "What you should have spotted",
    ]);
  });

  it("saves a draft while it's still unfinished, and lists what's left before it can be published", () => {
    const g = createGuide(db, author, { title: "Working title", template: "do" }, now);
    const half = doc([
      { id: "q", type: "decision", prompt: "", choices: [{ id: "c1", text: "", verdict: "best", feedback: "" }] },
      { id: "pic", type: "image", media: { src: "", alt: "" }, width: "wide" },
      { id: "list", type: "checklist", title: "", items: [""] },
    ]);
    const saved = saveGuideDraft(db, author, g.id, { title: "", doc: half }, now);
    expect(saved.title).toBe("");
    expect(saved.checks.blocking.join(" ")).toMatch(/Give the guide a title/);
    expect(saved.checks.blocking.join(" ")).toMatch(/question is missing/);
    expect(saved.checks.blocking.join(" ")).toMatch(/at least 2 choices/);
    expect(() => publishGuide(db, author, g.id, "", now)).toThrow(/Resolve/);
    expect(() =>
      saveGuideDraft(db, author, g.id, { doc: doc([{ id: "x", type: "image", media: { src: "https://x.test/a.png", alt: "" }, width: "column" }]) }, now),
    ).toThrow(/uploaded to the Hub/);
  });

  it("asks for page titles in a course, a quiz on an assessment page, and at least one required page", () => {
    const g = createGuide(
      db,
      author,
      { title: "Checks", doc: course({ id: "a" }, { id: "b", kind: "assessment", blocks: [{ id: "x", type: "text", body: "No quiz" }] }) },
      now,
    );
    const untitled = readGuideDoc(authorGuide(db, author, g.id).doc);
    untitled.pages[0].title = "";
    untitled.pages.forEach((p) => (p.required = false));
    const out = saveGuideDraft(db, author, g.id, { doc: untitled }, now).checks.blocking.join(" ");
    expect(out).toMatch(/Page 1 needs a title/);
    expect(out).toMatch(/assessment page needs a quiz/);
    expect(out).toMatch(/at least one page required/);
  });

  it("previews the saved draft without recording anything, and lists courses for authors only", () => {
    const g = createGuide(db, author, { title: "Preview me", doc: doc([{ id: "t", type: "text", body: "Draft words." }]) }, now);
    const p = previewGuide(db, author, g.id);
    expect(p).toMatchObject({ revisionId: "draft", revision: 1, completed: null, progress: { answers: {}, finished: [] } });
    expect(p.doc.pages[0].sections[0].blocks[0]).toMatchObject({ body: "Draft words." });
    expect(() => previewGuide(db, coordinator, g.id)).toThrow(/authors/);
    expect(() => adminGuides(db, coordinator)).toThrow(/authors/);
    expect(adminGuides(db, author).find((x) => x.id === g.id)).toMatchObject({ status: "draft", changed: true, publishedNumber: null, format: "Guide" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM magazine_events").get() as { n: number }).n).toBe(0);
  });

  it("knows when the draft differs from the published edition", () => {
    const g = createGuide(db, author, { title: "Edition check", doc: doc([{ id: "t", type: "text", body: "One." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    expect(authorGuide(db, author, g.id)).toMatchObject({ changed: false, publishedNumber: 1 });
    saveGuideDraft(db, author, g.id, { standfirst: "New standfirst" }, later);
    expect(authorGuide(db, author, g.id).changed).toBe(true);
  });

  it("doesn't report changes for an edition published on the first schema", () => {
    const g = createGuide(db, author, { title: "Old edition", doc: doc([{ id: "t", type: "text", body: "One." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    const v1 = { schema: 1, sections: [{ id: "one", title: "One", blocks: [{ id: "t", type: "text", body: "One." }] }] };
    db.prepare("UPDATE magazine_revisions SET doc = ? WHERE guide_id = ?").run(JSON.stringify(v1), g.id);
    db.prepare("UPDATE magazine_guides SET draft = ? WHERE id = ?").run(JSON.stringify(v1), g.id);
    expect(authorGuide(db, author, g.id).changed).toBe(false);
  });

  it("counts who finished each page of the live edition", () => {
    const g = readGuide(db, coordinator, COURSE);
    workThrough(coordinator, COURSE, "why-detail");
    finishPage(db, coordinator, COURSE, g.revisionId, "why-detail", now);
    expect(authorGuide(db, author, g.id).finishes).toEqual({ "why-detail": 1 });
  });

  it("duplicates, archives and restores a course", () => {
    const g = createGuide(db, author, { title: "Original", doc: doc([{ id: "t", type: "text", body: "One." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    const copy = duplicateGuide(db, author, g.id, now);
    expect(copy).toMatchObject({ title: "Original (copy)", status: "draft", publishedNumber: null });
    expect(copy.doc).toEqual(authorGuide(db, author, g.id).doc);
    archiveGuide(db, author, g.id, now);
    expect(() => readGuide(db, coordinator, g.slug)).toThrow(/not found/);
    expect(restoreGuide(db, author, g.id, now).status).toBe("published");
    expect(readGuide(db, coordinator, g.slug).title).toBe("Original");
  });
});
