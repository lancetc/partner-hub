import { handle } from "@/server/http";
import { voiceSample } from "@/server/magazineNarration";

/**
  GET ?voice=profile:editorial: a short sample of a voice as MP3, for "Preview voice profile". The same words every
  time, so each voice and model is recorded once and kept (server/tts); authors only.
*/
export async function GET(req: Request) {
  return handle(async ({ user }) => {
    const audio = await voiceSample(user, new URL(req.url).searchParams.get("voice"));
    return new Response(new Uint8Array(audio), {
      headers: { "content-type": "audio/mpeg", "content-length": String(audio.length), "cache-control": "private, max-age=86400" },
    });
  });
}
