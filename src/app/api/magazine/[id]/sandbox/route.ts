import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { coachSandbox, finishSandbox, reviseSandbox, sandboxState, sandboxStats, saveSandbox, submitPlan } from "@/server/sandbox";

/** Budget Sandbox: the signed-in person's own plan, with its ledger worked out here. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/sandbox">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? sandboxStats(db, user, id) : sandboxState(db, user, id, q.get("block"))));
}

/** Save, submit the plan, ask the coach, finish with an explanation, or revise. Nothing here quotes a real fee or changes a care plan. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/sandbox">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "submit") return submitPlan(db, user, id, input, now);
      if (input.action === "coach") return await coachSandbox(db, user, id, input, now);
      if (input.action === "finish") return finishSandbox(db, user, id, input, now);
      if (input.action === "revise") return reviseSandbox(db, user, id, input, now);
      return saveSandbox(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
