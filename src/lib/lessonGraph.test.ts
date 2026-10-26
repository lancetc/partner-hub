import { describe, expect, it } from "vitest";
import { lessons, type Card, type Lesson } from "@/content/lessons";
import { exitOf, insertAfterCard, mainLine, moveBlock, ordered } from "./lessonGraph";

/* Adding and moving cards in the lesson editor without breaking the paths through a lesson. */

const copy = (slug: string) => structuredClone(lessons.find((l) => l.slug === slug)!) as Lesson;
const card = (id: string): Card => ({ id, type: "image", beat: 1, label: "", heading: id, body: "", visual: { kind: "none" }, next: "" });
/** Every route from the first card ends, and reaches every card on the main line. */
function walk(l: Lesson) {
  const seen = new Set<string>();
  const go = (id?: string) => {
    if (!id || seen.has(id) || !l.nodes[id]) return;
    seen.add(id);
    const c = l.nodes[id];
    if (c.type === "decision") c.options.forEach((o) => go(o.next));
    else if ("next" in c) go(c.next);
  };
  go(l.start);
  return seen;
}

describe("moving cards", () => {
  it("moves past a decision whose wrong answer loops back for another try", () => {
    const l = copy("our-mission-and-model");
    insertAfterCard(l, card("new"), l.start);
    while (!moveBlock(l, "new", 1));
    expect(mainLine(l).at(-1)).toBe("new");
    expect(walk(l).size).toBe(Object.keys(l.nodes).length);
  });

  it("moves a new card past a decision and its branches, all the way to the end and back", () => {
    const l = copy("a-little-extra-time");
    const second = mainLine(l)[1];
    insertAfterCard(l, card("new"), second);
    expect(mainLine(l)[2]).toBe("new");
    let moves = 0;
    while (!moveBlock(l, "new", 1)) moves++;
    expect(mainLine(l).at(-1)).toBe("new");
    expect(moves).toBeGreaterThan(3);
    expect(walk(l).size).toBe(Object.keys(l.nodes).length);
    expect(ordered(l).at(-1)!.id).toBe("new");
    while (!moveBlock(l, "new", -1));
    expect(l.start).toBe("new");
    expect(walk(l).size).toBe(Object.keys(l.nodes).length);
  });

  it("keeps the summary last, and branch cards with their decision", () => {
    const l = copy("legislative-framework");
    const line = mainLine(l);
    const summary = line.find((id) => l.nodes[id].type === "summary")!;
    insertAfterCard(l, card("new"), line.at(-1));
    expect(mainLine(l).at(-1)).toBe(summary);
    while (!moveBlock(l, "new", 1));
    expect(moveBlock(l, "new", 1)).toMatch(/summary stays/);
    expect(mainLine(l).at(-2)).toBe("new");
    const x = copy("a-little-extra-time");
    const branch = Object.keys(x.nodes).find((id) => !mainLine(x).includes(id))!;
    expect(moveBlock(x, branch, 1)).toMatch(/branch/);
  });

  it("finds where a decision's branches meet again", () => {
    const l = copy("a-little-extra-time");
    const d = Object.values(l.nodes).find((c) => c.type === "decision" && new Set(c.options.map((o) => o.next)).size > 1)!;
    expect(mainLine(l)).toContain(exitOf(l, d.id));
  });
});
