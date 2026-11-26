import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepList } from "./CourseParts";

/* A starting course's steps: each with its picture (when it has one), its number on the corner, and Today or Later. */
const step = (id: string, poster: string | null, later = false) => ({
  id,
  title: `Step ${id}`,
  kind: "path" as const,
  kindLabel: "Discovery Path",
  required: true,
  minutes: 20,
  poster,
  later,
  state: "todo" as const,
  href: `/paths/${id}`,
  contentTitle: null,
  credit: null,
  unavailable: null,
  blocked: false,
});

describe("StepList", () => {
  it("shows each step's picture with its number, and the plain number without one", () => {
    const out = renderToStaticMarkup(createElement(StepList, { steps: [step("a", "/api/uploads/a.webp"), step("b", null, true)], currentId: "a" }));
    expect(out).toContain('src="/api/uploads/a.webp"');
    expect(out.match(/<img /g)).toHaveLength(1);
    expect(out).toContain(">Today<");
    expect(out).toContain(">Later<");
    // Both numbers are there: one on the picture's corner, one on its own.
    expect(out).toMatch(/>1<\/span>/);
    expect(out).toMatch(/>2<\/span>/);
  });
});
