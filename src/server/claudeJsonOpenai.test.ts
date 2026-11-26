import { afterEach, describe, expect, it, vi } from "vitest";
import { askForJson } from "./claudeJson";

/* Drafting without Claude: the Hub's OpenAI key writes the JSON from the same documents and prompt. (No real calls.) */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { total_tokens: 10 } }));

describe("askForJson with only OpenAI connected", () => {
  it("sends the text documents, PDFs and prompt to OpenAI, checks the reply, and retries once with the problems", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const bodies: { messages: { role: string; content: unknown }[]; response_format: unknown }[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? reply('{"pages": []}') : reply('{"pages": [{"title": "One"}]}');
    });
    vi.stubGlobal("fetch", fetch);
    const phases: string[] = [];
    const { value, usage } = await askForJson<{ pages: unknown[] }>(
      [
        { type: "document", source: { type: "text", media_type: "text/plain", data: "Policy words." }, title: "policy.txt" },
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" }, title: "guide.pdf" },
        { type: "text", text: "Write the outline as JSON." },
      ],
      (v) => ((v as { pages: unknown[] }).pages.length ? [] : ["There are no pages."]),
      { onText: () => {}, onPhase: (p) => phases.push(p) },
    );
    expect(value.pages).toHaveLength(1);
    expect(usage).toMatchObject({ provider: "openai" });
    expect(fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const first = bodies[0].messages[0].content as { type: string; text?: string; file?: { filename: string; file_data: string } }[];
    expect(first[0]).toEqual({ type: "text", text: '<document title="policy.txt">\nPolicy words.\n</document>' });
    expect(first[1]).toEqual({ type: "file", file: { filename: "guide.pdf", file_data: "data:application/pdf;base64,JVBERi0=" } });
    expect(first[2]).toEqual({ type: "text", text: "Write the outline as JSON." });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    // The retry shows OpenAI its previous reply and the problems found.
    expect(bodies[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(bodies[1].messages[2].content)).toMatch(/There are no pages/);
    expect(phases).toEqual(["checking", "fixing", "checking"]);
  });
});
