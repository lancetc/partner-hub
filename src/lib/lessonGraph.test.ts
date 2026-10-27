import { describe, expect, it } from "vitest";
import { lessons, type Card, type Lesson } from "@/content/lessons";
import { dropTargets, exitOf, insertAfterCard, mainLine, moveBlock, moveToPosition, ordered } from "./lessonGraph";

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

describe("dragging cards", () => {
  it("drops a card straight into a new position, keeping every path whole", () => {
    const l = copy("legislative-framework");
    const line = mainLine(l);
    expect(moveToPosition(l, line[1], 4)).toBeNull();
    expect(mainLine(l)[4]).toBe(line[1]);
    expect(walk(l).size).toBe(Object.keys(l.nodes).length);
    expect(moveToPosition(l, line[1], 0)).toBeNull();
    expect(mainLine(l)[0]).toBe(line[1]);
  });

  it("offers only the gaps a card can really reach", () => {
    const l = copy("a-little-extra-time");
    const line = mainLine(l);
    const targets = dropTargets(l, line[1]);
    expect(targets.length).toBeGreaterThan(2);
    // Never its own spot, never after the summary.
    expect(targets.some((t) => t.to === 1)).toBe(false);
    expect(targets.some((t) => t.before === null && l.nodes[line.at(-1)!].type === "summary")).toBe(false);
    for (const t of targets) {
      const trial = structuredClone(l);
      expect(moveToPosition(trial, line[1], t.to)).toBeNull();
      expect(walk(trial).size).toBe(Object.keys(trial.nodes).length);
    }
    // The summary and cards inside a branch can't be dragged.
    const withSummary = copy("legislative-framework");
    const summary = Object.values(withSummary.nodes).find((c) => c.type === "summary")!;
    expect(dropTargets(withSummary, summary.id)).toEqual([]);
    const branchCard = ordered(l).find((c) => !line.includes(c.id))!;
    expect(dropTargets(l, branchCard.id)).toEqual([]);
  });
});
