import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { openaiReady } from "@/server/openaiText";
import { familyLine } from "@/server/familyCall";
import { narration } from "@/server/tts";

/**
  The caller's line read aloud in their character voice: only a line already shown as text in the signed-in person's own
  call (or the opening), and only once the voice's rights are recorded. If the voice can't play, the line is there to read.
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(async ({ db, user }) => {
    const { line, voice } = familyLine(db, user, id, q.get("block"), q.get("n"));
    if (voice.id.startsWith("openai:") ? !openaiReady() : !process.env.ELEVENLABS_API_KEY)
      throw new HttpError(503, "The voice isn’t available. The line is there to read.");
    const { audio } = await narration(line, voice.id, voice.style);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  });
}
