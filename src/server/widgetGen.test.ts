import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { HttpError, userById } from "./auth";
import { widgetDocument } from "@/lib/widgetFrame";

/* Widget cards: Claude builds a small HTML widget from an author's description. Claude is simulated here. */

const reply = { text: "", stop: "end_turn", prompt: "" };
const connected = { current: true };
vi.mock("./generate", () => ({
  GENERATION_MODEL: "claude-opus-5-5",
  client: () => {
    if (!connected.current) throw new HttpError(503, "Claude isn’t connected.");
    return {
      messages: {
        stream: (req: { messages: { content: string }[] }) => {
          reply.prompt = req.messages[0].content;
          return { finalMessage: async () => ({ stop_reason: reply.stop, usage: {}, content: [{ type: "text", text: reply.text }] }) };
        },
      },
    };
  },
}));
const { buildWidget, parseWidget, BUILDS_PER_HOUR } = await import("./widgetGen");

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  connected.current = true;
  reply.stop = "end_turn";
  reply.text = "<alt>A slider that shows the cost of a visit.</alt>\n<widget>\n<p>Hello</p>\n</widget>";
});
const jordan = () => userById(db, "jordan")!;
const now = new Date("2026-10-29T04:00:00Z");

describe("building widgets", () => {
  it("returns the widget and its screen reader description", async () => {
    const out = await buildWidget(db, jordan(), { request: "A cost slider", lesson: "Budgets" }, now);
    expect(out).toEqual({ alt: "A slider that shows the cost of a visit.", html: "<p>Hello</p>" });
    expect(reply.prompt).toContain("<request>A cost slider</request>");
    expect(reply.prompt).toContain("Lesson: Budgets");
  });

  it("sends the current widget and the change when asking for a change", async () => {
    await buildWidget(db, jordan(), { request: "A cost slider", html: "<p>Old</p>", change: "Bigger buttons" }, now);
    expect(reply.prompt).toContain("<current>\n<p>Old</p>\n</current>");
    expect(reply.prompt).toContain("<change>Bigger buttons</change>");
  });

  it("is for learning authors only, and needs a description", async () => {
    await expect(buildWidget(db, userById(db, "sam")!, { request: "x" }, now)).rejects.toThrow(/learning authors/);
    await expect(buildWidget(db, jordan(), { request: "  " }, now)).rejects.toThrow(/Describe/);
  });

  it("explains a reply that isn't a widget, a refusal, or no connection", async () => {
    reply.text = "Sorry, here is some prose.";
    await expect(buildWidget(db, jordan(), { request: "x" }, now)).rejects.toThrow(/wasn’t a widget/);
    reply.stop = "refusal";
    await expect(buildWidget(db, jordan(), { request: "x" }, now)).rejects.toThrow(/declined/);
    connected.current = false;
    await expect(buildWidget(db, jordan(), { request: "x" }, now)).rejects.toThrow(/connected/);
  });

  it("limits how many widgets one author builds in an hour", async () => {
    for (let i = 0; i < BUILDS_PER_HOUR; i++) await buildWidget(db, jordan(), { request: "x" }, now);
    await expect(buildWidget(db, jordan(), { request: "x" }, now)).rejects.toThrow(/later/);
    await expect(buildWidget(db, jordan(), { request: "x" }, new Date(now.getTime() + 3700_000))).resolves.toBeTruthy();
  });

  it("strips code fences Claude sometimes adds", () => {
    expect(parseWidget("<alt>A</alt><widget>```html\n<b>x</b>\n```</widget>")?.html).toBe("<b>x</b>");
  });
});

describe("the widget's frame", () => {
  it("blocks the network before any widget code runs", () => {
    const doc = widgetDocument("<script>fetch('https://x.example')</script>", "t1");
    const csp = doc.indexOf("Content-Security-Policy");
    expect(csp).toBeGreaterThan(0);
    expect(csp).toBeLessThan(doc.indexOf("fetch("));
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("connect-src");
  });
});
