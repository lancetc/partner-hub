import { handle } from "@/server/http";
import { canAuthor, HttpError } from "@/server/auth";
import { avaSpeaks, narration, scriptFor, ttsConfig } from "@/server/tts";
import { avaVoice } from "@/server/ava";

/**
  GET /api/tts?key=lesson:<slug>:<node> streams the card's narration as MP3; add &timings=1 for when each word is
  spoken (for following along); ?status=1 reports configuration. Ava's lines (a Topic's presenter card, a
  Discovery Path's introduction at key=path:<id>) are spoken in her voice; everything else in the narrator's.
*/
export async function GET(req: Request) {
  return handle(async ({ db, user }) => {
    const url = new URL(req.url);
    if (url.searchParams.has("status")) {
      const { configured, voiceId, modelId } = ttsConfig();
      return { configured, voiceId, modelId: voiceId.startsWith("openai:") ? "openai-tts" : modelId };
    }
    const key = url.searchParams.get("key");
    if (!key) throw new HttpError(400, "Missing card key.");
    const drafts = canAuthor(user);
    const text = scriptFor(db, key, drafts);
    const voice = avaSpeaks(db, key, drafts) ? await avaVoice(db) : undefined;
    const spoken = await narration(text, voice);
    if (url.searchParams.has("timings")) return { words: spoken.words };
    return new Response(new Uint8Array(spoken.audio), {
      headers: { "content-type": "audio/mpeg", "content-length": String(spoken.audio.length), "cache-control": "private, max-age=86400" },
    });
  });
}
