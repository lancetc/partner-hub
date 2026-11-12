import { describe, expect, it } from "vitest";
import { cardById, cardOfTheWeek, cards, deckFor, perspectives, shuffled, themes } from "./conversations";
import { memberById } from "./community";

describe("the Care Conversations deck", () => {
  it("has 48 cards, eight in each of six themes, each with a question and a deeper follow-up", () => {
    expect(cards).toHaveLength(48);
    expect(themes).toHaveLength(6);
    for (const t of themes) expect(deckFor(t.id)).toHaveLength(8);
    expect(new Set(cards.map((c) => c.id)).size).toBe(48);
    for (const c of cards) {
      expect(c.question.length).toBeGreaterThan(20);
      expect(c.deeper.length).toBeGreaterThan(10);
      expect(c.question).not.toBe(c.deeper);
    }
    expect(new Set(cards.map((c) => c.question)).size).toBe(48);
  });

  it("links shared perspectives to real cards and community members", () => {
    for (const p of perspectives) {
      expect(cardById(p.cardId)).toBeDefined();
      expect(memberById(p.memberId)).toBeDefined();
    }
  });

  it("shuffles the same way for the same seed, and keeps every card", () => {
    const a = shuffled(cards, 42);
    expect(shuffled(cards, 42)).toEqual(a);
    expect(shuffled(cards, 43)).not.toEqual(a);
    expect([...a].sort((x, y) => x.id.localeCompare(y.id))).toEqual([...cards].sort((x, y) => x.id.localeCompare(y.id)));
  });

  it("picks one card of the week, changing theme from one week to the next", () => {
    const thisWeek = cardOfTheWeek(new Date(2026, 10, 13));
    expect(cardOfTheWeek(new Date(2026, 10, 15))).toEqual(thisWeek);
    const nextWeek = cardOfTheWeek(new Date(2026, 10, 20));
    expect(nextWeek.id).not.toBe(thisWeek.id);
    expect(nextWeek.theme).not.toBe(thisWeek.theme);
  });
});
