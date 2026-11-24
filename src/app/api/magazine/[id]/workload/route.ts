import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { finishWorkload, retryWorkload, reviewPrinted, saveWorkload, submitPrediction, workloadState, workloadStats } from "@/server/workloadLens";

/** The Workload Lens: the signed-in person's own attempt at the fictional week. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/workload">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? workloadStats(db, user, id) : workloadState(db, user, id, q.get("block"))));
}

/** Save progress, make the prediction, finish with an explanation and a decision (then the debrief is sent), map the week again, or note the review printed. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/workload">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "finish") return finishWorkload(db, user, id, input, now);
      if (input.action === "retry") return retryWorkload(db, user, id, input, now);
      if (input.action === "printed") return reviewPrinted(db, user, id, input, now);
      return saveWorkload(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
