import { body, handle } from "@/server/http";
import { actOnDay, oneDayState, oneDayStats, retryDay, startDay } from "@/server/oneDay";

/** One Day, Five Perspectives: the signed-in person's own day, as far as it has arrived. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/oneday">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? oneDayStats(db, user, id) : oneDayState(db, user, id, q.get("block"))));
}

/** Start the day, make a decision, open a role lens, choose a lens reply, close the day, or retry from an event. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/oneday">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "start") return startDay(db, user, id, input, now);
    if (input.action === "retry") return retryDay(db, user, id, input, now);
    return actOnDay(db, user, id, input, now);
  });
}
