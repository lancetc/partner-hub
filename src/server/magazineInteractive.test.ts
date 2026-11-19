import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide, recordGuideEvent } from "./magazine";
import { pageIssues } from "./magazineDraft";

/* The Magazine's interactive blocks on the server: confidence ratings, how activities went, reflections with Claude's feedback, and drafting them with AI. */

const ask = vi.hoisted(() => vi.fn());
vi.mock("./claudeJson", async (original) => ({ ...(await original<typeof import("./claudeJson")>()), askForJson: ask }));
const { reflect } = await import("./magazineReflect");

let db: Db;
let made = 0;
let author: User, coordinator: User;
const now = new Date("2026-11-19T00:00:00Z");

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  coordinator = userById(db, "riley")!;
  ask.mockReset();
});

const doc = (blocks: unknown[]): unknown => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "one", title: "One", blocks }] }],
});

/** A published one-page course with these blocks, as a coordinator reads it. */
function published(blocks: unknown[], audience: string[] = ["coordinator"]) {
  const g = createGuide(db, author, { title: `Practice ${++made}`, completion: "confirm", audience, doc: doc(blocks) }, now);
  publishGuide(db, author, g.id, "", now);
  return readGuide(db, coordinator, g.slug);
}

const events = () =>
  db.prepare("SELECT event, block_id, detail FROM magazine_events WHERE user_id = 'riley' ORDER BY id").all() as {
    event: string;
    block_id: string;
    detail: string;
  }[];

describe("confidence checks", () => {
  it("keeps each rating with the reader's answers, so a later check can show the change", () => {
    const g = published([
      { id: "before", type: "confidence", statement: "How confident are you with incidents?" },
      { id: "after", type: "confidence", statement: "And now?", compareWith: "before" },
    ]);
    recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId: g.revisionId }, now);
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "confidence", revisionId: g.revisionId, blockId: "before", rating: 7 }, now)).toThrow(
      /1 to 5/,
    );
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "confidence", revisionId: g.revisionId, blockId: "nope", rating: 2 }, now)).toThrow(
      /isn’t in this course/,
    );
    recordGuideEvent(db, coordinator, g.id, { event: "confidence", revisionId: g.revisionId, blockId: "before", rating: 2 }, now);
    recordGuideEvent(db, coordinator, g.id, { event: "confidence", revisionId: g.revisionId, blockId: "after", rating: 4 }, now);
    expect(readGuide(db, coordinator, g.slug).progress.answers).toMatchObject({ before: "2", after: "4" });
    const rated = events().filter((e) => e.event === "confidence.rated");
    expect(rated.map((e) => JSON.parse(e.detail))).toEqual([
      { rating: 2, compareWith: null },
      { rating: 4, compareWith: "before" },
    ]);
  });
});

describe("activities", () => {
  it("records how a scenario ended and keeps nothing but the outcome and score", () => {
    const g = published([
      {
        id: "story",
        type: "branching",
        title: "",
        scenes: [
          { id: "s1", text: "Start", choices: [{ id: "go", text: "Go", next: "s2" }] },
          { id: "s2", text: "End", ending: { outcome: "good", summary: "Well done." } },
        ],
      },
      { id: "t", type: "text", body: "Words." },
    ]);
    recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId: g.revisionId }, now);
    recordGuideEvent(
      db,
      coordinator,
      g.id,
      { event: "activity", revisionId: g.revisionId, blockId: "story", detail: { outcome: "good", score: 1, secret: "my notes" } },
      now,
    );
    expect(() => recordGuideEvent(db, coordinator, g.id, { event: "activity", revisionId: g.revisionId, blockId: "t", detail: {} }, now)).toThrow(
      /activity isn’t/,
    );
    const done = events().find((e) => e.event === "branching.done");
    expect(done?.block_id).toBe("story");
    expect(JSON.parse(done!.detail)).toEqual({ outcome: "good", score: 1 });
  });
});

describe("reflections", () => {
  const block = {
    id: "think",
    type: "reflection",
    prompt: "How would you handle a dignity-of-risk situation?",
    guidance: "Respect choice; talk through risks; record it.",
    minWords: 5,
  };

  it("saves the answer, asks Claude with the author's guidance, and keeps the feedback for the reader", async () => {
    const g = published([block]);
    ask.mockResolvedValue({
      value: { summary: "  A thoughtful answer.  ", strengths: ["You put her choice first."], consider: ["Record the conversation.", ""] },
    });
    const out = await reflect(
      db,
      coordinator,
      g.slug,
      { revisionId: g.revisionId, blockId: "think", response: "I would talk with her about what matters most to her." },
      now,
    );
    expect(out.feedback).toEqual({ summary: "A thoughtful answer.", strengths: ["You put her choice first."], consider: ["Record the conversation."] });
    const prompt = ask.mock.calls[0][0][0].text as string;
    expect(prompt).toContain("Respect choice; talk through risks");
    expect(prompt).toContain("what matters most to her");
    expect(readGuide(db, coordinator, g.slug).progress.reflections.think).toMatchObject({
      response: expect.stringContaining("matters most"),
      feedback: { summary: "A thoughtful answer." },
    });
    // Only the word count is in the event log, never the answer.
    expect(JSON.parse(events().find((e) => e.event === "reflection.answered")!.detail)).toEqual({ words: 11 });
  });

  it("keeps the answer when Claude can't reply, and refuses short or misplaced answers", async () => {
    const g = published([block]);
    await expect(reflect(db, coordinator, g.slug, { revisionId: g.revisionId, blockId: "think", response: "Too short" }, now)).rejects.toThrow(
      /at least 5 words/,
    );
    await expect(reflect(db, coordinator, g.slug, { revisionId: g.revisionId, blockId: "nope", response: "one two three four five" }, now)).rejects.toThrow(
      /isn’t in this course/,
    );
    await expect(reflect(db, coordinator, g.slug, { revisionId: "old", blockId: "think", response: "one two three four five" }, now)).rejects.toThrow(
      /updated/,
    );
    ask.mockRejectedValue(new Error("overloaded"));
    await expect(reflect(db, coordinator, g.slug, { revisionId: g.revisionId, blockId: "think", response: "one two three four five" }, now)).rejects.toThrow(
      /overloaded/,
    );
    expect(readGuide(db, coordinator, g.slug).progress.reflections.think).toMatchObject({ response: "one two three four five", feedback: null });
  });
});

describe("drafting the new blocks with AI", () => {
  it("accepts a branching scenario that names its own scenes, and a conversation and process", () => {
    const page = {
      sections: [
        {
          title: "Practise",
          blocks: [
            {
              type: "branching",
              scenes: [
                {
                  id: "s1",
                  text: "Margaret is upset.",
                  choices: [
                    { text: "Listen", next: "s2" },
                    { text: "Promise it won't happen", next: "s3" },
                  ],
                },
                { id: "s2", text: "She explains.", ending: { outcome: "good", summary: "Listening first works." } },
                { id: "s3", text: "You can't keep it.", ending: { outcome: "poor", summary: "Don't promise beyond your authority." } },
              ],
            },
            {
              type: "conversation",
              person: "Anna",
              role: "Daughter",
              setting: "Phone call",
              turns: [
                {
                  line: "Why do we pay?",
                  responses: [
                    { text: "Let me explain.", verdict: "best", feedback: "Clear." },
                    { text: "Rules.", verdict: "risky", feedback: "Dismissive." },
                  ],
                },
              ],
            },
            { type: "process", steps: [{ title: "Listen" }, { title: "Acknowledge" }, { title: "Clarify" }] },
            { type: "confidence", id: "c-start", statement: "How confident are you?" },
            { type: "confidence", statement: "And now?", compareWith: "c-start" },
          ],
        },
      ],
    };
    expect(pageIssues(page)).toEqual([]);
  });

  it("sends back incomplete scenarios and blocks it can't fill", () => {
    const issues = pageIssues({
      sections: [
        {
          title: "A",
          blocks: [
            { type: "branching", scenes: [{ id: "s1", text: "Start", choices: [{ text: "Go", next: "s1" }] }] },
            { type: "spot", prompt: "Find it", media: { src: "", alt: "" }, mistakes: [] },
            { type: "reflection", prompt: "Why?", guidance: "" },
          ],
        },
      ],
    }).join(" ");
    expect(issues).toMatch(/at least one ending/);
    expect(issues).toMatch(/don’t use spot/);
    expect(issues).toMatch(/question and guidance/);
  });
});

describe("an insight wall in a course", () => {
  it("opens colleagues' answers once you've posted, for people who can read the course", async () => {
    const { postToWall, readWall } = await import("./walls");
    const g = published([{ id: "share", type: "wall", prompt: "What helps a worried family member feel heard?" }], []);
    const key = `magazine:${g.id}`;
    const other = userById(db, "ash")!;
    postToWall(db, coordinator, key, "share", "Let them finish before you explain.", now);
    // Someone who hasn't posted sees how many have, but not what they said.
    expect(readWall(db, other, key, "share")).toMatchObject({ prompt: "What helps a worried family member feel heard?", total: 1, mine: null, posts: [] });
    expect(postToWall(db, other, key, "share", "Repeat back what you heard.", now)).toMatchObject({
      total: 2,
      posts: [{ text: "Let them finish before you explain." }],
    });
    expect(() => readWall(db, coordinator, key, "nope")).toThrow(/not found/);
    expect(() => readWall(db, coordinator, "magazine:nope", "share")).toThrow(/not found/);
    // A course someone can't read has no wall for them.
    const closed = published([{ id: "share", type: "wall", prompt: "Coordinators only" }]);
    expect(() => postToWall(db, other, `magazine:${closed.id}`, "share", "Hello there.", now)).toThrow(/not found/);
  });
});

describe("a poll in a course", () => {
  it("takes one vote each, which can change, and shows everyone's answers", async () => {
    const { pollResults, vote } = await import("./polls");
    const g = published(
      [
        {
          id: "how-often",
          type: "poll",
          question: "How often do you review a budget?",
          options: [
            { id: "monthly", text: "Monthly" },
            { id: "quarterly", text: "Quarterly" },
          ],
        },
      ],
      [],
    );
    const key = `magazine:${g.id}`;
    vote(db, coordinator, key, "how-often", "monthly", now);
    expect(vote(db, userById(db, "ash")!, key, "how-often", "quarterly", now)).toEqual({ counts: { monthly: 1, quarterly: 1 }, total: 2, mine: "quarterly" });
    expect(vote(db, coordinator, key, "how-often", "quarterly", now)).toMatchObject({ counts: { monthly: 0, quarterly: 2 }, mine: "quarterly" });
    expect(() => vote(db, coordinator, key, "how-often", "weekly", now)).toThrow(/Pick one/);
    expect(() => pollResults(db, coordinator, key, "nope")).toThrow(/Poll not found/);
  });
});

describe("watching a video", () => {
  it("records starting, half way and finishing, and nothing else", () => {
    const g = published([
      { id: "clip", type: "video", title: "Hello", src: "/images/magazine/x.mp4", captions: "/images/magazine/x.vtt", transcript: "Hello." },
    ]);
    recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId: g.revisionId }, now);
    for (const outcome of ["started", "half", "finished"])
      recordGuideEvent(db, coordinator, g.id, { event: "activity", revisionId: g.revisionId, blockId: "clip", detail: { outcome } }, now);
    expect(() =>
      recordGuideEvent(db, coordinator, g.id, { event: "activity", revisionId: g.revisionId, blockId: "clip", detail: { outcome: "understood" } }, now),
    ).toThrow(/Unknown video event/);
    expect(
      events()
        .filter((e) => e.event.startsWith("video."))
        .map((e) => e.event),
    ).toEqual(["video.started", "video.half", "video.finished"]);
  });
});

describe("the teleprompter", () => {
  it("asks Claude for a spoken script of the length chosen, from what the page says", async () => {
    const { teleprompterScript } = await import("./magazineScript");
    const g = createGuide(
      db,
      author,
      {
        title: "Handling complaints",
        completion: "confirm",
        doc: doc([
          { id: "t", type: "text", heading: "Listen first", body: "Let the client **finish** before you explain." },
          { id: "v", type: "video", title: "", src: "", transcript: "" },
        ]),
      },
      now,
    );
    ask.mockResolvedValue({ value: { script: "  Hi, I'm here to talk about complaints.  " } });
    expect(await teleprompterScript(db, author, g.id, { blockId: "v", seconds: 120, notes: "Mention Margaret" })).toEqual({
      script: "Hi, I'm here to talk about complaints.",
    });
    const prompt = ask.mock.calls[0][0][0].text as string;
    expect(prompt).toContain("Let the client finish before you explain.");
    expect(prompt).toContain("about 280 words");
    expect(prompt).toContain("Mention Margaret");
    await expect(teleprompterScript(db, coordinator, g.id, { blockId: "v" })).rejects.toThrow();
  });
});

describe("drafting the practice blocks with AI", () => {
  it("accepts sorting with its own group names, sequencing, matching and fill in the blank", () => {
    const issues = pageIssues({
      sections: [
        {
          title: "Practise",
          blocks: [
            {
              type: "sorting",
              prompt: "Sort them",
              groups: [
                { id: "g1", label: "Prompting" },
                { id: "g2", label: "Administering" },
              ],
              items: [
                { text: "Saying it's time for tablets", group: "g1", feedback: "A reminder." },
                { text: "Crushing a tablet", group: "g2", feedback: "Changing the medication." },
              ],
            },
            { type: "sequencing", prompt: "Order", steps: [{ text: "Make safe" }, { text: "Call 000" }, { text: "Report to TC" }], feedback: "Safety first." },
            {
              type: "matching",
              prompt: "Match",
              pairs: [
                { left: "SIRS", right: "Serious incidents" },
                { left: "Code", right: "Conduct" },
              ],
              feedback: "",
            },
            { type: "fillblank", text: "Call [[000]] first.", feedback: "" },
          ],
        },
      ],
    });
    expect(issues).toEqual([]);
    expect(pageIssues({ sections: [{ title: "A", blocks: [{ type: "hotspots", media: { src: "", alt: "" }, spots: [] }] }] }).join(" ")).toMatch(
      /don’t use hotspots/,
    );
  });
});

describe("moving on to the latest edition", () => {
  it("lets a reader finishing an older edition switch to the newest one, starting it afresh", async () => {
    const { publishGuide, saveGuideDraft } = await import("./magazine");
    const g = published([{ id: "t", type: "text", body: "First edition." }]);
    recordGuideEvent(db, coordinator, g.id, { event: "opened", revisionId: g.revisionId }, now);
    saveGuideDraft(db, author, g.id, { doc: doc([{ id: "t", type: "text", body: "Second edition." }]) }, now);
    publishGuide(db, author, g.id, "", now);
    const before = readGuide(db, coordinator, g.slug);
    expect(before).toMatchObject({ revision: 1, olderEdition: true });
    expect(recordGuideEvent(db, coordinator, g.id, { event: "switch", revisionId: before.revisionId }, now)).toEqual({ ok: true, switched: true });
    expect(readGuide(db, coordinator, g.slug)).toMatchObject({ revision: 2, olderEdition: false });
    expect(events().some((e) => e.event === "edition.switched")).toBe(true);
  });
});
