import { body, handle } from "@/server/http";
import { bridgeState, checkBridge, saveBridge } from "@/server/bridge";

/** While You Wait (practice): the signed-in person's adjusted scenario and summary. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/bridge">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => bridgeState(db, user, id, q.get("block")));
}

/** Save the scenario or summary, or check the summary against the reviewed points. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/bridge">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "check") return checkBridge(db, user, id, input, now);
    return saveBridge(db, user, id, input, now);
  });
}
