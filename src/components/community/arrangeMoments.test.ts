import { describe, expect, it } from "vitest";
import type { FeedCard } from "@/server/lifeMoments";
import { arrangeMoments } from "./LifeMoments";

/* The homepage's "Meanwhile" line-up: one person featured at random each visit, then the rest in a fresh order. */

const card = (id: string, memberId: string, o: Partial<FeedCard> = {}) => ({ id, memberId, unread: false, audio: null, ...o }) as FeedCard;
const cards = [
  card("a1", "alvarez", { unread: true }),
  card("o1", "okafor"),
  card("a2", "alvarez"),
  card("m1", "margaret"),
  card("m2", "margaret", { unread: true }),
  card("d1", "dot"),
];

describe("arranging the Meanwhile row", () => {
  it("features one person's best card and keeps every other card, unread first", () => {
    const { featured, rest } = arrangeMoments(cards, 0.42, null);
    expect(featured).not.toBeNull();
    expect(featured).toBe(cards.find((c) => c.memberId === featured!.memberId));
    expect(rest).toHaveLength(cards.length - 1);
    expect(new Set([featured!.id, ...rest.map((c) => c.id)]).size).toBe(cards.length);
    const firstRead = rest.findIndex((c) => !c.unread);
    expect(rest.slice(firstRead).every((c) => !c.unread)).toBe(true);
  });

  it("never features the same person twice running, and varies who it features", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { featured } = arrangeMoments(cards, i / 40, "alvarez");
      expect(featured!.memberId).not.toBe("alvarez");
      seen.add(featured!.memberId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("holds still for one visit, and features the only person there is", () => {
    expect(arrangeMoments(cards, 0.3, null)).toEqual(arrangeMoments(cards, 0.3, null));
    expect(arrangeMoments([card("x", "dot")], 0.9, "dot").featured!.id).toBe("x");
  });
});
