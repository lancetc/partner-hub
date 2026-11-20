import { body, handle } from "@/server/http";
import { liveCopied, liveStatus, setLiveRelease } from "@/server/bridge";

/** The live-call tool: whether this person can use it, and whether it's released. */
export async function GET() {
  return handle(({ db, user }) => liveStatus(db, user));
}

/** Release or withdraw it (superadmins), or record that a summary was copied (never sent). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "release") return setLiveRelease(db, user, input, now);
    return liveCopied(db, user, input, now);
  });
}
