import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { openaiReady } from "@/server/openaiText";
import { lineToSpeak } from "@/server/roleplay";
import { narration } from "@/server/tts";

/** The character's line read aloud in a synthetic voice: only a line from the signed-in person's own attempt, already shown as text. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/roleplay/speech">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(async ({ db, user }) => {
    const line = lineToSpeak(db, user, id, q.get("attempt"), q.get("n"));
    if (!openaiReady()) throw new HttpError(503, "The voice isn’t available. The line is there to read.");
    const { audio } = await narration(line, "openai:alloy");
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  });
}
