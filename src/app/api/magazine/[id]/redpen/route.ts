import { body, handle } from "@/server/http";
import { redPenState, redPenStats, saveRedPen, submitRedPen } from "@/server/redpen";

/** Red Pen: the signed-in person's own critique. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/redpen">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? redPenStats(db, user, id) : redPenState(db, user, id, q.get("block"), now)));
}

/** Save a draft, a reflection or that the comparison was opened; or submit privately. Nothing is posted anywhere. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/redpen">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "submit") return submitRedPen(db, user, id, input, now);
    return saveRedPen(db, user, id, input, now);
  });
}
