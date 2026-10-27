import { describe, expect, it } from "vitest";
import { wordAround, wordAt, wordsFromAlignment, type Alignment } from "./wordTimings";

/* Following the narration word by word. */

// Each character takes 0.1s, as ElevenLabs reports per character.
const align = (text: string): Alignment => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, i) => i / 10),
  character_end_times_seconds: [...text].map((_, i) => (i + 1) / 10),
});

describe("word timings", () => {
  const text = "Stay longer?  Check first.";
  const words = wordsFromAlignment(text, align(text))!;

  it("groups characters into words with their place and times", () => {
    expect(words.map((w) => text.slice(w.from, w.to))).toEqual(["Stay", "longer?", "Check", "first."]);
    expect(words[1]).toMatchObject({ from: 5, to: 12, start: 0.5, end: 1.2 });
  });

  it("refuses timings that don't match the script", () => {
    expect(wordsFromAlignment("Something else", align(text))).toBeNull();
    expect(wordsFromAlignment(text, null)).toBeNull();
  });

  it("finds the word being said at a time", () => {
    expect(wordAt(words, 0)).toBe(words[0]);
    expect(wordAt(words, 0.55)).toBe(words[1]);
    // In the pause between words, the last word started stays highlighted.
    expect(wordAt(words, 1.3)).toBe(words[1]);
    expect(wordAt(words, 99)).toBe(words[3]);
    expect(wordAt([], 1)).toBeNull();
  });

  it("finds the word around a character, for the browser voice", () => {
    expect(wordAround(text, 7)).toEqual({ from: 5, to: 12 });
    expect(wordAround(text, 0)).toEqual({ from: 0, to: 4 });
    expect(wordAround(text, 12)).toBeNull();
    expect(wordAround(text, -1)).toBeNull();
  });
});
