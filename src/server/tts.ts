import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getLesson } from "./lessonStore";
import type { Db } from "./db";
import { followUp } from "./learning";
import { HttpError } from "./auth";
import { editorLesson } from "./authoredLessons";
import { factValues } from "./facts";
import { applyFacts } from "@/lib/facts";
import { wordsFromAlignment, type Alignment, type WordTiming } from "@/lib/wordTimings";

/*
  Live narration through ElevenLabs. The browser asks for a card by key, never with free
  text, so the endpoint can only speak approved lesson scripts. Each script is synthesised
  once per voice and model, then served from a disk cache so replays are instant and free.
*/

export const ttsConfig = () => ({
  apiKey: process.env.ELEVENLABS_API_KEY,
  // Claire, Calm & Friendly: Australian female voice for workplace training.
  voiceId: process.env.ELEVENLABS_VOICE_ID ?? "6UXvJKkwaqtXE3nZHvbF",
  modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
});

/**
  Resolves a card key to its approved script: `lesson:<slug>:<nodeId>` or `followup:<id>:<version>`.
  `drafts` (authors only) also reads saved drafts, so an author previewing a lesson hears the real voice.
*/
export function scriptFor(db: Db, key: string, drafts = false): string {
  const [kind, a, b] = key.split(":");
  if (kind === "lesson") {
    const lesson = getLesson(db, a) ?? (drafts ? editorLesson(db, a)?.lesson : undefined);
    // With shared facts filled in, exactly as learners see the text.
    const node = lesson && applyFacts(lesson, factValues(db)).nodes[b];
    const text = node && (node.type === "presenter" ? node.transcript : node.type === "audio" || node.type === "listen" ? node.script : node.narration);
    if (text) return text;
  }
  if (kind === "followup") {
    const text = followUp(db, a, Number(b))?.explain?.script;
    if (text) return text;
  }
  throw new HttpError(404, "No narration for this card.");
}

const cacheDir = () => path.join(process.cwd(), "data", "tts");

const hashOf = (text: string) => {
  const { voiceId, modelId } = ttsConfig();
  return crypto.createHash("sha256").update(`${voiceId}|${modelId}|${text}`).digest("hex").slice(0, 32);
};

// One request to ElevenLabs per script at a time, however many ask at once.
const inFlight = new Map<string, Promise<{ audio: Buffer; words: WordTiming[] | null }>>();

/*
  The narration and its word timings, from the disk cache or ElevenLabs. Both are made in one call
  so they always match. A recording cached before timings were kept is made again once.
*/
export async function narration(text: string): Promise<{ audio: Buffer; words: WordTiming[] | null }> {
  const { apiKey, voiceId, modelId } = ttsConfig();
  if (!apiKey) throw new HttpError(503, "ElevenLabs isn't configured. Set ELEVENLABS_API_KEY.");
  const hash = hashOf(text);
  const mp3 = path.join(cacheDir(), `${hash}.mp3`);
  const json = path.join(cacheDir(), `${hash}.json`);
  if (fs.existsSync(mp3) && fs.existsSync(json)) {
    const { alignment } = JSON.parse(fs.readFileSync(json, "utf8")) as { alignment: Alignment | null };
    return { audio: fs.readFileSync(mp3), words: wordsFromAlignment(text, alignment) };
  }
  const pending = inFlight.get(hash);
  if (pending) return pending;

  const job = (async () => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("ElevenLabs error", res.status, detail.slice(0, 300));
      throw new HttpError(502, `ElevenLabs couldn't generate the narration (${res.status}).`);
    }
    const body = (await res.json()) as { audio_base64: string; alignment: Alignment | null };
    const audio = Buffer.from(body.audio_base64, "base64");
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(mp3, audio);
    fs.writeFileSync(json, JSON.stringify({ alignment: body.alignment }));
    return { audio, words: wordsFromAlignment(text, body.alignment) };
  })();
  inFlight.set(hash, job);
  try {
    return await job;
  } finally {
    inFlight.delete(hash);
  }
}

export async function speak(text: string): Promise<Buffer> {
  return (await narration(text)).audio;
}
