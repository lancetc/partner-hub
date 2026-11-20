import { body, handle } from "@/server/http";
import { advanceMission, decideMission, finishMission, missionState, missionStats, redoMission, restartMission, saveMission } from "@/server/mission";

/** First 30 Days Mission Board: the signed-in person's own work on a case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/mission">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? missionStats(db, user, id) : missionState(db, user, id, q.get("block"))));
}

/** Save the board, decide at the current point, move on, close the loop, try a moment again, or start over. Nothing here contacts anyone. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/mission">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "decide") return decideMission(db, user, id, input, now);
    if (input.action === "advance") return advanceMission(db, user, id, input, now);
    if (input.action === "finish") return finishMission(db, user, id, input, now);
    if (input.action === "redo") return redoMission(db, user, id, input, now);
    if (input.action === "restart") return restartMission(db, user, id, input, now);
    return saveMission(db, user, id, input, now);
  });
}
