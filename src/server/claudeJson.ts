import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./auth";
import { client, GENERATION_MODEL } from "./generate";
import type { readSource } from "./lessonDraft";

/*
  Asks Claude for a JSON object and streams the reply, so the editor can show progress as it's
  written. Used to draft learning paths and challenges (topics have their own, in lessonDraft).
*/

type Source = Awaited<ReturnType<typeof readSource>>;

/** The source document (if any), then the prompt. */
export function contentFor(prompt: string, source?: Source): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (source?.kind === "pdf")
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: source.data }, title: source.name });
  if (source?.kind === "text") content.push({ type: "document", source: { type: "text", media_type: "text/plain", data: source.text }, title: source.name });
  content.push({ type: "text", text: prompt });
  return content;
}

async function ask(content: Anthropic.Beta.BetaContentBlockParam[], onText: (soFar: string) => void, repair?: { previous: string; correction: string }) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  if (repair) messages.push({ role: "assistant", content: repair.previous }, { role: "user", content: repair.correction });
  const stream = client().beta.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  });
  stream.on("text", (_delta, snapshot) => onText(snapshot));
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new HttpError(502, "Claude declined to write this. Try rewording the brief.");
  if (message.stop_reason === "max_tokens") throw new HttpError(502, "Claude’s reply was cut off. Try a smaller brief.");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { text, usage: message.usage };
}

/**
  Gets a JSON object from Claude that passes `check` (which returns problems, or none). If the first
  reply doesn't, Claude is shown the problems and asked once to fix them.
*/
export async function askForJson<T>(
  content: Anthropic.Beta.BetaContentBlockParam[],
  check: (value: unknown) => string[],
  progress: { onText: (soFar: string) => void; onPhase: (phase: "checking" | "fixing", issues?: number) => void },
): Promise<{ value: T; usage: unknown }> {
  const parse = (text: string) => {
    try {
      const value = JSON.parse(text) as unknown;
      return { value, issues: check(value) };
    } catch {
      return { value: null, issues: ["The reply wasn’t valid JSON."] };
    }
  };
  let { text, usage } = await ask(content, progress.onText);
  progress.onPhase("checking");
  let result = parse(text);
  if (result.issues.length) {
    progress.onPhase("fixing", result.issues.length);
    ({ text, usage } = await ask(content, progress.onText, {
      previous: text,
      correction: `Your previous reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
    }));
    progress.onPhase("checking");
    result = parse(text);
  }
  if (result.issues.length) throw new HttpError(502, `Claude’s draft didn’t pass the checks:\n${result.issues.slice(0, 8).join("\n")}`);
  return { value: result.value as T, usage };
}

/** How many times each JSON key appears in a reply that's still being written. */
export function keyCounts(text: string, keys: readonly string[]) {
  return Object.fromEntries(keys.map((k) => [k, [...text.matchAll(new RegExp(`"${k}"\\s*:`, "g"))].length])) as Record<string, number>;
}
