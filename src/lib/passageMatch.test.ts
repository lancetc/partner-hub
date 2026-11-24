import { describe, expect, it } from "vitest";
import { locatePassage, normText } from "./passageMatch";

/*
  The marker on a page finds a saved passage in the page's text the same way the server checks it: word for word,
  across bold or a link, and not at all once the wording has changed.
*/

const text = (pieces: string[], span: NonNullable<ReturnType<typeof locatePassage>>) => {
  const [sp, so] = span.start;
  const [ep, eo] = span.end;
  if (sp === ep) return pieces[sp].slice(so, eo);
  return [pieces[sp].slice(so), ...pieces.slice(sp + 1, ep), pieces[ep].slice(0, eo)].join("");
};

describe("finding a saved passage on the page", () => {
  it("finds an exact match, even across bold, a link or a line break", () => {
    const pieces = ["Before you approve an invoice, ", "compare the rate", " on each line\nwith the current agreement. If it differs, pause."];
    const span = locatePassage(pieces, "Compare the rate on each line with the current agreement.");
    expect(span).not.toBeNull();
    // Exactly the words, from the first letter to the last: not the full stop after, not the space before.
    expect(text(pieces, span!)).toBe("compare the rate on each line\nwith the current agreement");
    expect(span!.start).toEqual([1, 0]);
  });

  it("reads a heading and the paragraph under it as two lines, though the page has no space between them", () => {
    const pieces = ["Check each line", "A supplier invoice is checked line by line."];
    // Without knowing where a line starts, "line" and "A" run together.
    expect(locatePassage(pieces, "A supplier invoice is checked line by line.")).toBeNull();
    const span = locatePassage(pieces, "A supplier invoice is checked line by line.", [false, true]);
    expect(span).toEqual({ start: [1, 0], end: [1, 42] });
    expect(text(pieces, span!)).toBe("A supplier invoice is checked line by line");
    expect(text(pieces, locatePassage(pieces, "each line a supplier", [false, true])!)).toBe("each lineA supplier");
  });

  it("matches whole words only", () => {
    expect(locatePassage(["Keep the separate rates apart."], "rate")).toBeNull();
    expect(locatePassage(["Check the rate today."], "rate")).not.toBeNull();
  });

  it("ignores a change of punctuation, but not of wording", () => {
    const saved = "Compare the rate on each line with the current agreement.";
    expect(locatePassage(["Compare the rate on each line — with the current agreement!"], saved)).not.toBeNull();
    // Changed: one word is different, so it isn't marked.
    expect(locatePassage(["Compare the price on each line with the current agreement."], saved)).toBeNull();
    // Missing: the passage is gone.
    expect(locatePassage(["Ask the finance team before you approve."], saved)).toBeNull();
    expect(locatePassage([], saved)).toBeNull();
    expect(locatePassage(["Anything"], "   ")).toBeNull();
  });

  it("compares the same way as the server", () => {
    expect(normText("  The **Rate**, as agreed!  ")).toBe("the rate as agreed");
  });
});
