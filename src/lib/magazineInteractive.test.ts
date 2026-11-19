import { describe, expect, it } from "vitest";
import { GuideDocError, pageMinutes, publishChecks, readGuideDoc, templatePage, type Block } from "./magazine";

/* The Magazine's interactive blocks: what each keeps, what a draft may leave unfinished, and what publishing needs. */

const withBlocks = (...blocks: object[]): unknown => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks }] }],
});
const first = (block: object, draft = false) => readGuideDoc(withBlocks({ id: "b", ...block }), { draft }).pages[0].sections[0].blocks[0] as Block;
const blocking = (block: object) => publishChecks(readGuideDoc(withBlocks({ id: "b", ...block }), { draft: true }), "confirm").blocking.join(" ");
const PIC = "/images/magazine/invoice-annotated.svg";

describe("flashcards, tabs, a timeline and process steps", () => {
  it("keeps each card's front and back, and a picture only once one is chosen", () => {
    const b = first({
      type: "flashcards",
      cards: [
        { id: "c1", front: "Personal care", back: "Help with showering and dressing." },
        { id: "c2", front: "Domestic assistance", back: "Cleaning.", media: { src: "", alt: "" } },
        { id: "c3", front: "Meals", back: "Delivered meals.", media: { src: PIC, alt: "A meal" } },
      ],
    });
    expect(b).toMatchObject({ type: "flashcards", cards: [{ id: "c1" }, { id: "c2" }, { id: "c3", media: { src: PIC } }] });
    expect((b as Extract<Block, { type: "flashcards" }>).cards[1]).not.toHaveProperty("media");
    expect(blocking({ type: "flashcards", cards: [{ id: "c1", front: "", back: "" }] })).toMatch(/card 1 front is missing/);
  });

  it("needs at least two tabs, events and steps to publish", () => {
    expect(blocking({ type: "tabs", tabs: [{ id: "t1", label: "Self Managed", body: "You arrange it." }] })).toMatch(/at least 2 tabs/);
    expect(blocking({ type: "timeline", events: [{ id: "e1", when: "Day 1", title: "Referral", body: "" }] })).toMatch(/at least 2 events/);
    expect(blocking({ type: "process", steps: [{ id: "s1", title: "Make them safe", body: "" }] })).toMatch(/at least 2 steps/);
    const tabs = first({
      type: "tabs",
      tabs: [
        { id: "t1", label: "Self Managed", body: "You arrange services. ".repeat(60) },
        { id: "t2", label: "Fully Coordinated", body: "We arrange services." },
      ],
    });
    expect(tabs).toMatchObject({ tabs: [{ label: "Self Managed" }, { label: "Fully Coordinated" }] });
    expect(pageMinutes(readGuideDoc(withBlocks(tabs)).pages[0])).toBeGreaterThanOrEqual(1);
  });

  it("refuses two items with the same id", () => {
    expect(() =>
      first({
        type: "process",
        steps: [
          { id: "s1", title: "A", body: "" },
          { id: "s1", title: "B", body: "" },
        ],
      }),
    ).toThrow(GuideDocError);
  });
});

describe("a branching scenario", () => {
  const story = (scenes: object[]) => ({ type: "branching", title: "A complaint", scenes });
  const start = {
    id: "s1",
    text: "Mrs Lee is upset.",
    choices: [
      { id: "go-a", text: "Listen first", next: "s2" },
      { id: "go-b", text: "Explain the policy", next: "s3" },
    ],
  };

  it("keeps scenes, choices and endings; an ending has no choices", () => {
    const b = first(
      story([
        start,
        {
          id: "s2",
          text: "She calms down.",
          ending: { outcome: "good", summary: "Listening first helped." },
          choices: [{ id: "x", text: "ignored", next: "s1" }],
        },
        { id: "s3", text: "She escalates.", ending: { outcome: "awful", summary: "Lead with empathy." } },
      ]),
    ) as Extract<Block, { type: "branching" }>;
    expect(b.scenes[1]).toEqual({ id: "s2", text: "She calms down.", choices: [], ending: { outcome: "good", summary: "Listening first helped." } });
    expect(b.scenes[2].ending?.outcome).toBe("poor");
  });

  it("refuses a choice that leads to a scene that isn't there, and needs an ending to publish", () => {
    expect(() => first(story([start, { id: "s2", text: "x", ending: { outcome: "good", summary: "y" } }]), true)).toThrow(/isn’t there/);
    const noEnd = story([
      { id: "s1", text: "Start", choices: [{ id: "go", text: "Go", next: "s2" }] },
      { id: "s2", text: "More", choices: [{ id: "back", text: "Back", next: "s1" }] },
    ]);
    expect(blocking(noEnd)).toMatch(/at least one ending/);
  });
});

describe("a conversation simulator", () => {
  it("needs two responses a turn, one of them best, and keeps the person's replies", () => {
    const turn = (responses: object[]) => ({
      type: "conversation",
      person: "Anna",
      role: "Daughter",
      setting: "On the phone",
      turns: [{ id: "t1", line: "Why do we pay?", responses }],
    });
    const b = first(
      turn([
        { id: "r1", text: "Let me explain how it works.", verdict: "best", feedback: "Clear and calm.", reply: "Okay." },
        { id: "r2", text: "It's the rules.", verdict: "nonsense", feedback: "Dismissive." },
      ]),
    ) as Extract<Block, { type: "conversation" }>;
    expect(b.turns[0].responses.map((r) => [r.verdict, r.reply])).toEqual([
      ["best", "Okay."],
      ["risky", ""],
    ]);
    expect(blocking(turn([{ id: "r1", text: "Hi", verdict: "acceptable", feedback: "Fine." }]))).toMatch(/at least 2 responses[\s\S]*best response/);
  });

  it("is the conversation in the Say template", () => {
    const page = templatePage("say", (p) => `${p}-1`);
    expect(page.template).toBe("say");
    expect(page.sections.flatMap((s) => s.blocks.map((b) => b.type))).toContain("conversation");
  });
});

describe("spot the mistake", () => {
  it("keeps the markers within the picture and asks for a description", () => {
    const b = first({
      type: "spot",
      prompt: "Find the errors",
      media: { src: PIC, alt: "" },
      mistakes: [{ id: "m1", x: 140, y: -5, label: "Wrong GST", explanation: "Care is GST free." }],
    }) as Extract<Block, { type: "spot" }>;
    expect(b.mistakes[0]).toMatchObject({ x: 100, y: 0 });
    expect(blocking({ type: "spot", prompt: "Find the errors", media: { src: PIC, alt: "" }, mistakes: b.mistakes })).toMatch(/describe|description/i);
    expect(blocking({ type: "spot", prompt: "Find them", media: { src: PIC, alt: "An invoice" }, mistakes: [] })).toMatch(/at least one mistake/);
  });
});

describe("confidence, reflection and the budget", () => {
  it("compares a later confidence check with an earlier one that exists", () => {
    const before = { id: "c1", type: "confidence", statement: "How confident are you with incidents?" };
    const after = { id: "c2", type: "confidence", statement: "And now?", compareWith: "c1" };
    const d = readGuideDoc(withBlocks(before, after));
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({ low: "Not confident", high: "Very confident" });
    expect(d.pages[0].sections[0].blocks[1]).toMatchObject({ compareWith: "c1" });
    const lost = publishChecks(readGuideDoc(withBlocks({ ...after, compareWith: "gone" }), { draft: true }), "confirm");
    expect([...lost.blocking, ...lost.suggestions].join(" ")).toMatch(/compare/i);
  });

  it("keeps a reflection's guidance for the AI feedback, and suggests guidance when there's none", () => {
    expect(first({ type: "reflection", prompt: "How would you handle it?", guidance: "Dignity of risk.", minWords: 900 })).toMatchObject({
      minWords: 300,
      guidance: "Dignity of risk.",
    });
    expect(
      publishChecks(readGuideDoc(withBlocks({ id: "r", type: "reflection", prompt: "Why?", guidance: "", minWords: 0 })), "confirm").suggestions.join(" "),
    ).toMatch(/guidance|good answer/i);
  });

  it("keeps a budget's services within their limits", () => {
    const b = first({
      type: "budget",
      title: "Margaret's quarter",
      budget: 6000,
      weeks: 99,
      services: [{ id: "v1", name: "Personal care", unit: "hour", cost: 75, perWeek: 12.3, max: 10 }],
    }) as Extract<Block, { type: "budget" }>;
    expect(b.weeks).toBe(52);
    expect(b.services[0].perWeek).toBe(10);
    expect(() => first({ type: "budget", title: "", budget: 0, weeks: 13, services: [] })).toThrow(GuideDocError);
  });
});

describe("hotspots, sorting, sequencing, matching and fill in the blank", () => {
  it("reads the gaps in a fill-in-the-blank, with other accepted answers", async () => {
    const { blanksOf, sameAnswer } = await import("./magazine");
    expect(blanksOf("Report within [[24 hours|a day]] to the [[Commission]].")).toEqual([
      { text: "Report within " },
      { answers: ["24 hours", "a day"] },
      { text: " to the " },
      { answers: ["Commission"] },
      { text: "." },
    ]);
    expect(sameAnswer("  The  commission. ", "the commission")).toBe(true);
    expect(sameAnswer("", "x")).toBe(false);
    expect(blocking({ type: "fillblank", prompt: "", text: "No gaps here.", feedback: "" })).toMatch(/at least one gap/);
  });

  it("shuffles the same way every time, and never into the right order", async () => {
    const { shuffleFor } = await import("./magazine");
    for (const seed of ["a", "seq-1", "sequencing-xyz", "b2"]) {
      const o = shuffleFor(seed, 4);
      expect(o).toEqual(shuffleFor(seed, 4));
      expect([...o].sort()).toEqual([0, 1, 2, 3]);
      expect(o).not.toEqual([0, 1, 2, 3]);
    }
  });

  it("keeps each item in a group that exists, and checks what publishing needs", () => {
    const sorting = {
      type: "sorting",
      prompt: "Sort them",
      groups: [
        { id: "g-care", label: "Personal care" },
        { id: "g-home", label: "Domestic" },
      ],
      items: [
        { id: "i1", text: "Showering", group: "g-care", feedback: "It's personal care." },
        { id: "i2", text: "Vacuuming", group: "g-home", feedback: "" },
      ],
    };
    expect(first(sorting)).toMatchObject({ items: [{ group: "g-care" }, { group: "g-home" }] });
    expect(() => first({ ...sorting, items: [{ id: "i1", text: "x", group: "nope" }] })).toThrow(/group that isn’t there/);
    expect(blocking({ type: "sequencing", prompt: "Order", steps: [{ id: "s1", text: "A" }], feedback: "" })).toMatch(/at least 3 steps/);
    expect(blocking({ type: "matching", prompt: "Match", pairs: [{ id: "pair-1", left: "A", right: "" }], feedback: "" })).toMatch(
      /right is missing|at least 2 pairs/,
    );
    expect(
      blocking({ type: "hotspots", prompt: "", media: { src: PIC, alt: "" }, spots: [{ id: "h1", x: 10, y: 20, title: "Goals", body: "What they want." }] }),
    ).toMatch(/describe the picture/);
  });
});

describe("reveals", () => {
  it("keeps a block's entrance, leaving out the default and anything unknown", () => {
    expect(first({ type: "text", body: "Hi", reveal: "zoom" })).toMatchObject({ reveal: "zoom" });
    expect(first({ type: "text", body: "Hi", reveal: "none" })).toMatchObject({ reveal: "none" });
    expect(first({ type: "text", body: "Hi", reveal: "rise" })).not.toHaveProperty("reveal");
    expect(first({ type: "text", body: "Hi", reveal: "spin" })).not.toHaveProperty("reveal");
  });
});

describe("a picture on a decision question", () => {
  const decision = (media?: object) => ({
    type: "decision",
    prompt: "What do you do?",
    choices: [
      { id: "ch-a", text: "Listen", verdict: "best", feedback: "Yes." },
      { id: "ch-b", text: "Leave", verdict: "risky", feedback: "No." },
    ],
    ...(media && { media }),
  });
  it("keeps the picture once one is chosen, and needs it described to publish", () => {
    expect(first(decision({ src: PIC, alt: "Mrs Nguyen at her kitchen bench" }))).toMatchObject({
      media: { src: PIC, alt: "Mrs Nguyen at her kitchen bench" },
    });
    expect(first(decision({ src: "", alt: "" }))).not.toHaveProperty("media");
    // In a circle beside the question unless set wide; a style without a picture is dropped.
    expect(first({ ...decision({ src: PIC, alt: "x" }), mediaStyle: "wide" })).toMatchObject({ mediaStyle: "wide" });
    expect(first({ ...decision({ src: PIC, alt: "x" }), mediaStyle: "huge" })).not.toHaveProperty("mediaStyle");
    expect(first({ ...decision(), mediaStyle: "wide" })).not.toHaveProperty("mediaStyle");
    expect(blocking(decision({ src: PIC, alt: "" }))).toMatch(/describe the picture, or mark it decorative/);
    expect(blocking(decision({ src: PIC, alt: "", decorative: true }))).not.toMatch(/describe the picture/);
  });
});
