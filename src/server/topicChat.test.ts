import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { HttpError, userById } from "./auth";
import { syncPublishedLessons } from "./lessonRegistry";
import { lessonBySlug } from "@/content/lessons";

/* The topic assistant: answers from the hub's own content, streamed. Claude is simulated here. */

const sent = { request: null as null | { system: { text: string }[]; messages: { role: string; content: string }[] } };
const reply = { words: ["The topic ", "says **ask first**."], stop: "end_turn" };
const connected = { current: true };
vi.mock("./generate", () => ({
  client: () => {
    if (!connected.current) throw new HttpError(503, "Claude isn’t connected.");
    return {
      messages: {
        stream: (request: typeof sent.request) => {
          sent.request = request;
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of reply.words) yield { type: "content_block_delta", delta: { type: "text_delta", text } };
            },
            finalMessage: async () => ({ stop_reason: reply.stop }),
          };
        },
      },
    };
  },
}));
const { answer, prepareChat, topicText, QUESTIONS_PER_HOUR } = await import("./topicChat");

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
  connected.current = true;
  reply.stop = "end_turn";
});
const sam = () => userById(db, "sam")!;
const now = new Date("2026-10-29T04:00:00Z");
const ask = (text: string, slug = "a-little-extra-time") => prepareChat(db, sam(), { slug, messages: [{ role: "user", text }] }, now);
const collect = async (p: ReturnType<typeof prepareChat>) => {
  const out = [];
  for await (const e of answer(p)) out.push(e);
  return out;
};

describe("the topic assistant", () => {
  it("gives Claude the whole topic, card by card, including the narration", () => {
    const text = topicText(lessonBySlug("a-little-extra-time")!);
    expect(text).toMatch(/^Topic: A little extra time/);
    expect(text).toMatch(/\[Card 1: /);
    expect(text).toMatch(/Narration: /);
  });

  it("streams the answer after the sources, and only answers from hub content", async () => {
    const events = await collect(ask("Can I stay longer if the client asks for a bit more cleaning?"));
    expect(events[0].type).toBe("sources");
    expect((events[0] as { sources: unknown[] }).sources[0]).toEqual({
      title: "A little extra time",
      href: "/topics/a-little-extra-time",
      meta: "This topic",
    });
    expect(
      events
        .filter((e) => e.type === "text")
        .map((e) => (e as { text: string }).text)
        .join(""),
    ).toBe("The topic says **ask first**.");
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(sent.request!.system[0].text).toMatch(/Answer only from the Partner Hub content/);
    expect(sent.request!.system[1].text).toMatch(/<current_topic>/);
  });

  it("adds related hub content to the question", () => {
    const p = ask("What is the Aged Care Act and the Statement of Rights?");
    expect(p.sources.length).toBeGreaterThan(1);
    expect(sent.request).toBeTruthy();
    expect(p.request.messages.at(-1)!.content).toMatch(/<other_hub_content>/);
  });

  it("says so when Claude declines, and checks the question first", async () => {
    reply.stop = "refusal";
    expect((await collect(ask("Something odd"))).at(-1)).toMatchObject({ type: "error" });
    expect(() => prepareChat(db, sam(), { slug: "a-little-extra-time", messages: [] }, now)).toThrow(/Ask a question/);
    expect(() => ask("x".repeat(1001))).toThrow(/under 1000/);
    expect(() => ask("Hello", "no-such-topic")).toThrow(/not found/);
    connected.current = false;
    expect(() => ask("Hello")).toThrow(/isn’t available right now/);
    expect(() => prepareChat(db, userById(db, "jordan")!, { slug: "a-little-extra-time", messages: [{ role: "user", text: "Hi" }] }, now)).toThrow(/connected/);
  });

  it("limits how many questions one person asks in an hour", () => {
    for (let i = 0; i < QUESTIONS_PER_HOUR; i++) ask("Hello");
    expect(() => ask("Hello")).toThrow(/this hour/);
  });

  it("doesn't keep the questions", () => {
    ask("My client Mrs Jones at 4 Smith St fell over");
    expect(JSON.stringify(db.prepare("SELECT * FROM audit WHERE event = 'topic.chat'").all())).not.toMatch(/Jones/);
  });
});
