import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  cashBridgeState,
  cashBridgeStats,
  finishCashBridge,
  retryCashBridge,
  saveCashBridge,
  sheetEvent,
  submitLow,
  submitPrediction,
} from "@/server/cashBridge";

/** The 90-Day Cash Bridge: the signed-in person's own attempt at Maya's fictional 90 days. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/cashbridge">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? cashBridgeStats(db, user, id) : cashBridgeState(db, user, id, q.get("block"))));
}

/** Save progress, make the first guess, read the low point, finish (then the debrief is sent), look again, or note the sheet printed or a plan saved. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/cashbridge">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      if (input.action === "predict") return submitPrediction(db, user, id, input, now);
      if (input.action === "low") return submitLow(db, user, id, input, now);
      if (input.action === "finish") return finishCashBridge(db, user, id, input, now);
      if (input.action === "retry") return retryCashBridge(db, user, id, input, now);
      if (input.action === "printed" || input.action === "saved") return sheetEvent(db, user, id, input, now);
      return saveCashBridge(db, user, id, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
