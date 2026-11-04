import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { catalogueInfo } from "./learningPaths";

/* Drafting learning paths and challenges with Claude: progress as it writes, checks, and one repair. */

// Claude's replies, in order; each is streamed in pieces.
let replies: string[] = [];
const asked: string[] = [];
vi.mock("./generate", async (original) => {
  const real = await original<typeof import("./generate")>();
  return {
    ...real,
    client: () => ({
      beta: {
        messages: {
          stream: (req: { messages: { content: unknown }[] }) => {
            asked.push(JSON.stringify(req.messages));
            const reply = replies.shift() ?? "";
            let onText: ((d: string, s: string) => void) | null = null;
            return {
              on: (_e: string, cb: (d: string, s: string) => void) => (onText = cb),
              finalMessage: async () => {
                for (let i = 60; i < reply.length + 60; i += 60) onText?.("", reply.slice(0, i));
                return { stop_reason: "end_turn", content: [{ type: "text", text: reply }], usage: {} };
              },
            };
          },
        },
      },
    }),
  };
});

const { generatePathDraft, pathIssues } = await import("./pathDraft");
const { generateChallengeDraft, challengeIssues } = await import("./challengeDraft");

let db: Db;
let slugs: string[];
beforeEach(() => {
  db = openDb(":memory:");
  replies = [];
  asked.length = 0;
  slugs = catalogueInfo(db)
    .filter((t) => !t.draft)
    .map((t) => t.slug);
});
const jordan = () => userById(db, "jordan")!;

const path = (topics: unknown[]) =>
  JSON.stringify({
    whoFor: "New coordinators.",
    name: "Coordination basics",
    description: "What you need first.",
    audience: "Care Coordinators",
    outcomes: [{ outcome: "Know who to call" }, { outcome: "Manage a budget" }],
    chapters: [
      { chapter: "Your team", description: "Who helps.", stage: "", topics: topics.slice(0, 1) },
      { chapter: "Your work", description: "The day to day.", stage: "", topics: topics.slice(1) },
    ],
  });

describe("drafting a learning path", () => {
  it("uses existing topics and names new ones, reporting each step as Claude writes", async () => {
    replies = [path([{ slug: slugs[0] }, { slug: slugs[1] }, { newTopic: "Handling a complaint" }])];
    const events: { type: string; counts?: Record<string, number>; details?: Record<string, string>; phase?: string }[] = [];
    const { draft } = await generatePathDraft(db, jordan(), { brief: "A path for new coordinators.", audience: "coordinator" }, null, new Date(), (e) =>
      events.push(e),
    );
    expect(draft).toMatchObject({ name: "Coordination basics", outcomes: ["Know who to call", "Manage a budget"] });
    expect(draft.chapters[1].topics).toEqual([{ slug: slugs[1] }, { newTopic: "Handling a complaint" }]);
    // The catalogue went to Claude, so it can reuse topics.
    expect(asked[0]).toContain(slugs[0]);
    const stages = events.filter((e) => e.type === "stages");
    expect(stages[0].counts).toMatchObject({ who: 1, outcomes: 0, chapters: 0 });
    expect(stages.at(-1)).toMatchObject({ counts: { who: 1, outcomes: 2, chapters: 2 }, details: { chapters: "2 chapters · 2 existing topics · 1 new" } });
    expect(events.at(-1)).toEqual({ type: "phase", phase: "checking", issues: undefined });
  });

  it("catches made-up and repeated topics, and gives Claude one chance to fix them", async () => {
    expect(pathIssues(JSON.parse(path([{ slug: "not-a-topic" }, { slug: slugs[0] }, { slug: slugs[0] }])), new Set(slugs))).toEqual([
      '"not-a-topic" isn\'t an existing topic: use a slug from the list, or "newTopic"',
      `"${slugs[0]}" appears more than once`,
    ]);
    replies = [path([{ slug: "not-a-topic" }, { slug: slugs[0] }]), path([{ newTopic: "Something new" }, { slug: slugs[0] }])];
    const phases: string[] = [];
    const { draft } = await generatePathDraft(db, jordan(), { brief: "A path for new coordinators.", audience: "core" }, null, new Date(), (e) => {
      if (e.type === "phase") phases.push(e.phase);
    });
    expect(draft.chapters[0].topics).toEqual([{ newTopic: "Something new" }]);
    expect(phases).toEqual(["writing", "checking", "fixing", "checking"]);
    expect(asked[1]).toContain("not-a-topic");
  });

  it("is for learning authors", async () => {
    await expect(generatePathDraft(db, userById(db, "sam")!, { brief: "A long enough brief.", audience: "core" }, null, new Date())).rejects.toThrow();
  });
});

describe("drafting a challenge", () => {
  const challenge = (n: number) =>
    JSON.stringify({
      name: "Trilogy Challenge: Rosa’s Week",
      tagline: "Five days, five calls to make.",
      story: "Rosa starts with a new client on Monday.",
      missions: Array.from({ length: n }, (_, i) =>
        i === n - 1 ? { day: i + 1, beat: `Day ${i + 1}.`, newTopic: "Friday’s big call" } : { day: i + 1, beat: `Day ${i + 1}.`, slug: slugs[i] },
      ),
    });

  it("plans one mission a day with a story beat, reporting each step as Claude writes", async () => {
    replies = [challenge(5)];
    const events: { type: string; counts?: Record<string, number>; details?: Record<string, string> }[] = [];
    const { draft } = await generateChallengeDraft(db, jordan(), { brief: "A week on noticing change.", days: 5 }, null, new Date(), (e) => events.push(e));
    expect(draft.missions).toHaveLength(5);
    expect(draft.missions[4]).toEqual({ day: 5, beat: "Day 5.", newTopic: "Friday’s big call" });
    expect(events.filter((e) => e.type === "stages").at(-1)).toMatchObject({
      counts: { theme: 1, story: 1, missions: 5 },
      details: { missions: "5 of 5 days · 4 existing topics · 1 new" },
    });
  });

  it("needs one mission for each day, each a different topic", () => {
    const known = new Set(slugs);
    expect(challengeIssues(JSON.parse(challenge(4)), known, 5)).toContain("needs exactly 5 missions, one a day");
    const twice = JSON.parse(challenge(3));
    twice.missions[1].slug = twice.missions[0].slug;
    expect(challengeIssues(twice, known, 3)).toContain(`"${slugs[0]}" is used on more than one day`);
  });
});
