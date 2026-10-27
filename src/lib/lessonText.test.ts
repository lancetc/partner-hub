import { describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { applyText, extractText } from "./lessonText";

/* Pulling a lesson's learner-facing text out for translation, and putting translations back. */

const lf = lessons.find((l) => l.slug === "legislative-framework")!;

describe("lesson text", () => {
  const text = extractText(lf);

  it("finds what learners read, but never ids, links, settings or narration", () => {
    expect(text).toContain(lf.title);
    expect(text).toContain(lf.nodes.check.heading);
    expect(text.some((t) => t.startsWith("http"))).toBe(false);
    expect(text).not.toContain("legislative-framework");
    expect(text).not.toContain("quiz");
    const quiz = lf.nodes.check;
    if (quiz.type === "quiz") {
      expect(text).toContain(quiz.questions[0].options[0].label);
      expect(text).toContain(quiz.questions[0].feedback.correct);
      expect(text).not.toContain(quiz.questions[0].correct);
    }
    const narrated = Object.values(lf.nodes).find((n) => n.type === "audio");
    if (narrated?.type === "audio") expect(text).not.toContain(narrated.script);
  });

  it("puts translations back without changing how the lesson works", () => {
    const fake = Object.fromEntries(text.map((t) => [t, `[vi] ${t}`]));
    const out = applyText(lf, fake);
    expect(out.title).toBe(`[vi] ${lf.title}`);
    expect(Object.keys(out.nodes)).toEqual(Object.keys(lf.nodes));
    expect(out.start).toBe(lf.start);
    for (const [id, card] of Object.entries(out.nodes)) {
      expect(card.id).toBe(id);
      expect(card.type).toBe(lf.nodes[id].type);
      if ("next" in card) expect(card.next).toBe((lf.nodes[id] as { next?: string }).next);
    }
    const quiz = out.nodes.check;
    if (quiz.type === "quiz" && lf.nodes.check.type === "quiz") expect(quiz.questions[0].correct).toBe(lf.nodes.check.questions[0].correct);
    // The original is untouched.
    expect(lf.title).not.toMatch(/^\[vi\]/);
  });

  it("translates a picture's alt text and caption, but not its address", () => {
    const base = lessons[0];
    const first = Object.keys(base.nodes)[0];
    const withFigure = {
      ...base,
      nodes: {
        ...base.nodes,
        [first]: {
          ...base.nodes[first],
          figure: { src: "/api/uploads/form.png", width: 800, height: 600, alt: "The incident form", caption: "Page one of the form" },
        },
      },
    };
    const text = extractText(withFigure);
    expect(text).toEqual(expect.arrayContaining(["The incident form", "Page one of the form"]));
    expect(text).not.toContain("/api/uploads/form.png");
  });
});
