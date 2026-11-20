import { body, handle } from "@/server/http";
import { batonState, batonStats, restartBaton, saveBaton, sendBaton } from "@/server/baton";

/** Pass the Baton: the signed-in person's own relay. With ?stats=1, totals by stage for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/baton">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? batonStats(db, user, id) : batonState(db, user, id, q.get("block"), now)));
}

/** Choose a role or save a draft, send a simulated handoff (or its follow-up), or start again. Nothing here sends anything real. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/baton">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "send") return sendBaton(db, user, id, input, now);
    if (input.action === "restart") return restartBaton(db, user, id, input, now);
    return saveBaton(db, user, id, input, now);
  });
}
