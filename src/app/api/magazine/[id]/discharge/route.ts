import { body, handle } from "@/server/http";
import { dischargeState, dischargeStats, moveDischarge, retryDischarge, startDischarge, submitDischarge, viewedDischarge } from "@/server/dischargePivot";

/**
  The 72-Hour Discharge Pivot: the signed-in person's own attempt. With ?embed=1 (a Topic card placing the block by
  reference), the readers' copy of the block comes with it. With ?stats=1, totals for authors.
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("stats") ? dischargeStats(db, user, id) : dischargeState(db, user, id, q.get("block"), { embed: q.get("embed") === "1" }, now),
  );
}

/** Start or resume, make a move on the desk, submit the handover, note the debrief viewed, or try again. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startDischarge(db, user, id, input, now);
      case "submit":
        return submitDischarge(db, user, id, input, now);
      case "viewed":
        return viewedDischarge(db, user, id, input, now);
      case "retry":
        return retryDischarge(db, user, id, input, now);
      default:
        return moveDischarge(db, user, id, input, now);
    }
  });
}
