import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { finishIntake, intakeState, intakeStats, retryIntake, saveIntake, sheetPrinted, submitPrediction } from "@/server/growthReadiness";

/** Growth readiness: the signed-in person's own attempt at the fictional case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/intake">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? intakeStats(db, user, id) : intakeState(db, user, id, q.get("block"))));
}

/** Save progress, make the prediction, finish with an action and a message (then the debrief is sent), try another route, or note the sheet printed. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/intake">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "finish") return finishIntake(db, user, id, input, now);
      if (input.action === "retry") return retryIntake(db, user, id, input, now);
      if (input.action === "printed") return sheetPrinted(db, user, id, input, now);
      return saveIntake(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
