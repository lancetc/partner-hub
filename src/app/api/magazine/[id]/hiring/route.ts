import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { commitInitial, commitRevised, feedbackViewed, hiringState, hiringStats, retryHiring, saveHiring } from "@/server/hiringRunway";

/** Hiring Runway lab: the signed-in person's own attempt. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/hiring">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? hiringStats(db, user, id) : hiringState(db, user, id, q.get("block"))));
}

/** Save progress, commit the first decision (then the new information is sent), commit the revision, note the feedback read, or try again. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/hiring">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "decide") return commitInitial(db, user, id, input, now);
      if (input.action === "revise") return commitRevised(db, user, id, input, now);
      if (input.action === "viewed") return feedbackViewed(db, user, id, input, now);
      if (input.action === "retry") return retryHiring(db, user, id, input, now);
      return saveHiring(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
