import { describe, expect, it } from "vitest";
import type { Card } from "@/content/lessons";
import { lessons } from "@/content/lessons";
import { hotspotsNeeded } from "./hotspots";
import { completionGate } from "./completionGate";

/* Hotspot cards: how many spots unlock Continue, and the demo card is set up properly. */

const spots = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, x: 10, y: 10, r: 7, label: "L", text: "T" }));

describe("hotspot cards", () => {
  it("needs every spot unless the author asks for fewer", () => {
    expect(hotspotsNeeded({ spots: spots(4) })).toBe(4);
    expect(hotspotsNeeded({ spots: spots(4), required: 2 })).toBe(2);
    expect(hotspotsNeeded({ spots: spots(2), required: 5 })).toBe(2);
    expect(hotspotsNeeded({ spots: spots(3), required: 0 })).toBe(1);
  });

  it("holds learners until they've found them, like other answer cards", () => {
    const card = {
      id: "h",
      type: "hotspot",
      beat: 0,
      label: "",
      heading: "",
      body: "",
      visual: { kind: "none" },
      prompt: "",
      image: null,
      mode: "find",
      spots: spots(1),
    } as Card;
    const ctx = { answers: {}, finished: new Set<string>(), exempt: false, narration: null, speaks: false };
    expect(completionGate(card, ctx)).toBeNull();
  });

  it("has a working demo in Legislative Framework", () => {
    const l = lessons.find((x) => x.slug === "legislative-framework")!;
    const kit = l.nodes.kit;
    expect(kit.type).toBe("hotspot");
    if (kit.type !== "hotspot") return;
    expect(kit.image?.alt).toBeTruthy();
    for (const s of kit.spots) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(100);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(100);
      expect(s.label && s.text).toBeTruthy();
    }
    expect(l.nodes.standards.type !== "decision" && "next" in l.nodes.standards && l.nodes.standards.next).toBe("kit");
  });
});
