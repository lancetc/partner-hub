import { describe, expect, it } from "vitest";
import { cleanInterest, sampleDraftIssues, sampleLesson, sampleSlug, templateDraft, type SampleDraft } from "./sampleTopic";

const now = new Date("2026-11-16T00:00:00Z");

const good: SampleDraft = {
  title: "Talking about dementia",
  summary: "Simple ways to support someone living with dementia.",
  outcome: "Use calm, clear communication on a visit.",
  cards: [
    { type: "intro", heading: "Why it matters", body: "Many clients live with dementia.", narration: "Welcome." },
    { type: "idea", heading: "Keep it simple", body: "Short sentences help.", points: ["One idea at a time", "Give time to answer"] },
    {
      type: "quiz",
      heading: "Quick check",
      body: "One question.",
      question: "What helps most?",
      options: ["Short sentences", "Speaking quickly", "Lots of questions at once"],
      answer: 0,
      feedback: { correct: "Yes.", incorrect: "Not quite." },
    },
    { type: "summary", heading: "Recap", body: "You’ve made a start.", points: ["Keep it simple"], action: "Try one idea on your next visit." },
  ],
};

describe("cleanInterest", () => {
  it("tidies what was typed onto one line", () => {
    expect(cleanInterest("  dementia \n  care\t")).toBe("dementia care");
  });
  it("is empty for nothing usable", () => {
    expect(cleanInterest("  ")).toBe("");
    expect(cleanInterest("hi")).toBe("");
    expect(cleanInterest(42)).toBe("");
  });
  it("keeps it to 200 characters", () => {
    expect(cleanInterest("a".repeat(500))).toHaveLength(200);
  });
});

describe("sampleDraftIssues", () => {
  it("passes a good draft", () => {
    expect(sampleDraftIssues(good)).toEqual([]);
  });
  it("finds what's wrong", () => {
    expect(sampleDraftIssues(null)).toEqual(["Reply with one JSON object."]);
    expect(sampleDraftIssues({ ...good, cards: good.cards.slice(0, 2) })).toContain("Use 4 to 7 cards (there are 2).");
    const bad = structuredClone(good) as unknown as { cards: Record<string, unknown>[] };
    bad.cards[2].answer = 5;
    expect(sampleDraftIssues(bad).join(" ")).toMatch(/answer/);
    const noEnd = { ...good, cards: [...good.cards.slice(0, 3), good.cards[1]] };
    expect(sampleDraftIssues(noEnd)).toContain("The last card must be the summary.");
  });
  it("passes the offline template", () => {
    expect(sampleDraftIssues(templateDraft("gardening for older clients"))).toEqual([]);
  });
});

describe("sampleSlug", () => {
  it("is URL-safe and fits progress slugs", () => {
    const slug = sampleSlug("What’s new in Support at Home? A long title that goes on and on and on", "Ab12-CD34x");
    expect(slug).toMatch(/^[a-z0-9-]{1,80}$/);
    expect(slug.startsWith("sample-whats-new-in-support-at-home")).toBe(true);
    expect(slug.endsWith("-ab12cd34")).toBe(true);
  });
});

describe("sampleLesson", () => {
  it("makes a playable lesson: linked cards ending on the summary", () => {
    const l = sampleLesson(good, { slug: "sample-x-1", interest: "dementia", now, madeBy: "claude" });
    expect(l.start).toBe("card-1");
    expect(l.beats).toEqual(["Why it matters", "Key idea 1", "Quick check", "Recap"]);
    expect(Object.keys(l.nodes)).toHaveLength(4);
    // Follow the chain from the start.
    const seen: string[] = [];
    let at: string | undefined = l.start;
    while (at) {
      seen.push(at);
      const n = l.nodes[at] as { next?: string };
      at = n.next;
    }
    expect(seen).toEqual(["card-1", "card-2", "card-3", "card-4"]);
    expect(l.nodes["card-4"].type).toBe("summary");
    expect(l.completion).toEqual({ type: "quiz", cardId: "card-3", label: "Answer the quick check" });
    const quiz = l.nodes["card-3"];
    expect(quiz.type === "quiz" && quiz.questions[0].correct).toBe("a");
    expect(Object.values(l.nodes).every((n) => n.comments === false)).toBe(true);
  });

  it("adds a summary when the draft has none, and moves a misplaced one to the end", () => {
    const noSummary = { ...good, cards: good.cards.slice(0, 2) };
    const l = sampleLesson(noSummary, { slug: "s", interest: "x", now, madeBy: "template" });
    expect(l.nodes[`card-${Object.keys(l.nodes).length}`].type).toBe("summary");
    expect(l.completion.type).toBe("acknowledge");

    const early = { ...good, cards: [good.cards[3], good.cards[0], good.cards[1]] };
    const m = sampleLesson(early, { slug: "s", interest: "x", now, madeBy: "template" });
    expect(m.nodes["card-1"].type).toBe("image");
    expect(m.nodes["card-3"].type).toBe("summary");
  });

  it("keeps a quiz answer in range", () => {
    const off = structuredClone(good);
    (off.cards[2] as { answer: number }).answer = 9;
    const l = sampleLesson(off, { slug: "s", interest: "x", now, madeBy: "claude" });
    const quiz = l.nodes["card-3"];
    expect(quiz.type === "quiz" && quiz.questions[0].correct).toBe("c");
  });

  it("turns the template into a lesson with a quiz", () => {
    const l = sampleLesson(templateDraft("manual handling"), { slug: "s", interest: "manual handling", now, madeBy: "template" });
    expect(l.title).toBe("Getting started: manual handling");
    expect(l.completion.type).toBe("quiz");
    expect(l.owner).toMatch(/template/);
  });
});
