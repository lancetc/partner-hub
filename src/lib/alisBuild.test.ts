import { describe, expect, it } from "vitest";
import type { Card } from "@/content/lessons";
import { ALIS_MODULES, ALIS_PARTS, ALIS_PATH_QUIZ, ALIS_TOPIC_CUT, isActivity, isTopicActivity, moduleKey } from "@/content/alisCourse";
import { publishChecks, readGuideDoc } from "./magazine";
import { cleanQuizSettings } from "./pathQuizSettings";
import { chaptersOf } from "./magazineChapters";
import { MAGAZINE_BLOCK_FOR, buildGuideDoc, buildPage, buildTopic, moduleActivities, pageActivities, topicActivities } from "./alisBuild";

/* The ALIS course (docs/alis-course.md): one shared source; short Topics, a long Magazine course, the same activities. */

const pathIds = { 1: "lp-sirs-1", 2: "lp-sirs-2", 3: "lp-sirs-3" };
const words = (s: string) => s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

/** What a learner reads on a Topic's cards before the quick check: headings, text, prompts and choices (not the feedback). */
function readingWords(l: ReturnType<typeof buildTopic>) {
  return Object.values(l.nodes)
    .filter((c) => c.type !== "quiz")
    .map((c) => {
      const x = c as unknown as Record<string, unknown>;
      const options = Array.isArray(x.options) ? (x.options as { label: string }[]).map((o) => o.label) : [];
      const items = Array.isArray(x.items) ? (x.items as { text: string }[]).map((o) => o.text) : [];
      return words([x.heading, x.body, x.prompt, ...options, ...items].filter((v) => typeof v === "string").join(" "));
    })
    .reduce((a, b) => a + b, 0);
}

/** The order a learner meets a Topic's cards in, following each decision's right answer. */
function walk(l: ReturnType<typeof buildTopic>) {
  const order: string[] = [];
  for (let id: string | undefined = l.start; id;) {
    order.push(id);
    const c: Card = l.nodes[id];
    id = c.type === "decision" ? c.options.find((o) => o.correct)?.next : c.type === "summary" ? undefined : (c as { next?: string }).next;
  }
  return order;
}

describe("the shared ALIS course", () => {
  it("has 19 modules in three parts, in order, at stable slugs", () => {
    expect(ALIS_MODULES).toHaveLength(19);
    expect([1, 2, 3].map((p) => ALIS_MODULES.filter((m) => m.part === p).length)).toEqual([5, 5, 9]);
    expect(ALIS_MODULES.map((m) => `${m.part}.${m.n}`)).toEqual([
      ...[1, 2, 3, 4, 5].map((n) => `1.${n}`),
      ...[1, 2, 3, 4, 5].map((n) => `2.${n}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `3.${n}`),
    ]);
    expect(new Set(ALIS_MODULES.map((m) => m.slug)).size).toBe(19);
    for (const m of ALIS_MODULES) {
      expect(m.slug).toMatch(new RegExp(`^alis-p${m.part}-[a-z0-9-]+$`));
      expect(m.slug.length).toBeLessThanOrEqual(60);
    }
    expect(ALIS_PARTS.map((p) => p.title)).toEqual([
      "SIRS 1: Building your incident management system",
      "SIRS 2: Managing an incident from start to finish",
      "SIRS 3: Recognising and reporting incidents in home care",
    ]);
  });

  it("keeps 5 questions per module, each with one correct answer and feedback on every option", () => {
    for (const m of ALIS_MODULES) {
      expect(m.quiz, m.slug).toHaveLength(5);
      expect(new Set(m.quiz.map((q) => q.id)).size, m.slug).toBe(5);
      expect(m.quiz.filter((q) => q.from !== "new").length, m.slug).toBeGreaterThanOrEqual(3);
      for (const q of m.quiz) {
        const where = `${m.slug} ${q.id}`;
        expect(
          q.options.filter((o) => o.correct),
          where,
        ).toHaveLength(1);
        for (const o of q.options) expect(o.feedback.trim(), `${where} ${o.id}`).not.toBe("");
        expect(q.explain.trim(), where).not.toBe("");
        // Options are shuffled, so none can lean on its position.
        for (const o of q.options) expect(o.text, where).not.toMatch(/(all|none) of the above/i);
      }
    }
  });

  it("gives every module a short-form cut, and every scenario one best choice", () => {
    expect(Object.keys(ALIS_TOPIC_CUT).sort()).toEqual(ALIS_MODULES.map((m) => m.slug).sort());
    for (const m of ALIS_MODULES) {
      const ids = m.blocks.map((b) => b.id);
      expect(new Set(ids).size, m.slug).toBe(ids.length);
      for (const b of m.blocks)
        if (b.kind === "scenario")
          expect(
            b.choices.filter((c) => c.verdict === "best"),
            `${m.slug} ${b.id}`,
          ).toHaveLength(1);
      for (const b of m.blocks) if (b.kind === "sort") for (const it of b.items) expect(b.groups.map((g) => g.id)).toContain(it.group);
    }
  });

  it("gives each path a spoken introduction for Ava: under 500 characters, not the chapter's one-line summary", () => {
    for (const p of ALIS_PARTS) {
      expect(p.intro.length, p.title).toBeLessThanOrEqual(500);
      expect(p.intro.length, p.title).toBeGreaterThan(250);
      expect(p.intro, p.title).not.toBe(p.description);
      // Written to be heard: to the learner, and saying how the path ends.
      expect(p.intro, p.title).toMatch(/\byou\b/i);
      expect(p.intro, p.title).toMatch(/five-question quiz/);
    }
  });

  it("sets each path quiz to exactly 5 questions and 100%, within what the Hub allows", () => {
    expect(ALIS_PATH_QUIZ).toMatchObject({ questions: 5, passMark: 100 });
    expect(cleanQuizSettings(ALIS_PATH_QUIZ)).toEqual(ALIS_PATH_QUIZ);
  });
});

describe("short-form Topics", () => {
  it("have their own words: a brief of 80 to 140 words and a short confidence statement", () => {
    for (const m of ALIS_MODULES) {
      expect(m.short, m.slug).toBeDefined();
      expect(words(m.short!.brief), m.slug).toBeGreaterThanOrEqual(80);
      expect(words(m.short!.brief), m.slug).toBeLessThanOrEqual(140);
      expect(words(m.short!.confidence), m.slug).toBeLessThan(15);
    }
  });

  it("are short: under 450 words to read before the quick check, with something to do and a confidence rating", () => {
    for (const m of ALIS_MODULES) {
      const l = buildTopic(m);
      expect(readingWords(l), m.slug).toBeLessThanOrEqual(450);
      expect(isTopicActivity(m.blocks.find((b) => b.id === ALIS_TOPIC_CUT[m.slug].activity)!), m.slug).toBe(true);
      expect(
        Object.values(l.nodes).some((c) => c.type === "decision" || c.type === "checklist"),
        m.slug,
      ).toBe(true);
      expect(l.nodes.brief?.type, m.slug).toBe("image");
      expect(l.nodes.confidence, m.slug).toMatchObject({ type: "rating", prompt: m.short!.confidence });
    }
  });

  it("are 5 to 8 cards, with the key points and a formative quick check, and no assessment", () => {
    for (const m of ALIS_MODULES) {
      const l = buildTopic(m);
      const order = walk(l);
      expect(order.length, m.slug).toBeGreaterThanOrEqual(5);
      expect(order.length, m.slug).toBeLessThanOrEqual(8);
      expect(order.length, m.slug).toBe(Object.keys(l.nodes).length);
      expect(order).toContain("recap");
      expect(order.at(-1), m.slug).toBe("check");
      const check = l.nodes.check;
      if (check.type !== "quiz") throw new Error(m.slug);
      expect(check.assessment, m.slug).toBeUndefined();
      expect(check.questions.map((q) => q.id)).toEqual(ALIS_TOPIC_CUT[m.slug].quick);
      for (const c of Object.values(l.nodes)) expect(c.type === "quiz" && c.assessment, `${m.slug} ${c.id}`).toBeFalsy();
      const beats = order.map((id) => l.nodes[id].beat);
      expect(beats, m.slug).toEqual([...beats].sort((a, b) => a - b));
    }
  });

  it("hold one activity: a subset of the module's full set, which the Magazine page holds in full", () => {
    const doc = buildGuideDoc(ALIS_MODULES, pathIds);
    for (const m of ALIS_MODULES) {
      const all = moduleActivities(m);
      const short = topicActivities(buildTopic(m));
      expect(short, m.slug).toEqual([ALIS_TOPIC_CUT[m.slug].activity]);
      for (const a of short) expect(all, m.slug).toContain(a);
      expect(
        pageActivities(
          doc.pages.find((p) => p.id === moduleKey(m))!,
          m,
        ),
        m.slug,
      ).toEqual(all);
    }
  });
});

describe("the long-form Magazine course", () => {
  it("is one course in three chapters, each ending in a check page linked to its part's path", () => {
    const doc = buildGuideDoc(ALIS_MODULES, pathIds);
    expect(doc.pages.map((p) => p.id)).toEqual([
      "p1m1", "p1m2", "p1m3", "p1m4", "p1m5", "p1-check",
      "p2m1", "p2m2", "p2m3", "p2m4", "p2m5", "p2-check",
      "p3m1", "p3m2", "p3m3", "p3m4", "p3m5", "p3m6", "p3m7", "p3m8", "p3m9", "p3-check",
    ]); // prettier-ignore
    const quizzes = doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks).flatMap((b) => (b.type === "quiz" ? [[p.id, b.pathId]] : [])));
    expect(quizzes).toEqual([
      ["p1-check", "lp-sirs-1"],
      ["p2-check", "lp-sirs-2"],
      ["p3-check", "lp-sirs-3"],
    ]);
    for (const p of doc.pages) expect(p.required).toBe(true);
    for (const id of ["p1-check", "p2-check", "p3-check"]) expect(doc.pages.find((p) => p.id === id)!.kind).toBe("assessment");
    // Three chapters, named as the paths, each holding its modules and its check page.
    expect(chaptersOf(doc.pages).map((c) => [c.number, c.title, c.startPageId, c.pages.length])).toEqual([
      [1, ALIS_PARTS[0].title, "p1m1", 6],
      [2, ALIS_PARTS[1].title, "p2m1", 6],
      [3, ALIS_PARTS[2].title, "p3m1", 10],
    ]);
    expect(doc.pages.filter((p) => p.chapter)).toHaveLength(3);
    // Titles are the module's own, without "1.4" in front: the chapter marker and page list number them.
    for (const m of ALIS_MODULES) expect(doc.pages.find((p) => p.id === moduleKey(m))!.title).toBe(m.title);
  });

  it("uses the long-form tools: a sequence or matching in every chapter, a Job Aid, a case thread, confidence checks and a commitment to end each chapter", () => {
    const doc = buildGuideDoc(ALIS_MODULES, pathIds);
    for (const c of chaptersOf(doc.pages)) {
      const types = c.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks)).map((b) => b.type);
      expect(
        types.some((t) => t === "sequencing" || t === "matching"),
        c.title,
      ).toBe(true);
      expect(types, c.title).toContain("playbook");
      expect(types.filter((t) => t === "confidence").length, c.title).toBe(c.pages.length - 1);
      // The chapter's last module page ends with a commitment, just before the chapter check.
      const last = c.pages
        .at(-2)!
        .sections.flatMap((s) => s.blocks)
        .filter((b) => b.id.startsWith("act-"));
      expect(last.at(-1)?.type, c.title).toBe("action");
    }
    const all = doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks)).map((b) => b.type);
    expect(all).toContain("casethread");
  });

  it("turns each kind of activity into its matching block", () => {
    for (const m of ALIS_MODULES) {
      const blocks = buildPage(m).sections.flatMap((s) => s.blocks);
      for (const a of m.blocks.filter(isActivity))
        expect(blocks.find((b) => b.id === `act-${moduleKey(m)}-${a.id}`)?.type, `${m.slug} ${a.id}`).toBe(MAGAZINE_BLOCK_FOR[a.kind]);
    }
  });

  it("is valid, held back only by its verify flags, and keeps every question as draft practice", () => {
    const doc = buildGuideDoc(ALIS_MODULES, pathIds);
    expect(() => readGuideDoc(doc)).not.toThrow();
    const { blocking } = publishChecks(doc, "assessed");
    expect(blocking.length).toBeGreaterThan(0);
    for (const b of blocking) expect(b).toMatch(/needs verification/);
    expect(doc.review).toMatchObject({ enabled: false });
    expect(doc.review!.items).toHaveLength(19 * 5);
    expect(doc.review!.items.every((i) => i.status === "draft")).toBe(true);
  });

  it("marks every verify note on the Magazine block, and on the Topic card where the Topic keeps it", () => {
    const doc = buildGuideDoc(ALIS_MODULES, pathIds);
    const flagged = new Set(
      doc.pages
        .flatMap((p) => p.sections.flatMap((s) => s.blocks))
        .filter((b) => b.flag?.kind === "verify")
        .map((b) => b.id),
    );
    for (const m of ALIS_MODULES) {
      const l = buildTopic(m);
      for (const b of m.blocks.filter((x) => x.verify)) {
        expect(flagged.has(isActivity(b) ? `act-${moduleKey(m)}-${b.id}` : `${moduleKey(m)}-${b.id}`), `${m.slug} ${b.id}`).toBe(true);
        const card = l.nodes[isActivity(b) ? `act-${b.id}` : b.id] ?? Object.values(l.nodes).find((c) => c.id.startsWith(`act-${b.id}--`));
        if (card) expect(card.check?.note, `${m.slug} ${b.id}`).toMatch(/^Quality review: /);
      }
    }
  });
});
