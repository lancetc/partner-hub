import { describe, expect, it } from "vitest";
import type { Card } from "@/content/lessons";
import { completionGate } from "./completionGate";

/* Required completion: learners can't skip a card until its audio, video or activity is done. */

const base = { beat: 0, label: "", heading: "", body: "", visual: { kind: "none" as const }, requireComplete: true };
const listen = { ...base, id: "l", type: "listen", script: "Hello there.", next: "x" } as Card;
const video = {
  ...base,
  id: "v",
  type: "presenter",
  transcript: "",
  durationSec: 30,
  next: "x",
  visual: { kind: "presenter", name: "A", synthetic: true, tone: "teal", alt: "", video: { provider: "youtube", id: "dQw4w9WgXcQ", title: "t" } },
} as Card;
const reflect = { ...base, id: "r", type: "response", prompt: "?", modelResponse: "", visibility: "", next: "x" } as Card;
const quiz = { ...base, id: "q", type: "quiz", narration: "Read this.", questions: [] } as unknown as Card;
const ctx = (over: Partial<Parameters<typeof completionGate>[1]> = {}) => ({
  answers: {},
  finished: new Set<string>(),
  exempt: false,
  narration: { playable: true, state: "playing" },
  speaks: true,
  ...over,
});

describe("required completion", () => {
  it("holds an audio card until the audio ends", () => {
    expect(completionGate(listen, ctx())).toMatch(/Listen to the end/);
    expect(completionGate(listen, ctx({ narration: { playable: true, state: "ended" } }))).toBeNull();
  });

  it("never traps anyone: audio that can't play, reviews, previews and cards already passed", () => {
    expect(completionGate(listen, ctx({ narration: { playable: false, state: "idle" } }))).toBeNull();
    expect(completionGate(listen, ctx({ exempt: true }))).toBeNull();
    expect(completionGate(listen, ctx({ finished: new Set(["l"]) }))).toBeNull();
    // Moved on from in an earlier visit, saved with their progress.
    expect(completionGate(listen, ctx({ answers: { "done:l": 1 } }))).toBeNull();
  });

  it("holds a video until it's finished, and a Reflect card until something is written", () => {
    expect(completionGate(video, ctx())).toMatch(/Watch the video/);
    expect(completionGate(video, ctx({ finished: new Set(["v"]) }))).toBeNull();
    expect(completionGate(reflect, ctx({ answers: { r: "ok" } }))).toMatch(/Write your answer/);
    expect(completionGate(reflect, ctx({ speaks: false, answers: { r: "I would ask first" } }))).toBeNull();
  });

  it("leaves cards alone when nothing is switched on, or when answering already holds them", () => {
    expect(completionGate({ ...listen, requireComplete: false }, ctx({ holdForAudio: false }))).toBeNull();
    expect(completionGate(quiz, ctx({ holdForAudio: false }))).toBeNull();
  });
});

describe("holding for audio", () => {
  const plain = { ...base, requireComplete: false, id: "p", type: "audio", script: "Some narration.", next: "x" } as Card;

  it("holds every narrated card until its audio ends, unless the lesson turns it off", () => {
    expect(completionGate(plain, ctx())).toMatch(/Listen to the end/);
    expect(completionGate(plain, ctx({ narration: { playable: true, state: "ended" } }))).toBeNull();
    expect(completionGate(plain, ctx({ holdForAudio: false }))).toBeNull();
  });

  it("waits for a question to be read out, but not for a card with nothing to say", () => {
    expect(completionGate({ ...quiz, requireComplete: false }, ctx())).toMatch(/Listen to the end/);
    expect(completionGate({ ...plain, type: "image" } as Card, ctx({ speaks: false, narration: null }))).toBeNull();
  });

  it("still never traps anyone when the audio can't play", () => {
    expect(completionGate(plain, ctx({ narration: { playable: false, state: "idle" } }))).toBeNull();
    expect(completionGate(plain, ctx({ exempt: true }))).toBeNull();
  });
});

describe("required reading", () => {
  const doc = (required?: "open" | "end") =>
    ({ ...base, requireComplete: false, id: "d", type: "image", next: "x", pdf: { src: "/api/uploads/a.pdf", title: "Policy", required } }) as Card;
  const quiet = { narration: null, speaks: false };

  it("holds until the document is opened", () => {
    expect(completionGate(doc("open"), ctx(quiet))).toBe("Open the document to continue");
    expect(completionGate(doc("open"), ctx({ ...quiet, answers: { "pdf:d": "opened" } }))).toBeNull();
  });

  it("holds until the last page has been reached", () => {
    expect(completionGate(doc("end"), ctx({ ...quiet, answers: { "pdf:d": "opened" } }))).toBe("Read the document to the end to continue");
    expect(completionGate(doc("end"), ctx({ ...quiet, answers: { "pdf:d": "end" } }))).toBeNull();
  });

  it("doesn't hold when reading isn't required, or in a review or preview", () => {
    expect(completionGate(doc(), ctx(quiet))).toBeNull();
    expect(completionGate(doc("end"), ctx({ ...quiet, exempt: true }))).toBeNull();
  });
});
