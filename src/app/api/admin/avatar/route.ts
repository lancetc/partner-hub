import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { avatarSettings, checkAvatar, setAvatarPortrait, startAvatar } from "@/server/avatar";

/** The presenter's face for new videos, or `?id=` to check on a video being made. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  return handle(({ db, user, now }) => (id ? checkAvatar(db, user, id, now) : avatarSettings(db, user)));
}

/** `{ action: "start", lesson, card, script, portrait }` makes a video; `{ action: "portrait", portrait }` sets the presenter's face. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: string; lesson?: string; card?: string; script?: string; portrait?: unknown }>(req);
    if (b.action === "start") return startAvatar(db, user, b, now);
    if (b.action === "portrait") return setAvatarPortrait(db, user, b.portrait, now);
    throw new HttpError(400, "Unknown action.");
  });
}
