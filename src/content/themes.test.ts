import { describe, expect, it } from "vitest";
import type { Card } from "./lessons";
import { GRADIENTS } from "./gradients";
import { cardSurface, THEMES, themeIds } from "./themes";

/* Lesson themes: the look of cards without their own colour or photo. */

const card = (type: string, extra: object = {}) => ({ id: "x", type, ...extra }) as unknown as Card;

// WCAG contrast between two #rrggbb colours.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const TEXT = { light: "#ffffff", dark: "#0a1a2e" };

describe("lesson themes", () => {
  it("leaves cards white in Classic, or when no theme is set", () => {
    expect(cardSurface({}, card("image"))).toBeNull();
    expect(cardSurface({ theme: "classic" }, card("quiz"))).toBeNull();
  });

  it("gives every card the theme's look", () => {
    expect(cardSurface({ theme: "navy" }, card("image"))).toMatchObject({ text: "light" });
    expect(cardSurface({ theme: "warm" }, card("quiz"))).toMatchObject({ text: "dark" });
  });

  it("paces Brand rhythm by card type", () => {
    expect(cardSurface({ theme: "rhythm" }, card("image"))).toBeNull();
    expect(cardSurface({ theme: "rhythm" }, card("decision"))?.css).toBe(GRADIENTS.teal.css);
    expect(cardSurface({ theme: "rhythm" }, card("summary"))?.css).toBe(GRADIENTS.navy.css);
    // The soft navy version, in the design system's navy, orange, yellow and red.
    expect(cardSurface({ theme: "rhythmNavy" }, card("image"))).toMatchObject({ text: "dark", accent: "text-[#284d79]" });
    expect(cardSurface({ theme: "rhythmNavy" }, card("quiz"))).toMatchObject({ text: "light", accent: "text-[#ffc72c]" });
    expect(cardSurface({ theme: "rhythmNavy" }, card("decision"))?.css).toContain("#f26a36");
    expect(cardSurface({ theme: "rhythmNavy" }, card("image", { emphasis: "consequence" }))?.css).toContain("#f9d6d3");
    expect(cardSurface({ theme: "rhythmNavy" }, card("summary"))?.css).toContain("#ffc72c");
  });

  it("lets a card's own colour win, and keeps the audio card readable", () => {
    expect(cardSurface({ theme: "navy" }, card("image", { background: { gradient: "yellow" } }))).toBe(GRADIENTS.yellow);
    expect(cardSurface({ theme: "navy" }, card("listen"))).toBe(GRADIENTS.mist);
    expect(cardSurface({ theme: "softTeal" }, card("listen"))).toMatchObject({ text: "dark" });
  });

  it("keeps text and accents readable on every theme (4.5:1 against both ends of the gradient)", () => {
    for (const id of themeIds)
      for (const [type, extra] of [["image"], ["quiz"], ["decision"], ["summary"], ["image", { emphasis: "consequence" }]] as [string, object?][]) {
        const s = THEMES[id].surface(card(type, extra));
        if (!s) continue;
        const stops = s.css.match(/#[0-9a-f]{6}/gi)!;
        const colours = [TEXT[s.text], ...(s.accent ? [s.accent.match(/#[0-9a-f]{6}/i)![0]] : [])];
        for (const stop of stops) for (const c of colours) expect(contrast(c, stop), `${id} ${type} ${c} on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
  });
});
