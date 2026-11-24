import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { budgetLabState, budgetLabStats, retryBudgetLab, saveBudgetLab, submitBudgetLab, viewedBudgetLab } from "@/server/budgetLab";

/**
  The Quarterly Budget Decision Lab: the signed-in person's own attempt at the fictional quarter. With ?embed=1 (a Topic
  card placing the lab by reference), the readers' copy of the block comes with it. With ?stats=1, totals for authors.
*/
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/budgetlab">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("stats") ? budgetLabStats(db, user, id) : budgetLabState(db, user, id, q.get("block"), { embed: q.get("embed") === "1" }, now),
  );
}

/** Save progress, submit the response, note the feedback viewed, or try again. Nothing here books, claims or changes a care plan. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/budgetlab">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "submit") return submitBudgetLab(db, user, id, input, now);
      if (input.action === "viewed") return viewedBudgetLab(db, user, id, input, now);
      if (input.action === "retry") return retryBudgetLab(db, user, id, input, now);
      return saveBudgetLab(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
