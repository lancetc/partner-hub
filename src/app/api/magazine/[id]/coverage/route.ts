import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { briefPrinted, coverageState, coverageStats, finishCoverage, retryCoverage, saveCoverage, submitPrediction } from "@/server/suburbCoverage";

/** Local Coverage Comparison: the signed-in person's own attempt at the fictional case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/coverage">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? coverageStats(db, user, id) : coverageState(db, user, id, q.get("block"))));
}

/** Save progress, make the prediction, finish with the decisions and the follow-up (then the debrief is sent), look again, or note the brief printed. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/coverage">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "finish") return finishCoverage(db, user, id, input, now);
      if (input.action === "retry") return retryCoverage(db, user, id, input, now);
      if (input.action === "printed") return briefPrinted(db, user, id, input, now);
      return saveCoverage(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
