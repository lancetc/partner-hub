import { body, handle } from "@/server/http";
import { moveRoom, roomView } from "@/server/conversationRooms";

/** The card everyone in the session sees right now. Participants check this every few seconds. */
export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/rooms/[code]">) {
  const { code } = await ctx.params;
  return handle(({ db, user, now }) => roomView(db, user, code, now));
}

/** The host moves the group on: `next`, `back`, `flip` or `end`. */
export async function POST(req: Request, ctx: RouteContext<"/api/conversations/rooms/[code]">) {
  const { code } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action?: string }>(req);
    return moveRoom(db, user, code, action, now);
  });
}
