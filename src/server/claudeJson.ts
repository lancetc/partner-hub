import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./auth";
import { client, GENERATION_MODEL } from "./generate";
import { claudeConfigured, openaiAsk, openaiReady, type OpenAIPart } from "./openaiText";
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

type Effort = "low" | "medium" | "high";

async function ask(
  content: Anthropic.Beta.BetaContentBlockParam[],
  onText: (soFar: string) => void,
  repair?: { previous: string; correction: string },
  effort: Effort = "high",
) {
  // Without Claude, the Hub's OpenAI connection writes it, from the same documents and prompt (server/openaiText).
  if (!claudeConfigured() && openaiReady()) {
    const parts: OpenAIPart[] = content.flatMap((b): OpenAIPart[] =>
      b.type === "text"
        ? [{ kind: "text", text: b.text }]
        : b.type === "document" && b.source.type === "text"
          ? [{ kind: "doc", title: b.title ?? "Source", text: b.source.data }]
          : b.type === "document" && b.source.type === "base64"
            ? [{ kind: "pdf", title: b.title ?? "Source", data: b.source.data }]
            : [],
    );
    const out = await openaiAsk(parts, repair);
    const text = out.text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    onText(text);
    return { text, usage: out.usage };
  }
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  if (repair) messages.push({ role: "assistant", content: repair.previous }, { role: "user", content: repair.correction });
  const stream = client().beta.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    output_config: { effort },
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
  /** Lower for short jobs someone is waiting on (an onboarding sample topic). */
  effort: Effort = "high",
): Promise<{ value: T; usage: unknown }> {
  const parse = (text: string) => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { value: null, issues: ["The reply wasn’t valid JSON."] };
    }
    // Outside the try: a fault in a check is a real error, not a reply to send back as "not JSON".
    return { value, issues: check(value) };
  };
  let { text, usage } = await ask(content, progress.onText, undefined, effort);
  progress.onPhase("checking");
  let result = parse(text);
  if (result.issues.length) {
    progress.onPhase("fixing", result.issues.length);
    ({ text, usage } = await ask(
      content,
      progress.onText,
      {
        previous: text,
        correction: `Your previous reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
      },
      effort,
    ));
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
