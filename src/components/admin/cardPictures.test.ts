import { describe, expect, it } from "vitest";
import type { Card } from "@/content/lessons";
import { namesOnCard } from "./LessonEditor";

const card = (heading: string, body: string) => ({ id: "c", type: "image", beat: 1, label: "", heading, body, visual: { kind: "none" } }) as unknown as Card;

describe("a card's names, to look for in the image library", () => {
  it("finds the people on the card, both names of a full name, and not the words that start a sentence or days", () => {
    expect(
      namesOnCard(card("Meet Bruce", "Bruce Harding is a Care Partner in Trilogy's Bowen Hills office. He starts every Monday with a full inbox, says Bruce.")),
    ).toEqual(expect.arrayContaining(["Bruce", "Harding"]));
    expect(namesOnCard(card("Meet Bruce", "Bruce Harding is here."))).not.toContain("Monday");
    expect(namesOnCard(card("Quick check", "Two questions. Choose the best answer."))).toEqual([]);
  });
});
