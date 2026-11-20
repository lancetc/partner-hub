import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { roleplayStats, setVoice, testTurn, voiceStatus } from "@/server/roleplay";

/** Whether voice is switched on for the Hub; with ?guide=<id>, how a course's conversation practices are being used (counts only). */
export async function GET(req: Request) {
  const guide = new URL(req.url).searchParams.get("guide");
  return handle(({ db, user }) => (guide ? roleplayStats(db, user, guide) : voiceStatus(db, user)));
}

/** Try one turn of a scene from the editor (nothing stored), or switch voice on or off for the Hub. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "test") return testTurn(db, user, input);
    if (input.action === "voice") return setVoice(db, user, input.on === true, now);
    throw new HttpError(400, "Unknown action.");
  });
}
