import { describe, expect, it } from "vitest";
import { lessons } from "@/content/lessons";
import { lessonAssets, narrationUrl } from "./offlineAssets";

/* What a lesson needs saving to work offline. */

describe("offline lesson assets", () => {
  const lf = lessons.find((l) => l.slug === "legislative-framework")!;
  const { media, narration } = lessonAssets(lf);

  it("lists the lesson's pictures, but never videos or outside links", () => {
    expect(media).toContain("/images/cleaner.jpg");
    expect(media.every((u) => u.startsWith("/"))).toBe(true);
    expect(media.some((u) => /\.(mp4|webm|mov)$/.test(u))).toBe(false);
  });

  it("lists narration for cards with a script, using the player's own address", () => {
    expect(narration.length).toBeGreaterThan(3);
    expect(narration).toContain(narrationUrl("legislative-framework", "act"));
    expect(narrationUrl("x", "y")).toBe("/api/tts?key=lesson%3Ax%3Ay");
  });
});
