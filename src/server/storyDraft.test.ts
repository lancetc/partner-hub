import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { HttpError, userById } from "./auth";

/* The News editor's writer: a brief in, a complete news item out. Claude is simulated here. */

const reply = { json: {} as Record<string, unknown>, stop: "end_turn", prompt: "" };
const connected = { current: true };
vi.mock("./generate", () => ({
  GENERATION_MODEL: "claude-opus-5-5",
  client: () => {
    if (!connected.current) throw new HttpError(503, "Claude isn’t connected.");
    return {
      messages: {
        stream: (req: { messages: { content: string }[] }) => {
          reply.prompt = req.messages[0].content;
          return { finalMessage: async () => ({ stop_reason: reply.stop, usage: {}, content: [{ type: "text", text: JSON.stringify(reply.json) }] }) };
        },
      },
    };
  },
}));
const { draftStory } = await import("./storyDraft");

let db: Db;
const now = new Date("2026-10-29T04:00:00Z");
const brief = "From 1 December partners must log visit notes in the Trilogy Care Portal on the day of the visit. Applies to all partners.";
const answer = (over: Record<string, unknown> = {}) => ({
  title: "Log visit notes on the day",
  dek: "From 1 December, notes go into the Trilogy Care Portal the same day.",
  category: "policy",
  audience: ["partner"],
  byline: "Trilogy Care team",
  body: [
    { type: "p", text: "From **1 December**, log your notes on the day.", items: [], cite: "" },
    { type: "list", text: "", items: ["Open the portal", "Add the note"], cite: "" },
  ],
  seoTitle: "Log visit notes on the day from 1 December",
  seoDescription: "What changes for Care Partners from 1 December, and how to log notes in the Trilogy Care Portal.",
  imageIdea: "A support worker typing notes on a phone in a car.",
  policy: {
    status: "announced",
    issuer: "Trilogy Care",
    sourceTitle: "Operations update",
    sourceUrl: "",
    published: "2026-11-20",
    effective: "2026-12-01",
    owner: "",
  },
  ...over,
});
beforeEach(() => {
  db = openDb(":memory:");
  connected.current = true;
  reply.stop = "end_turn";
  reply.json = answer();
});
const jordan = () => userById(db, "jordan")!;

describe("writing a story from a brief", () => {
  it("fills in every field, ready to check", async () => {
    const { story, imageIdea } = await draftStory(db, jordan(), brief, now);
    expect(story).toMatchObject({
      title: "Log visit notes on the day",
      category: "policy",
      audience: ["partner"],
      date: now.toISOString(),
      seo: { title: "Log visit notes on the day from 1 December" },
      policy: { effective: "2026-12-01", status: "announced" },
    });
    expect(story.body).toEqual([
      { type: "p", text: "From **1 December**, log your notes on the day." },
      { type: "list", items: ["Open the portal", "Add the note"] },
    ]);
    expect(imageIdea).toMatch(/support worker/);
    expect(reply.prompt).toContain("<brief>");
    expect(reply.prompt).toContain("Use only the facts in the brief");
  });

  it("leaves policy details off other stories, and drops a link that isn't a web address", async () => {
    reply.json = answer({ category: "trilogy" });
    expect((await draftStory(db, jordan(), brief, now)).story.policy).toBeUndefined();
    reply.json = answer({ policy: { ...answer().policy, sourceUrl: "javascript:alert(1)" } });
    expect((await draftStory(db, jordan(), brief, now)).story.policy?.sourceUrl).toBe("");
  });

  it("needs a real brief, an author, and says when Claude can't help", async () => {
    await expect(draftStory(db, jordan(), "Too short", now)).rejects.toThrow(/a little more/);
    await expect(draftStory(db, userById(db, "sam")!, brief, now)).rejects.toThrow(/learning authors/);
    reply.stop = "refusal";
    await expect(draftStory(db, jordan(), brief, now)).rejects.toThrow(/declined/);
    connected.current = false;
    await expect(draftStory(db, jordan(), brief, now)).rejects.toThrow(/connected/);
  });
});
