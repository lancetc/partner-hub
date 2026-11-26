import { body, handle } from "@/server/http";
import { checkInVoice } from "@/server/checkIn";

/**
  One of a character's catch-up replies, spoken in their voice, as an MP3. Off unless an author has switched spoken
  replies on (each is a live, paid request); only words the character just said to this learner.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const audio = await checkInVoice(db, user, await body<{ memberId?: unknown; text?: unknown }>(req), now);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  });
}
