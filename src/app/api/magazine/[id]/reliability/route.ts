import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  finishReliability,
  reliabilityState,
  reliabilityStats,
  retryReliability,
  saveReliability,
  sheetEvent,
  submitPrediction,
} from "@/server/serviceReliability";

/** The Service Reliability Calculator: the signed-in person's own attempt at the fictional month. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/reliability">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? reliabilityStats(db, user, id) : reliabilityState(db, user, id, q.get("block"))));
}

/** Save progress, make the first guess, finish (then the debrief is sent), look again, or note the sheet printed or saved. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/reliability">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "finish") return finishReliability(db, user, id, input, now);
      if (input.action === "retry") return retryReliability(db, user, id, input, now);
      if (input.action === "printed" || input.action === "saved") return sheetEvent(db, user, id, input, now);
      return saveReliability(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
