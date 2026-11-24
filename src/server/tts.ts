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
import { estimateWords, wordsFromAlignment, type Alignment, type WordTiming } from "@/lib/wordTimings";
import { mp3Seconds, openaiReady, openaiSpeech } from "./openaiText";
import { answerScript, cardScript } from "@/lib/coordinatorsDay";
import { coordinatorsDay } from "@/content/coordinatorsDay";

/*
  Live narration: the Topics' script read aloud. The hub's narrator is OpenAI's Alloy voice when OpenAI is
  connected (HUB_NARRATOR_VOICE can name another: "openai:<voice>" or an ElevenLabs voice id), otherwise
  ElevenLabs' Claire. The browser asks for a card by key, never with free text, so the endpoint can only
  speak approved lesson scripts. Each script is synthesised once per voice and model, then served from a
  disk cache so replays are instant and free.
*/

export const ttsConfig = () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  // Claire, Calm & Friendly: Australian female voice for workplace training.
  const elevenVoice = process.env.ELEVENLABS_VOICE_ID ?? "6UXvJKkwaqtXE3nZHvbF";
  const voiceId = process.env.HUB_NARRATOR_VOICE || (openaiReady() ? "openai:alloy" : elevenVoice);
  const openai = voiceId.startsWith("openai:");
  return {
    apiKey,
    /** The hub's narrator: "openai:<voice>" or an ElevenLabs voice id. */
    voiceId,
    modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
    /** Whether the hub's narrator can speak. */
    configured: openai ? openaiReady() : Boolean(apiKey),
  };
};

/** The narrator's name, for authors. */
export const narratorName = (voiceId = ttsConfig().voiceId) =>
  voiceId.startsWith("openai:")
    ? `${voiceId.slice(7, 8).toUpperCase()}${voiceId.slice(8)} (OpenAI)`
    : voiceId === "6UXvJKkwaqtXE3nZHvbF"
      ? "Claire, Calm & Friendly"
      : "ElevenLabs voice";

/**
  Resolves a card key to its approved script: `lesson:<slug>:<nodeId>`, `followup:<id>:<version>` or
  `cday:<scenario|event>:<id>` (a card in The Coordinator's Day) or `cday:answer:<scenario>:<option>` (what's said
  about the answer chosen).
  `drafts` (authors only) also reads saved drafts, so an author previewing a lesson hears the real voice.
*/
export function scriptFor(db: Db, key: string, drafts = false): string {
  const [kind, a, b] = key.split(":");
  if (kind === "lesson") {
    const lesson = lessonWith(db, a, b, drafts);
    // With shared facts filled in, exactly as learners see the text.
    const node = lesson && applyFacts(lesson, factValues(db)).nodes[b];
    const text = node && (node.type === "presenter" ? node.transcript : node.type === "audio" || node.type === "listen" ? node.script : node.narration);
    if (text) return text;
  }
  if (kind === "cday" && a === "answer") {
    const script = answerScript(coordinatorsDay, b, key.split(":")[3] ?? "");
    if (script) return script.text;
  }
  if (kind === "cday" && (a === "scenario" || a === "event")) {
    const script = cardScript(coordinatorsDay, { type: a, id: b });
    if (script) return script.text;
  }
  if (kind === "followup") {
    const text = followUp(db, a, Number(b))?.explain?.script;
    if (text) return text;
  }
  // A Magazine course's introduction (`magazine:<guideId>:intro`, on the cover) or a page's (`magazine:<guideId>:page:<pageId>`), as Ava
  // says it: the approved Audio Guide script, from the published edition, or the saved draft for an author previewing it.
  if (kind === "magazine" && (b === "intro" || b === "page")) {
    const pageId = key.split(":")[3] ?? "";
    const row = db.prepare("SELECT g.draft, r.doc FROM magazine_guides g LEFT JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.id = ?").get(a) as
      { draft: string | null; doc: string | null } | undefined;
    type Said = { status?: string; script?: string };
    const approved = (raw: string | null) => {
      try {
        const doc = raw ? (JSON.parse(raw) as { audio?: { intro?: Said }; pages?: { id: string; narration?: Said }[] }) : undefined;
        const n = b === "intro" ? doc?.audio?.intro : doc?.pages?.find((p) => p.id === pageId)?.narration;
        return n?.status === "approved" && n.script?.trim() ? n.script.trim() : null;
      } catch {
        return null;
      }
    };
    const text = approved(row?.doc ?? null) ?? (drafts ? approved(row?.draft ?? null) : null);
    if (text) return text;
  }
  // A Discovery Path's introduction, as Ava says it: the path's own description (`path:<id>`).
  if (kind === "path") {
    const row = db.prepare("SELECT description FROM learning_paths WHERE id = ? AND archived = 0").get(a) as { description: string | null } | undefined;
    if (row?.description?.trim()) return row.description.trim();
  }
  throw new HttpError(404, "No narration for this card.");
}

/** Lines Ava speaks, in her own voice (server/ava.ts): a path's introduction, a Magazine course's introduction, and a Topic's presenter card. */
export function avaSpeaks(db: Db, key: string, drafts = false) {
  const [kind, a, b] = key.split(":");
  if (kind === "path" || kind === "magazine") return true;
  if (kind !== "lesson") return false;
  return lessonWith(db, a, b, drafts)?.nodes[b]?.type === "presenter";
}

/**
  The Topic that has this card: for an author (drafts), the saved draft when the card is in it (a card added since the
  Topic was published is only there), otherwise the published Topic.
*/
function lessonWith(db: Db, slug: string, card: string, drafts: boolean) {
  const draft = drafts ? editorLesson(db, slug)?.lesson : undefined;
  return draft?.nodes[card] ? draft : (getLesson(db, slug) ?? draft);
}

const cacheDir = () => path.join(process.cwd(), "data", "tts");

const hashOf = (text: string, voiceId: string) => {
  const modelId = voiceId.startsWith("openai:") ? process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts" : ttsConfig().modelId;
  return crypto.createHash("sha256").update(`${voiceId}|${modelId}|${text}`).digest("hex").slice(0, 32);
};

// One request to ElevenLabs per script at a time, however many ask at once.
const inFlight = new Map<string, Promise<{ audio: Buffer; words: WordTiming[] | null }>>();

/*
  The narration and its word timings, from the disk cache or ElevenLabs. Both are made in one call
  so they always match. A recording cached before timings were kept is made again once.
*/
export async function narration(text: string, voice?: string): Promise<{ audio: Buffer; words: WordTiming[] | null }> {
  const { apiKey, modelId } = ttsConfig();
  // The hub's narrator unless another voice is asked for (a Magazine Audio Guide may choose one).
  const voiceId = voice ?? ttsConfig().voiceId;
  const openai = voiceId.startsWith("openai:");
  if (!openai && !apiKey) throw new HttpError(503, "ElevenLabs isn't configured. Set ELEVENLABS_API_KEY.");
  const hash = hashOf(text, voiceId);
  const mp3 = path.join(cacheDir(), `${hash}.mp3`);
  const json = path.join(cacheDir(), `${hash}.json`);
  if (fs.existsSync(mp3) && fs.existsSync(json)) {
    const kept = JSON.parse(fs.readFileSync(json, "utf8")) as { alignment?: Alignment | null; seconds?: number | null };
    const audio = fs.readFileSync(mp3);
    return { audio, words: openai ? estimateWords(text, kept.seconds ?? mp3Seconds(audio) ?? 0) : wordsFromAlignment(text, kept.alignment) };
  }
  const pending = inFlight.get(hash);
  if (pending) return pending;

  const job = (async () => {
    if (openai) {
      // OpenAI doesn't say when each word is spoken, so the timings are estimated from the recording's length.
      const audio = await openaiSpeech(text, voiceId.slice("openai:".length));
      const seconds = mp3Seconds(audio);
      fs.mkdirSync(cacheDir(), { recursive: true });
      fs.writeFileSync(mp3, audio);
      fs.writeFileSync(json, JSON.stringify({ seconds }));
      return { audio, words: seconds ? estimateWords(text, seconds) : null };
    }
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey!, "content-type": "application/json", accept: "application/json" },
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
      // The reasons an author can do something about, in words.
      if (/quota_exceeded/.test(detail))
        throw new HttpError(
          402,
          "The ElevenLabs account has run out of credits for this month. Add credits or upgrade the plan at elevenlabs.io, then try again.",
        );
      if (res.status === 401 && /missing_permissions|text_to_speech/.test(detail))
        throw new HttpError(502, "The ElevenLabs key doesn't have the Text to speech permission. Turn it on for the key at elevenlabs.io, then try again.");
      if (res.status === 401)
        throw new HttpError(502, "ElevenLabs didn't accept the API key. Check ELEVENLABS_API_KEY in .env.local, then restart the server.");
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
