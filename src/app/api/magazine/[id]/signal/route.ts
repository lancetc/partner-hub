import { body, handle } from "@/server/http";
import { checkActions, restartSignal, saveSignal, signalState, signalStats, submitSignal } from "@/server/signal";

/** Spot the Signal: the signed-in person's own work on a case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/signal">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? signalStats(db, user, id) : signalState(db, user, id, q.get("block"))));
}

/** Save work in progress, check the first actions, finish the case, or start it again. Nothing here contacts anyone. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/signal">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "actions") return checkActions(db, user, id, input, now);
    if (input.action === "submit") return submitSignal(db, user, id, input, now);
    if (input.action === "restart") return restartSignal(db, user, id, input, now);
    return saveSignal(db, user, id, input, now);
  });
}
