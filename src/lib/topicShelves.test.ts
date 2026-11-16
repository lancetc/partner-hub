import { describe, expect, it } from "vitest";
import type { TopicSummary } from "./topicSummary";
import { byPopularity, SHELF_SIZE, topicShelves } from "./topicShelves";

const topic = (slug: string, p: Partial<TopicSummary> = {}): TopicSummary =>
  ({ slug, title: slug, summary: "", outcome: "", minutes: 8, track: "core", visual: {}, steps: 3, stepOf: {}, subject: null, publishedAt: null, ...p }) as TopicSummary;

const ids = (shelves: ReturnType<typeof topicShelves>) => shelves.map((s) => s.id);
const slugs = (shelves: ReturnType<typeof topicShelves>, id: string) => shelves.find((s) => s.id === id)?.topics.map((t) => t.slug);

describe("topic shelves", () => {
  it("puts the newest first and leaves out topics with no publish date", () => {
    const topics = [topic("old", { publishedAt: "2026-01-01" }), topic("new", { publishedAt: "2026-11-01" }), topic("undated")];
    expect(slugs(topicShelves({ topics, popularity: {} }), "new")).toEqual(["new", "old"]);
  });

  it("ranks popular topics by completions and skips ones nobody has finished", () => {
    const topics = [topic("a"), topic("b"), topic("c")];
    expect(slugs(topicShelves({ topics, popularity: { a: 2, b: 9, c: 0 } }), "popular")).toEqual(["b", "a"]);
  });

  it("adds a row for the person's role only when it's known", () => {
    const topics = [topic("p1", { track: "partner" }), topic("p2", { track: "partner" }), topic("c1", { track: "coordinator" })];
    const partner = topicShelves({ topics, popularity: {}, audience: "partner" });
    expect(partner.find((s) => s.id === "role")).toMatchObject({ title: "For Care Partners", seeAll: { track: "partner" } });
    expect(slugs(partner, "role")).toEqual(["p1", "p2"]);
    expect(ids(topicShelves({ topics, popularity: {}, audience: "staff" }))).not.toContain("role");
  });

  it("finds quick wins under six minutes, shortest first", () => {
    const topics = [topic("five", { minutes: 5 }), topic("two", { minutes: 2 }), topic("six", { minutes: 6 })];
    expect(slugs(topicShelves({ topics, popularity: {} }), "quick")).toEqual(["two", "five"]);
  });

  it("doesn't repeat what the person already has, and hides rows too short to be worth a row", () => {
    const topics = [topic("a", { minutes: 3 }), topic("b", { minutes: 3 }), topic("c", { minutes: 3 })];
    expect(slugs(topicShelves({ topics, popularity: {}, exclude: new Set(["a"]) }), "quick")).toEqual(["b", "c"]);
    expect(ids(topicShelves({ topics, popularity: {}, exclude: new Set(["a", "b"]) }))).not.toContain("quick");
  });

  it("keeps each row short", () => {
    const topics = Array.from({ length: 30 }, (_, i) => topic(`t${i}`, { minutes: 2 }));
    expect(topicShelves({ topics, popularity: {} }).find((s) => s.id === "quick")?.topics).toHaveLength(SHELF_SIZE);
  });

  it("sorts the full list by popularity, then title", () => {
    expect([topic("b"), topic("a"), topic("c")].sort(byPopularity({ c: 3 })).map((t) => t.slug)).toEqual(["c", "a", "b"]);
  });
});
