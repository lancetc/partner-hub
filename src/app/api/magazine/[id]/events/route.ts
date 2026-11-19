import { body, handle } from "@/server/http";
import { recordGuideEvent } from "@/server/magazine";

/** What a reader did in a guide: opened it, reached a section, or answered a decision question. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/events">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => recordGuideEvent(db, user, id, await body(req), now));
}
