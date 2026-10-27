import { describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { allTicked, checklistDone, tickedFrom } from "./checklist";
import { applyText, extractText } from "./lessonText";

/* Checklist cards: ticking items off, and when learners can move on. */

const lf = lessons.find((l) => l.slug === "legislative-framework")!;
const card = lf.nodes.leaving;

describe("checklist cards", () => {
  it("only holds learners when every item must be ticked", () => {
    if (card.type !== "checklist") throw new Error("Demo card missing");
    expect(card.requireAll).toBe(true);
    expect(checklistDone(card, [])).toBe(false);
    expect(checklistDone(card, ["floors", "products", "doors"])).toBe(false);
    expect(
      checklistDone(
        card,
        card.items.map((i) => i.id),
      ),
    ).toBe(true);
    expect(checklistDone({ ...card, requireAll: undefined }, [])).toBe(true);
  });

  it("reads ticks saved with progress, ignoring items no longer on the card", () => {
    expect(tickedFrom("a,b")).toEqual(["a", "b"]);
    expect(tickedFrom(undefined)).toEqual([]);
    expect(allTicked({ items: [{ id: "a", text: "A" }] }, ["a", "gone"])).toBe(true);
    expect(allTicked({ items: [] }, [])).toBe(false);
  });

  it("sits after the hotspot card, and its items and notes are translated but not their ids", () => {
    expect(lf.nodes.kit.type === "hotspot" && lf.nodes.kit.next).toBe("leaving");
    if (card.type !== "checklist") return;
    const text = extractText(lf);
    expect(text).toContain(card.items[0].text);
    expect(text).toContain(card.items[0].note);
    expect(text).not.toContain("floors");
    const out = applyText(lf, Object.fromEntries(text.map((t) => [t, `[vi] ${t}`]))).nodes.leaving;
    if (out.type === "checklist") expect(out.items.map((i) => i.id)).toEqual(card.items.map((i) => i.id));
  });
});
