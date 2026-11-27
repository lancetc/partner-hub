import { describe, expect, it } from "vitest";
import { activeCue, cleanCues, cueTimes, timedCues, type BriefingCue } from "./briefingCues";
import type { NarrationAudio } from "./magazine";

/*
  The Trilogy Briefing's narration cues (lib/briefingCues): timed from the recording's word timings, or by hand, never
  guessed from the script's length; the newspaper follows the audio's position, so any moment maps to one cue.
*/

const script = "Here's what's happening this week.  Our feature is Christmas visits. And a policy update to know about.";
/** Word timings as the recording gives them: each word's place in the script and when it's said. */
function timings(text: string, secondsPerWord = 0.5): NarrationAudio {
  const words: NonNullable<NarrationAudio["words"]> = [];
  let t = 0.2;
  for (const m of text.matchAll(/\S+/g)) {
    words.push({ from: m.index!, to: m.index! + m[0].length, start: t, end: t + secondsPerWord * 0.9 });
    t += secondsPerWord;
  }
  return { src: "/api/uploads/x.mp3", seconds: Math.round(t * 10) / 10, words, scriptHash: "h", voice: "profile:editorial", at: "" };
}
const cues: BriefingCue[] = [
  { id: "c1", excerpt: "Here's what's happening", target: "section:masthead", treatment: "rule" },
  { id: "c2", excerpt: "Our feature is", target: "story:christmas", treatment: "headline" },
  { id: "c3", excerpt: "And a policy update", target: "section:policy", treatment: "rule" },
];

describe("timing the cues", () => {
  it("takes each start from the word the passage begins on, and ends it where the next begins", () => {
    const audio = timings(script);
    const t = cueTimes(cues, script, audio);
    // "Our" is the 6th word, "And" the 11th: 0.2 + 5 × 0.5 and 0.2 + 10 × 0.5.
    expect(t.map((x) => [x.start, x.end, x.how])).toEqual([
      [0.2, 2.7, "aligned"],
      [2.7, 5.2, "aligned"],
      [5.2, audio.seconds, "aligned"],
    ]);
  });

  it("uses a time set by hand, and gives no time at all rather than a guess when there are no word timings", () => {
    const noWords = { ...timings(script), words: null };
    const t = cueTimes([{ ...cues[0], start: 0 }, cues[1], { ...cues[2], start: 9 }], script, noWords);
    expect(t.map((x) => [x.start, x.how])).toEqual([
      [0, "set"],
      [null, "none"],
      [9, "set"],
    ]);
    // A cue without a time doesn't play.
    expect(timedCues([{ ...cues[0], start: 0 }, cues[1]], script, noWords).map((c) => c.id)).toEqual(["c1"]);
    // A passage that isn't in the script can't be timed from the recording.
    expect(cueTimes([{ ...cues[1], excerpt: "Not in the script" }], script, timings(script))[0]).toMatchObject({ start: null, found: false });
  });

  it("knows which cue is playing at any moment, so seeking and pausing land on the right one", () => {
    const timed = timedCues(cues, script, timings(script));
    expect(activeCue(timed, 0.1)).toBeNull();
    expect(activeCue(timed, 3)?.id).toBe("c2");
    expect(activeCue(timed, 5.2)?.id).toBe("c3");
    expect(activeCue(timed, 99)).toBeNull();
  });
});

describe("cues from the editor", () => {
  it("keeps only cues pointing at a story or a part of the newspaper, with sensible times", () => {
    expect(
      cleanCues([
        { id: "c1", excerpt: " Hello ", target: "section:masthead", treatment: "tint", start: 1.234, end: 0.5 },
        { id: "c1", excerpt: "x", target: "story:christmas", treatment: "sparkle" },
        { excerpt: "y", target: "https://example.com" },
        { excerpt: "z", target: "section:nowhere" },
      ]),
    ).toEqual([
      { id: "c1", excerpt: "Hello", target: "section:masthead", treatment: "tint", start: 1.23 },
      { id: "c1x", excerpt: "x", target: "story:christmas", treatment: "headline" },
    ]);
  });
});
