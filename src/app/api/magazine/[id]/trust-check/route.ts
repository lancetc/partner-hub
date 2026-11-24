import { body, handle } from "@/server/http";
import { moveTrust, retryTrust, startTrust, submitTrust, trustState, trustStats, viewedTrust } from "@/server/trustCheck";

/**
  The 28-Day Trust Check (docs/trust-check.md): the signed-in person's own attempt at the fictional case. With ?stats=1,
  totals for authors (counts only under five people). Nothing here reads or writes a real participant record.
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? trustStats(db, user, id) : trustState(db, user, id, q.get("block"), { embed: q.get("embed") === "1" })));
}

/** Start or resume, make a move, submit, note the debrief viewed, or try again. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startTrust(db, user, id, input, now);
      case "submit":
        return submitTrust(db, user, id, input, now);
      case "viewed":
        return viewedTrust(db, user, id, input, now);
      case "retry":
        return retryTrust(db, user, id, input, now);
      default:
        return moveTrust(db, user, id, input, now);
    }
  });
}
