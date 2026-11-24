import { body, handle } from "@/server/http";
import { askXRay, coachXRay, finishXRay, restartXRay, saveXRay, signalXRay, submitXRay, viewedXRay, xrayState, xrayStats } from "@/server/xray";

/** Invoice X-Ray: the signed-in person's own work on a document. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/xray">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? xrayStats(db, user, id) : xrayState(db, user, id, q.get("block"), now)));
}

/**
  Save work, submit the lines, finish with an explanation, or start again. In quote and invoice review mode, also: a
  signal (a line, source or piece of evidence opened, or a source flagged), asking someone for what's missing,
  coaching on the explanation, and the debrief seen. Nothing here creates a claim, payment or message.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/xray">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "submit") return submitXRay(db, user, id, input, now);
    if (input.action === "finish") return finishXRay(db, user, id, input, now);
    if (input.action === "restart") return restartXRay(db, user, id, input, now);
    if (input.action === "signal") return signalXRay(db, user, id, input, now);
    if (input.action === "ask") return askXRay(db, user, id, input, now);
    if (input.action === "coach") return coachXRay(db, user, id, input, now);
    if (input.action === "viewed") return viewedXRay(db, user, id, input, now);
    return saveXRay(db, user, id, input, now);
  });
}
