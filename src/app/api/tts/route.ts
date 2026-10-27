import { handle } from "@/server/http";
import { canAuthor, HttpError } from "@/server/auth";
import { narration, scriptFor, speak, ttsConfig } from "@/server/tts";

/**
  GET /api/tts?key=lesson:<slug>:<node> streams the card's narration as MP3; add &timings=1 for when each word is
  spoken (for following along); ?status=1 reports configuration.
*/
export async function GET(req: Request) {
  return handle(async ({ db, user }) => {
    const url = new URL(req.url);
    if (url.searchParams.has("status")) {
      const { apiKey, voiceId, modelId } = ttsConfig();
      return { configured: Boolean(apiKey), voiceId, modelId };
    }
    const key = url.searchParams.get("key");
    if (!key) throw new HttpError(400, "Missing card key.");
    const text = scriptFor(db, key, canAuthor(user));
    if (url.searchParams.has("timings")) return { words: (await narration(text)).words };
    const audio = await speak(text);
    return new Response(new Uint8Array(audio), {
      headers: { "content-type": "audio/mpeg", "content-length": String(audio.length), "cache-control": "private, max-age=86400" },
    });
  });
}
