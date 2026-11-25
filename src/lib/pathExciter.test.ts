import { describe, expect, it } from "vitest";
import { exciterForLearners, exciterOutdated, exciterState, exciterWarnings, pathSnapshot, readExciter, type Exciter, type PathShape } from "./pathExciter";
import { textHash, wordCount } from "./magazineNarration";
import { DISCOVERY_EXCITER_SEEDS, DISCOVERY_PATH_DESCRIPTIONS, SPOKEN_DESCRIPTIONS } from "@/content/discoveryExciters";

/* The Discovery Exciter's own rules (docs/discovery-exciter.md): freshness, what learners get, stored values, and the seeds. */

const SCRIPT = "What happens when a client says no? You’ll find out, and you’ll find some better questions to ask along the way.";
const path: PathShape = {
  name: "Care Coordination",
  description: "Everything you need to start coordinating care with Trilogy Care.",
  audience: "Care Coordinators",
  whoFor: "New care coordinators.",
  outcomes: ["Write clear case notes", "Run a weekly check"],
  reward: "A certificate",
  topics: [
    { slug: "a", title: "Topic A" },
    { slug: "b", title: "Topic B" },
    { slug: "c", title: "Topic C" },
  ],
  chapters: [{ title: "Your team", stage: "Stage 1", description: "People" }],
};
const rec = (script = SCRIPT, o: object = {}) => ({
  src: "/api/uploads/0f0e0d0c-0b0a-4908-8706-050403020100.mp3",
  seconds: 40,
  words: null,
  scriptHash: textHash(script),
  voice: "profile:editorial",
  at: "2026-11-25T00:00:00.000Z",
  provider: "openai",
  profile: "editorial",
  model: "gpt-4o-mini-tts",
  ...o,
});

describe("the outdated flag", () => {
  const approved = (): Exciter => ({ script: SCRIPT, status: "approved", basis: pathSnapshot(path), audio: rec() });
  it("is raised by a Topic added or removed or by changed outcomes, not by small edits or a new order", () => {
    const n = approved();
    expect(exciterOutdated(n, pathSnapshot(path))).toBe(false);
    expect(exciterOutdated(n, pathSnapshot({ ...path, description: `${path.description} Now with role plays.` }))).toBe(false);
    expect(exciterOutdated(n, pathSnapshot({ ...path, topics: [...path.topics].reverse() }))).toBe(false);
    expect(exciterOutdated(n, pathSnapshot({ ...path, topics: path.topics.slice(1) }))).toBe(true);
    expect(exciterOutdated(n, pathSnapshot({ ...path, topics: [...path.topics, { slug: "d", title: "Topic D" }] }))).toBe(true);
    expect(exciterOutdated(n, pathSnapshot({ ...path, outcomes: ["Write clear case notes"] }))).toBe(true);
    expect(exciterState(n, pathSnapshot({ ...path, outcomes: ["Something else"] }))).toBe("review");
    // A script that was never approved has nothing to be out of date against.
    expect(exciterOutdated({ script: SCRIPT, status: "draft" }, pathSnapshot({ ...path, topics: [] }))).toBe(false);
  });
});

describe("what learners get", () => {
  it("is the approved script with its approved recording only: never a draft, audio awaiting approval, a replacement or a hidden one", () => {
    expect(exciterForLearners(undefined)).toBeNull();
    expect(exciterForLearners({ script: SCRIPT, status: "draft" })).toBeNull();
    expect(exciterForLearners({ script: SCRIPT, status: "approved" })).toBeNull();
    expect(exciterForLearners({ script: SCRIPT, status: "approved", audio: { ...rec(), pending: true } })).toBeNull();
    expect(exciterForLearners({ script: SCRIPT, status: "approved", audio: rec("Other words") })).toBeNull();
    expect(exciterForLearners({ script: SCRIPT, status: "approved", audio: rec(), hidden: true })).toBeNull();
    const live = exciterForLearners({
      script: SCRIPT,
      status: "approved",
      audio: { ...rec(), cost: 0.01 },
      checks: ["a figure"],
      next: { script: "A replacement", status: "draft" },
    });
    expect(live).toEqual({ script: SCRIPT, audio: rec() });
  });
});

describe("stored Exciters", () => {
  it("keep only the Hub's own audio and known fields", () => {
    const n = readExciter({
      script: SCRIPT,
      status: "approved",
      audio: { ...rec(), src: "https://example.com/x.mp3" },
      curious: true,
      hidden: true,
      source: "seed",
      evil: "<script>",
      next: { script: "Next", status: "draft", curious: true, hidden: true },
    })!;
    expect(n).toEqual({ script: SCRIPT, status: "approved", curious: true, hidden: true, source: "seed", next: { script: "Next", status: "draft" } });
    expect(readExciter({ script: "   " })).toBeUndefined();
    expect(readExciter({ script: SCRIPT, audio: rec(SCRIPT, { delivery: "curious", pending: true }) })?.audio).toMatchObject({
      delivery: "curious",
      pending: true,
    });
  });
});

describe("the seeded scripts for the existing paths", () => {
  it("are 70 to 130 words each, warning-free, and not the description read out", () => {
    expect(Object.keys(DISCOVERY_EXCITER_SEEDS).sort()).toEqual(Object.keys(DISCOVERY_PATH_DESCRIPTIONS).sort());
    expect(Object.keys(SPOKEN_DESCRIPTIONS).sort()).toEqual(Object.keys(DISCOVERY_PATH_DESCRIPTIONS).sort());
    for (const [id, script] of Object.entries(DISCOVERY_EXCITER_SEEDS)) {
      const n = wordCount(script);
      expect(n, id).toBeGreaterThanOrEqual(70);
      expect(n, id).toBeLessThanOrEqual(130);
      // Opens with a question, observation or dilemma: a question within its first few sentences.
      expect(script.slice(0, 260), id).toContain("?");
      expect(exciterWarnings(script, DISCOVERY_PATH_DESCRIPTIONS[id]), id).toEqual([]);
      expect(script, id).not.toBe(SPOKEN_DESCRIPTIONS[id]);
    }
  });
});
