import { body, handle } from "@/server/http";
import { flagReset, resetEvent, resetState, resetStats, resolveFlag, saveReset } from "@/server/reset";

/** The Expectation Reset: the signed-in person's progress and each marker's peer cards. With ?stats=1, totals and open flags for authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/reset">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? resetStats(db, user, id) : resetState(db, user, id, q.get("block"), now)));
}

/** Save progress, record a learning event, flag something as out of date, or (authors) resolve a flag. Nothing here contacts anyone. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/reset">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "event") return resetEvent(db, user, id, input, now);
    if (input.action === "flag") return flagReset(db, user, id, input, now);
    if (input.action === "resolve") return resolveFlag(db, user, id, input, now);
    return saveReset(db, user, id, input, now);
  });
}
