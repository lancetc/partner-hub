import { body, handle } from "@/server/http";
import { debriefSeen, deleteAttempt, finishAttempt, roleplayState, startAttempt, submitTurn } from "@/server/roleplay";

/** A conversation practice in free conversation: the signed-in person's own latest attempt. No one else's is ever returned. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/roleplay">) {
  const { id } = await ctx.params;
  const block = new URL(req.url).searchParams.get("block");
  return handle(({ db, user }) => roleplayState(db, user, id, block));
}

/** Start an attempt, send a turn, ask for help or stop, mark the debrief read, or delete an attempt. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/roleplay">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startAttempt(db, user, id, input, now);
      case "finish":
        return finishAttempt(db, user, id, input, now);
      case "seen":
        return debriefSeen(db, user, id, input, now);
      case "delete":
        return deleteAttempt(db, user, input);
      default:
        return submitTurn(db, user, id, input, now);
    }
  });
}
