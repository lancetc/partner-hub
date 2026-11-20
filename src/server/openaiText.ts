import "server-only";
import { HttpError } from "./auth";

/*
  OpenAI with the hub's own key, for when Claude isn't connected: a JSON reply checked the same way as
  Claude's (one retry with the problems listed), and speech for the Audio Guide when ElevenLabs can't
  record. Claude and ElevenLabs stay first choice wherever they're connected.
*/

export const claudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const openaiReady = () => Boolean(process.env.OPENAI_API_KEY);
export const openaiTextModel = () => process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";

async function openai(path: string, body: unknown, timeout = 120_000) {
  let res: Response;
  try {
    res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      // A form (an audio file to transcribe) sets its own content type.
      headers:
        body instanceof FormData
          ? { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
          : { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, "Couldn’t reach OpenAI, or it took too long. Try again.");
  }
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string } };
    if (res.status === 401) throw new HttpError(502, "OpenAI didn’t accept the API key. Check OPENAI_API_KEY in .env.local, then restart the server.");
    if (d.error?.type === "insufficient_quota" || d.error?.code === "credit_balance_exhausted")
      throw new HttpError(402, "The OpenAI account has no credit left. Add credit at platform.openai.com under Billing, then try again.");
    if (res.status === 429) throw new HttpError(429, "OpenAI’s rate limit was reached. Wait a moment and try again.");
    throw new HttpError(502, `OpenAI couldn’t do that${d.error?.message ? `: ${d.error.message}` : "."}`);
  }
  return res;
}

/** A JSON object from OpenAI that passes `check`; one retry with the problems listed, as with Claude. */
export async function openaiJson<T>(prompt: string, check: (value: unknown) => string[], onPhase?: (phase: "checking" | "fixing", issues?: number) => void) {
  if (!openaiReady())
    throw new HttpError(503, "Neither Claude nor OpenAI is connected. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local and restart the server.");
  const ask = async (messages: { role: "user" | "assistant"; content: string }[]) => {
    const r = await openai("chat/completions", { model: openaiTextModel(), response_format: { type: "json_object" }, max_completion_tokens: 8000, messages });
    const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? "";
  };
  const parse = (text: string) => {
    try {
      const value = JSON.parse(text) as unknown;
      return { value, issues: check(value) };
    } catch {
      return { value: null, issues: ["The reply wasn’t valid JSON."] };
    }
  };
  let text = await ask([{ role: "user", content: prompt }]);
  onPhase?.("checking");
  let result = parse(text);
  if (result.issues.length) {
    onPhase?.("fixing", result.issues.length);
    text = await ask([
      { role: "user", content: prompt },
      { role: "assistant", content: text },
      {
        role: "user",
        content: `Your reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
      },
    ]);
    onPhase?.("checking");
    result = parse(text);
  }
  if (result.issues.length) throw new HttpError(502, `The draft didn’t pass the checks:\n${result.issues.slice(0, 8).join("\n")}`);
  return result.value as T;
}

/** OpenAI's voices for the Audio Guide, with how each sounds. */
/**
  Speech to text, for a learner who speaks a roleplay reply. The audio goes to OpenAI and comes back as
  words; nothing here keeps it. English, and told only that it's a short spoken reply.
*/
export async function openaiTranscribe(audio: Blob, filename: string): Promise<string> {
  if (!openaiReady()) throw new HttpError(503, "Speech isn’t available: OpenAI isn’t connected. You can type instead.");
  const form = new FormData();
  form.set("file", audio, filename);
  form.set("model", process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe");
  form.set("language", "en");
  form.set("response_format", "json");
  const r = await openai("audio/transcriptions", form, 45_000);
  const d = (await r.json()) as { text?: string };
  return (d.text ?? "").trim();
}

export const OPENAI_VOICES: { id: string; label: string }[] = [
  { id: "sage", label: "Sage: calm and warm" },
  { id: "coral", label: "Coral: bright and friendly" },
  { id: "ballad", label: "Ballad: gentle and measured" },
  { id: "ash", label: "Ash: clear and steady" },
  { id: "nova", label: "Nova: lively" },
  { id: "verse", label: "Verse: expressive" },
  { id: "alloy", label: "Alloy: neutral" },
  { id: "shimmer", label: "Shimmer: soft" },
  { id: "echo", label: "Echo: even" },
  { id: "onyx", label: "Onyx: deep" },
];

/** Reads a script aloud with OpenAI's speech model, as an MP3. */
export async function openaiSpeech(text: string, voice: string) {
  if (!openaiReady()) throw new HttpError(503, "OpenAI isn’t connected. Add OPENAI_API_KEY to .env.local and restart the server.");
  if (!OPENAI_VOICES.some((v) => v.id === voice)) throw new HttpError(400, "Choose one of OpenAI’s voices.");
  const r = await openai(
    "audio/speech",
    {
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions:
        "A warm, friendly learning companion with a natural Australian manner, speaking to a support worker. Conversational and unhurried, never salesy. Pause briefly before a question.",
      response_format: "mp3",
    },
    90_000,
  );
  return Buffer.from(await r.arrayBuffer());
}

/** How long an MP3 plays, from its first frame's bit rate (constant bit rate). Null if it can't tell. */
export function mp3Seconds(buf: Buffer): number | null {
  let i = 0;
  // Skip an ID3 tag.
  if (buf.subarray(0, 3).toString("latin1") === "ID3" && buf.length > 10) i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  for (; i + 4 < buf.length; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[i + 1] >> 3) & 3; // 3: MPEG 1, 2: MPEG 2, 0: MPEG 2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1: Layer III
    const index = (buf[i + 2] >> 4) & 15;
    if (layer !== 1 || index === 0 || index === 15) continue;
    const v1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const v2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const kbps = (version === 3 ? v1 : v2)[index];
    return kbps ? Math.round((((buf.length - i) * 8) / (kbps * 1000)) * 10) / 10 : null;
  }
  return null;
}
