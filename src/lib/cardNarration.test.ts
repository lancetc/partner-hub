import { describe, expect, it } from "vitest";
import type { Lesson } from "@/content/lessons";
import { cardNarration, fallbackNarration } from "./cardNarration";

type Card = Lesson["nodes"][string];
const card = (c: Record<string, unknown>) =>
  ({
    id: "c",
    beat: 1,
    label: "",
    heading: "",
    body: "",
    visual: { kind: "illustration", variant: "arc", tone: "teal", icon: "chat", alt: "" },
    ...c,
  }) as unknown as Card;

describe("every card has a voice-over", () => {
  it("keeps a card's own script", () => {
    expect(cardNarration(card({ type: "image", heading: "Hi", narration: "Written for this card." }))).toBe("Written for this card.");
  });

  it("reads a picture card's heading and text, turning a list into sentences and leaving out the source note", () => {
    const said = fallbackNarration(
      card({
        type: "image",
        heading: "Key points",
        body: "- Record every incident\n- Keep records for 7 years\n\n*Based on the Commission's Alis modules. General guidance only.*",
      }),
    );
    expect(said).toBe("Key points. Record every incident. Keep records for 7 years.");
  });

  it("asks a quick check's questions without reading out the answers", () => {
    const said = fallbackNarration(
      card({
        type: "quiz",
        heading: "Quick check",
        body: "Two questions on safety at home.",
        questions: [
          { id: "a", prompt: "Q1?", options: [{ id: "x", label: "The secret answer" }], correct: "x", feedback: { correct: "Yes", incorrect: "No" } },
          { id: "b", prompt: "Q2?", options: [], correct: "x", feedback: { correct: "Yes", incorrect: "No" } },
        ],
      }),
    );
    expect(said).toBe("Quick check. Two questions on safety at home. There are 2 questions. Choose the best answer to each one.");
    expect(said).not.toContain("secret");
  });

  it("sets up a decision with its situation and question, never its options", () => {
    const said = fallbackNarration(
      card({
        type: "decision",
        heading: "Which system?",
        body: "Jackson doesn't like the frozen meals.",
        prompt: "Sort each complaint",
        options: [{ id: "a", label: "Option A" }],
      }),
    );
    expect(said).toBe("Which system? Jackson doesn't like the frozen meals. Sort each complaint.");
  });

  it("reads a confidence rating's statement and its scale", () => {
    expect(
      fallbackNarration(card({ type: "rating", heading: "How sure are you?", prompt: "I can decide", lowLabel: "Not yet", highLabel: "Very confident" })),
    ).toBe("How sure are you? “I can decide” Choose how sure you are, from Not yet to Very confident.");
  });

  it("reads a recap's points and what's next", () => {
    expect(
      fallbackNarration(
        card({ type: "summary", heading: "Stay in scope", body: "Prompt, don’t administer.", points: ["Never change a dose"], action: "Next, incidents." }),
      ),
    ).toBe("Stay in scope. Prompt, don’t administer. Never change a dose. Next, incidents.");
  });

  it("says nothing for a video that speaks for itself, and stops at about a minute", () => {
    expect(
      fallbackNarration(card({ type: "presenter", transcript: "", visual: { kind: "presenter", name: "P", video: { provider: "youtube", id: "x" } } })),
    ).toBe("");
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} has a few words.`).join(" ");
    expect(fallbackNarration(card({ type: "image", heading: "Long", body: long })).split(/\s+/).length).toBeLessThanOrEqual(110);
  });
});
