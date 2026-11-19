import { describe, expect, it } from "vitest";
import { splitCues, toVtt } from "./captions";

/* Captions written as an author speaks in the recording studio. */

describe("captions from a recording", () => {
  it("breaks a long phrase into shorter captions that share its time", () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    const out = splitCues([{ start: 2, end: 14, text: words }], 12);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ start: 2, end: 6 });
    expect(out[2]).toMatchObject({ start: 10, end: 14, text: "w24 w25 w26 w27 w28 w29" });
    expect(splitCues([{ start: 0, end: 1, text: "Short one." }])).toEqual([{ start: 0, end: 1, text: "Short one." }]);
  });

  it("writes a WebVTT file, leaving out empty captions and keeping each on screen long enough to read", () => {
    expect(
      toVtt([
        { start: 0.25, end: 3.5, text: " Hello, I'm Jordan. " },
        { start: 3.5, end: 3.6, text: "Quick." },
        { start: 4, end: 5, text: "  " },
        { start: 3661.2, end: 3663, text: "An hour in." },
      ]),
    ).toBe(
      "WEBVTT\n\n1\n00:00:00.250 --> 00:00:03.500\nHello, I'm Jordan.\n\n2\n00:00:03.500 --> 00:00:04.000\nQuick.\n\n3\n01:01:01.200 --> 01:01:03.000\nAn hour in.\n",
    );
  });
});
