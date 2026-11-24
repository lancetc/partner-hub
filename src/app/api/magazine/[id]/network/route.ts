import { body, handle } from "@/server/http";
import { moveNetwork, networkState, networkStats, retryNetwork, startNetwork, submitNetwork, viewedNetwork } from "@/server/networkBench";

/**
  Build Your Local Bench (docs/network-builder.md): the signed-in person's own attempt at the fictional case. With
  ?stats=1, totals for authors (counts only under five people).
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) =>
    q.get("stats") ? networkStats(db, user, id) : networkState(db, user, id, q.get("block"), { embed: q.get("embed") === "1" }),
  );
}

/** Start or resume, make a move, submit, note the debrief viewed, or try again. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startNetwork(db, user, id, input, now);
      case "submit":
        return submitNetwork(db, user, id, input, now);
      case "viewed":
        return viewedNetwork(db, user, id, input, now);
      case "retry":
        return retryNetwork(db, user, id, input, now);
      default:
        return moveNetwork(db, user, id, input, now);
    }
  });
}
