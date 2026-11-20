import { body, handle } from "@/server/http";
import { finishJourney, journeyState, journeyStats, restartJourney, saveJourney, tryJourney } from "@/server/journey";

/** The SaH Journey: the signed-in person's own attempt. With ?stats=1, decision totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/journey">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? journeyStats(db, user, id) : journeyState(db, user, id, q.get("block"))));
}

/** Save the place and lenses, try a decision point, finish for the final map, or start again. Nothing here contacts anyone. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/journey">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "try") return tryJourney(db, user, id, input, now);
    if (input.action === "finish") return finishJourney(db, user, id, input, now);
    if (input.action === "restart") return restartJourney(db, user, id, input, now);
    return saveJourney(db, user, id, input, now);
  });
}
