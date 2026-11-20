import { body, handle } from "@/server/http";
import { advanceBalance, balanceState, balanceStats, eventBalance, finishBalance, restartBalance, saveBalance } from "@/server/balance";

/** Dignity of Risk Balance Scale: the signed-in person's own work on a case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/balance">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? balanceStats(db, user, id) : balanceState(db, user, id, q.get("block"))));
}

/** Save work and get the scale back, move to the next step, see the new fact, finish, or start again. Nothing here changes a real record. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/balance">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "advance") return advanceBalance(db, user, id, input, now);
    if (input.action === "event") return eventBalance(db, user, id, input, now);
    if (input.action === "finish") return finishBalance(db, user, id, input, now);
    if (input.action === "restart") return restartBalance(db, user, id, input, now);
    return saveBalance(db, user, id, input, now);
  });
}
