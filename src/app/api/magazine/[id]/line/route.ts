import { body, handle } from "@/server/http";
import { answerLine, finishLine, lineState, lineStats, restartLine, revisitLine } from "@/server/line";

/** Where Is the Line?: the signed-in person's own attempt. With ?stats=1, accuracy by card for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/line">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? lineStats(db, user, id) : lineState(db, user, id, q.get("block"), now)));
}

/** Answer the current card, finish for the line map, replay a missed card or try the second pass, or start again. Nothing here approves anything. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/line">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "finish") return finishLine(db, user, id, input, now);
    if (input.action === "revisit") return revisitLine(db, user, id, input, now);
    if (input.action === "restart") return restartLine(db, user, id, input, now);
    return answerLine(db, user, id, input, now);
  });
}
