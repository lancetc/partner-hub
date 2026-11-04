import { describe, expect, it, vi } from "vitest";
import { openDb } from "./db";
import { userById } from "./auth";
import type { Lesson } from "@/content/lessons";
import { stageCounts, cardsByStage } from "@/lib/buildSequence";

/* Drafting with Claude in the build sequence: Hook, Show, Explain, Choose, Feedback, Apply, Recap. */

// Claude's reply, streamed in pieces; the test sets it before each draft.
let reply = "";
vi.mock("./generate", async (original) => {
  const real = await original<typeof import("./generate")>();
  return {
    ...real,
    client: () => ({
      beta: {
        messages: {
          stream: () => {
            let onText: ((delta: string, snapshot: string) => void) | null = null;
            return {
              on: (_event: string, cb: (delta: string, snapshot: string) => void) => (onText = cb),
              finalMessage: async () => {
                for (let i = 400; i < reply.length + 400; i += 400) onText?.("", reply.slice(0, i));
                return { stop_reason: "end_turn", content: [{ type: "text", text: reply }], usage: { input_tokens: 1, output_tokens: 1 } };
              },
            };
          },
        },
      },
    }),
  };
});

const { draftPrompt, generateLessonDraft, sequenceIssues, shapeDraft } = await import("./lessonDraft");
const { validateLesson } = await import("./generate");

const none = { kind: "none" as const };
const card = (id: string, stage: string, beat: number, extra: Record<string, unknown>) => ({
  id,
  stage,
  beat,
  label: id,
  heading: `The ${id} card`,
  body: "",
  visual: none,
  ...extra,
});
/** A complete topic in the build sequence, as Claude would write it. */
const sample = (): Lesson =>
  ({
    title: "When a visit changes",
    summary: "s",
    outcome: "o",
    minutes: 4,
    beats: ["Why it matters", "The situation", "What to know", "Your call", "What happened", "Your turn", "Recap"],
    start: "hook",
    nodes: {
      hook: card("hook", "hook", 0, { type: "presenter", transcript: "Hi, I’m Ava. ".repeat(20), next: "show" }),
      show: card("show", "show", 1, { type: "image", next: "explain" }),
      explain: card("explain", "explain", 2, { type: "image", next: "choose" }),
      choose: card("choose", "choose", 3, {
        type: "decision",
        prompt: "What do you do?",
        options: [
          { id: "a", label: "Tell the coordinator", correct: true, next: "good" },
          { id: "b", label: "Leave it", correct: false, next: "oops" },
        ],
      }),
      oops: card("oops", "feedback", 4, { type: "image", emphasis: "consequence", next: "choose" }),
      good: card("good", "feedback", 4, { type: "image", next: "check" }),
      check: card("check", "apply", 5, {
        type: "quiz",
        questions: [
          {
            id: "q1",
            prompt: "?",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
            correct: "a",
            feedback: { correct: "Yes.", incorrect: "Not quite." },
          },
        ],
        next: "turn",
      }),
      turn: card("turn", "apply", 5, { type: "response", prompt: "How would you handle it?", modelResponse: "An example answer.", next: "recap" }),
      recap: card("recap", "recap", 6, { type: "summary", action: "Tell the coordinator the same day.", points: ["One"] }),
    },
  }) as unknown as Lesson;

describe("drafting in the build sequence", () => {
  it("asks Claude for the seven stages, in order, each card tagged with its stage", () => {
    const p = draftPrompt({ brief: "Teach what to do when a visit changes." });
    const at = ['"hook"', '"show"', '"explain"', '"choose"', '"feedback"', '"apply"', '"recap"'].map((s) => p.indexOf(`- ${s}:`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(p).toContain("Ava, the AI presenter");
    expect(p).toContain('Every card also has "stage"');
  });

  it("passes a draft that follows the sequence, and says what's wrong with one that doesn't", () => {
    expect([...validateLesson(sample()), ...sequenceIssues(sample())]).toEqual([]);
    const skipped = sample();
    delete (skipped.nodes as Record<string, unknown>).explain;
    (skipped.nodes.show as { next: string }).next = "choose";
    expect(sequenceIssues(skipped)).toContain('no "explain" card: the lesson needs every stage');
    const wrong = sample();
    wrong.start = "show";
    (wrong.nodes.choose as { stage: string }).stage = "explain";
    delete (wrong.nodes.recap as { stage?: string }).stage;
    expect(sequenceIssues(wrong)).toEqual(
      expect.arrayContaining([
        'recap: needs "stage", one of hook, show, explain, choose, feedback, apply, recap',
        'choose: a "explain" card should be image, not decision',
        'the first card should be the "hook" presenter card',
      ]),
    );
  });

  it("counts each stage's cards in a reply that's still being written", () => {
    const text = JSON.stringify(sample());
    const half = text.slice(0, text.indexOf('"choose"', text.indexOf('"stage":"explain"')));
    expect(stageCounts(half)).toMatchObject({ hook: 1, show: 1, explain: 1, choose: 0, recap: 0 });
    expect(stageCounts(text)).toMatchObject({ hook: 1, feedback: 2, apply: 2, recap: 1 });
  });

  it("gives the hook card Ava's presenter video, ready to make in Media and voice", () => {
    const db = openDb(":memory:");
    const shaped = shapeDraft(sample(), { brief: "x", audience: "partner" }, userById(db, "jordan")!, new Date("2026-11-04T00:00:00Z"));
    expect(shaped.nodes.hook.visual).toMatchObject({ kind: "presenter", name: "Ava", video: { provider: "elevenlabs", id: "" } });
    expect(shaped.nodes.turn).toMatchObject({ visibility: expect.stringContaining("Only you") });
    expect(cardsByStage(Object.values(shaped.nodes)).map((s) => [s.key, s.cards.length])).toEqual([
      ["hook", 1],
      ["show", 1],
      ["explain", 1],
      ["choose", 1],
      ["feedback", 2],
      ["apply", 2],
      ["recap", 1],
    ]);
  });

  it("reports its progress stage by stage as Claude writes", async () => {
    reply = JSON.stringify(sample());
    const db = openDb(":memory:");
    const events: { type: string; phase?: string; counts?: Record<string, number> }[] = [];
    const { lesson } = await generateLessonDraft(db, userById(db, "jordan")!, { brief: "Teach what to do when a visit changes." }, null, new Date(), (e) =>
      events.push(e),
    );
    expect(lesson.title).toBe("When a visit changes");
    expect(events[0]).toEqual({ type: "phase", phase: "writing" });
    expect(events.at(-1)).toEqual({ type: "phase", phase: "checking" });
    const counts = events.filter((e) => e.type === "stages").map((e) => e.counts!);
    // The stages fill in order, and the last count has every card.
    expect(counts.length).toBeGreaterThan(2);
    expect(counts[0].recap).toBe(0);
    expect(counts.at(-1)).toMatchObject({ hook: 1, show: 1, explain: 1, choose: 1, feedback: 2, apply: 2, recap: 1 });
  });
});
