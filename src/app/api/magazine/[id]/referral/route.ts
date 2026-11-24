import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { finishReferral, referralState, referralStats, retryReferral, reviewPrinted, saveReferral, submitPrediction } from "@/server/referralJourney";

/** Referral Journey Calculator: the signed-in person's own attempt at the fictional case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/referral">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? referralStats(db, user, id) : referralState(db, user, id, q.get("block"))));
}

/** Save progress, make the prediction, finish with the next move and the return visit (then the debrief is sent), look again, or note the review printed. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/referral">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "finish") return finishReferral(db, user, id, input, now);
      if (input.action === "retry") return retryReferral(db, user, id, input, now);
      if (input.action === "printed") return reviewPrinted(db, user, id, input, now);
      return saveReferral(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
