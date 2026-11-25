import { body, handle } from "@/server/http";
import { memberChatAdmin, memberChatPreview, saveMemberChatSettings } from "@/server/memberChat";

/** For authors: the Digital Member chat's settings, what's connected and how it's used. `?preview=<member id>` shows the brief. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const preview = q.get("preview");
  // `&episode=<id>`: a Lives in Progress character's brief as it would stand at that episode.
  return handle(({ db, user, now }) => (preview ? memberChatPreview(db, user, preview, now, q.get("episode")) : memberChatAdmin(db, user, now)));
}

/** Saves the settings (any of them); the house rules can't be changed here. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveMemberChatSettings(db, user, await body<unknown>(req), now));
}
