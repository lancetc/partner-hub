import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { attachAvaVideo, avaLineFor, avaLines, checkAvaVideo, hearAvaVideo, makeAvaVideo, removeAvaVideo, saveAvaWords } from "@/server/ava";

/** Ava's lines and their talking videos, for authors (Admin → AI Learning Guide); with ?key=, just that line. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return handle(({ db, user }) => (key ? avaLineFor(db, user, key) : avaLines(db, user)));
}

/**
  { action: "make", key } starts a line's video from Ava's portrait and voice (a paid generation); { action: "check", key }
  asks where it's up to; { action: "attach", key, src, transcript? } uses an uploaded video instead (with its own words, if it has them); { action: "words", key, transcript } changes what an uploaded video says and times its words again; { action: "hear", key } fills in an
  uploaded video's script from the video itself (ElevenLabs speech-to-text, a small paid call); { action: "remove", key } stops
  using the line's video.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { action, key, src, transcript, seconds } = await body<{ action?: string; key?: string; src?: string; transcript?: string; seconds?: number }>(req);
    if (typeof key !== "string" || !/^[\w:.-]{3,200}$/.test(key)) throw new HttpError(400, "Which line?");
    if (action === "make") return makeAvaVideo(db, user, key, now);
    if (action === "check") return checkAvaVideo(db, user, key, now);
    if (action === "attach") return attachAvaVideo(db, user, key, src, now, transcript, seconds);
    if (action === "words") return saveAvaWords(db, user, key, transcript, now);
    if (action === "hear") return hearAvaVideo(db, user, key, now);
    if (action === "remove") return removeAvaVideo(db, user, key, now);
    throw new HttpError(400, "Unknown action.");
  });
}
