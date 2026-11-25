import { body, handle } from "@/server/http";
import { recordExciterEvent } from "@/server/pathExciter";

/** A listening event from the path's "Listen to your introduction" player: the action and numbers only. */
export async function POST(req: Request, ctx: RouteContext<"/api/paths/[id]/exciter-events">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => recordExciterEvent(db, user, id, await body<{ action?: unknown; detail?: unknown }>(req), now));
}
