import { body, handle } from "@/server/http";
import { memberChatAdmin, memberChatPreview, saveMemberChatSettings } from "@/server/memberChat";

/** For authors: the Digital Member chat's settings, what's connected and how it's used. `?preview=<member id>` shows the brief. */
export async function GET(req: Request) {
  const preview = new URL(req.url).searchParams.get("preview");
  return handle(({ db, user, now }) => (preview ? memberChatPreview(db, user, preview, now) : memberChatAdmin(db, user, now)));
}

/** Saves the settings (any of them); the house rules can't be changed here. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveMemberChatSettings(db, user, await body<unknown>(req), now));
}
