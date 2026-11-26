import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GetToKnowYou } from "./GetToKnowYou";

/* Get to know you, on a starting course's page: every question, optional, with what they've already said ticked. */
describe("Get to know you", () => {
  it("asks about their background, with earlier answers filled in", () => {
    const out = renderToStaticMarkup(
      createElement(GetToKnowYou, {
        about: {
          years: "1to3",
          before: "Ran a café",
          languages: "Greek",
          interests: ["quality"],
          learn: ["videos"],
          note: "",
          updatedAt: "2026-11-26T04:00:00Z",
        },
      }),
    );
    expect(out).toContain("Get to know you");
    for (const q of [
      "How long have you worked in aged care",
      "What did you do before",
      "languages other than English",
      "get better at",
      "How do you like to learn",
      "Anything else",
    ])
      expect(out).toContain(q);
    expect(out).toMatch(/value="Ran a café"/);
    expect(out).toMatch(/checked=""[^>]*name="years"|name="years"[^>]*checked=""/);
    expect(out).toContain("Saved 26 Nov 2026");
    expect(out).not.toMatch(/required/);
  });
});
