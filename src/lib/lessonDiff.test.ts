import { describe, expect, it } from "vitest";
import { diffLessons } from "./lessonDiff";
import type { Lesson } from "@/content/lessons";

/* What changed between two versions of a lesson, card by card. */

const v1 = {
  slug: "x",
  title: "Rates",
  summary: "Old summary",
  nodes: {
    a: { id: "a", type: "image", heading: "Intro", body: "The rate is $80" },
    b: { id: "b", type: "image", heading: "Goodbye", body: "Bye" },
  },
} as unknown as Lesson;

describe("diffLessons", () => {
  it("treats every card as added for the first version", () => {
    const d = diffLessons(null, v1);
    expect(d.cards.map((c) => [c.id, c.change])).toEqual([
      ["a", "added"],
      ["b", "added"],
    ]);
  });

  it("lists added, removed and changed cards and lesson details", () => {
    const v2 = structuredClone(v1) as unknown as { summary: string; nodes: Record<string, Record<string, string>> };
    v2.summary = "New summary";
    v2.nodes.a.body = "The rate is $82";
    delete v2.nodes.b;
    v2.nodes.c = { id: "c", type: "image", heading: "New card", body: "" };
    const d = diffLessons(v1, v2 as unknown as Lesson);
    expect(d.lesson.length).toBe(1);
    const byId = Object.fromEntries(d.cards.map((c) => [c.id, c]));
    expect(byId.a.change).toBe("changed");
    expect(byId.a.parts.length).toBeGreaterThan(0);
    expect(byId.b.change).toBe("removed");
    expect(byId.c).toMatchObject({ change: "added", title: "New card" });
  });

  it("finds nothing when nothing changed", () => {
    expect(diffLessons(v1, structuredClone(v1))).toEqual({ lesson: [], cards: [] });
  });
});
