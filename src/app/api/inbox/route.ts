import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { acknowledge, inbox, markAllRead, markDone, markRead, type Kind } from "@/server/notifications";

/** Your Inbox: actions, updates and activity. */
export async function GET() {
  return handle(({ db, user, now }) => inbox(db, user, now));
}

type Action = { action: "read" | "ack" | "done"; id: number } | { action: "read_all"; kind: Kind };

/** Mark read, mark a tab read, confirm you've read a notice, or mark an action done. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<Action>(req);
    if (b.action === "read") markRead(db, user, Number(b.id), now);
    else if (b.action === "ack") acknowledge(db, user, Number(b.id), now);
    else if (b.action === "done") markDone(db, user, Number(b.id), now);
    else if (b.action === "read_all") markAllRead(db, user, b.kind, now);
    else throw new HttpError(400, "Unknown action.");
    return inbox(db, user, now);
  });
}
