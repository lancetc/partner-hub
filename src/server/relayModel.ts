import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { client } from "./generate";
import { claudeConfigured, openaiReady, openaiTextModel } from "./openaiText";
import { CHAT_MODEL } from "./topicChat";

/*
  The model behind Ava Relay (docs/ava-relay.md). The page never names a provider or a model: the server uses
  Claude when it's connected and the Hub's OpenAI connection otherwise, and each answer records which one wrote
  it. RELAY_PROVIDER ("claude" or "openai") pins one; RELAY_CLAUDE_MODEL and OPENAI_TEXT_MODEL choose the model.
*/

export type RelayProvider = { id: "claude" | "openai"; model: string };
export const RELAY_TIMEOUT_MS = 45_000;

export function relayProvider(): RelayProvider | null {
  const want = process.env.RELAY_PROVIDER;
  const claude = claudeConfigured() ? ({ id: "claude", model: process.env.RELAY_CLAUDE_MODEL || CHAT_MODEL } as const) : null;
  const openai = openaiReady() ? ({ id: "openai", model: openaiTextModel() } as const) : null;
  if (want === "openai") return openai;
  if (want === "claude") return claude;
  return claude ?? openai;
}

export type RelayRequest = {
  /** The rules, the same for every question in a mode. */
  rules: string;
  /** What changes with the page and the learner. */
  context: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  signal?: AbortSignal;
};

/** The answer's words as they're written. Throws if the provider fails, takes too long, or the request is cancelled. */
export async function* relayText(provider: RelayProvider, req: RelayRequest): AsyncGenerator<string> {
  const signal = req.signal ? AbortSignal.any([req.signal, AbortSignal.timeout(RELAY_TIMEOUT_MS)]) : AbortSignal.timeout(RELAY_TIMEOUT_MS);
  if (provider.id === "claude") {
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: req.rules },
      // The page is the same for every question a learner asks on it, so it's cached.
      { type: "text", text: req.context, cache_control: { type: "ephemeral" } },
    ];
    const stream = client().messages.stream({ model: provider.model, max_tokens: req.maxTokens, system, messages: req.messages }, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("refused");
    return;
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      // Room for the model's own reasoning as well as a short answer.
      max_completion_tokens: req.maxTokens + 2000,
      messages: [{ role: "system", content: `${req.rules}\n\n${req.context}` }, ...req.messages],
    }),
    signal,
    cache: "no-store",
  });
  if (!res.ok || !res.body) throw new Error(`openai ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      try {
        const piece = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
        if (piece) yield piece;
      } catch {
        // A partial line: the rest arrives with the next chunk.
      }
    }
  }
}
