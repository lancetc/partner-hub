import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { scriptFor, speak, ttsConfig } from "@/server/tts";

/** GET /api/tts?key=lesson:<slug>:<node> streams the card's narration as MP3; ?status=1 reports configuration. */
export async function GET(req: Request) {
  return handle(async ({ db }) => {
    const url = new URL(req.url);
    if (url.searchParams.has("status")) {
      const { apiKey, voiceId, modelId } = ttsConfig();
      return { configured: Boolean(apiKey), voiceId, modelId };
    }
    const key = url.searchParams.get("key");
    if (!key) throw new HttpError(400, "Missing card key.");
    const audio = await speak(scriptFor(db, key));
    return new Response(new Uint8Array(audio), {
      headers: { "content-type": "audio/mpeg", "content-length": String(audio.length), "cache-control": "private, max-age=86400" },
    });
  });
}
