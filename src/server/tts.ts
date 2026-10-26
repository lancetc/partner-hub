import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getLesson } from "./lessonStore";
import type { Db } from "./db";
import { followUp } from "./learning";
import { HttpError } from "./auth";

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

/** Resolves a card key to its approved script: `lesson:<slug>:<nodeId>` or `followup:<id>:<version>`. */
export function scriptFor(db: Db, key: string): string {
  const [kind, a, b] = key.split(":");
  if (kind === "lesson") {
    const node = getLesson(db, a)?.nodes[b];
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

export async function speak(text: string): Promise<Buffer> {
  const { apiKey, voiceId, modelId } = ttsConfig();
  if (!apiKey) throw new HttpError(503, "ElevenLabs isn't configured. Set ELEVENLABS_API_KEY.");

  const hash = crypto.createHash("sha256").update(`${voiceId}|${modelId}|${text}`).digest("hex").slice(0, 32);
  const file = path.join(cacheDir(), `${hash}.mp3`);
  if (fs.existsSync(file)) return fs.readFileSync(file);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
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
  const audio = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(file, audio);
  return audio;
}
