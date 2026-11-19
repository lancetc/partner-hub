import { describe, expect, it } from "vitest";
import { readGuideDoc } from "@/lib/magazine";
import { describePrompt, missingPictures, tidyAlt } from "./describeImage";

/* Describe with AI: which pictures need a description, and how the suggestion is tidied. (No calls to OpenAI here.) */

const pic = (alt = "", decorative = false) => ({ src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.webp", alt, ...(decorative && { decorative: true }) });

describe("pictures without a description", () => {
  it("finds every picture with no description that isn't decorative, with where it sits", () => {
    const doc = readGuideDoc(
      {
        schema: 2,
        pages: [
          {
            id: "p1",
            title: "Your role",
            purpose: "",
            template: "do",
            kind: "content",
            required: true,
            sections: [
              {
                id: "s1",
                title: "Before you start",
                blocks: [
                  { id: "img", type: "image", media: pic(), width: "column" },
                  { id: "described", type: "image", media: pic("A support worker at a front door"), width: "column" },
                  { id: "mood", type: "image", media: pic("", true), width: "column" },
                  { id: "tm", type: "textMedia", heading: "Meet Sam", body: "Sam explains the first visit.", media: pic(), layout: "media-right" },
                  {
                    id: "dec",
                    type: "decision",
                    prompt: "Mr Ellis says no. What do you do?",
                    media: pic(),
                    choices: [
                      { id: "c1", text: "Respect it", verdict: "best", feedback: "Yes." },
                      { id: "c2", text: "Insist", verdict: "risky", feedback: "No." },
                    ],
                  },
                  {
                    id: "cards",
                    type: "flashcards",
                    cards: [
                      { id: "k1", front: "Falls", back: "Call for help.", media: pic() },
                      { id: "k2", front: "Burns", back: "Cool water." },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { draft: true },
    );
    const found = missingPictures(doc);
    expect(found.map((f) => [f.blockId, f.itemId ?? null])).toEqual([
      ["img", null],
      ["tm", null],
      ["dec", null],
      ["cards", "k1"],
    ]);
    expect(found[1].context).toBe("Your role › Before you start. Meet Sam Sam explains the first visit.");
    expect(found[2].context).toContain("Mr Ellis says no");
  });
});

describe("the suggestion", () => {
  it("is one tidy line, without quotes or 'Image of'", () => {
    expect(tidyAlt('"Image of a support worker\nhelping an older woman stand."')).toBe("A support worker helping an older woman stand.");
    expect(tidyAlt("Photo showing   the Statement of Rights first page")).toBe("The Statement of Rights first page");
    expect(tidyAlt("x".repeat(500))).toHaveLength(400);
  });

  it("asks for a short, respectful description and gives the context", () => {
    const p = describePrompt("Page 2 › Consent. Mr Ellis says no.");
    expect(p).toContain("under 150 characters");
    expect(p).toContain("Never name or guess the identity of a real person");
    expect(p).toContain("Where it appears: Page 2 › Consent. Mr Ellis says no.");
  });
});
