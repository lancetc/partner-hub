import { describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { fileSize } from "@/components/player/Resources";
import { completionGate } from "./completionGate";

/* Resources cards: a list of further reading that never holds up the lesson. */

describe("resources cards", () => {
  const l = lessons.find((x) => x.slug === "legislative-framework")!;
  const toolkit = l.nodes.toolkit;

  it("sits between the quick check and the recap, with working links", () => {
    expect(toolkit.type).toBe("resources");
    if (toolkit.type !== "resources") return;
    expect(l.nodes.check.type === "quiz" && l.nodes.check.next).toBe("toolkit");
    expect(toolkit.next).toBe("recap");
    for (const i of toolkit.items) expect(i.url).toMatch(/^https:\/\//);
  });

  it("shows file sizes", () => {
    expect(fileSize(2_400_000)).toBe("2.3 MB");
    expect(fileSize(5_000)).toBe("5 KB");
  });

  it("never holds learners up", () => {
    expect(
      completionGate({ ...toolkit, requireComplete: true }, { answers: {}, finished: new Set(), exempt: false, narration: null, speaks: false }),
    ).toBeNull();
  });
});
