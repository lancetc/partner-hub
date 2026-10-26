import { body, handle, intParam } from "@/server/http";
import { followUpAct, followUpView, type FollowUpAction } from "@/server/learning";

export async function GET(_req: Request, ctx: RouteContext<"/api/follow-ups/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => followUpView(db, user, intParam(id)));
}

export async function POST(req: Request, ctx: RouteContext<"/api/follow-ups/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => followUpAct(db, user, intParam(id), await body<FollowUpAction>(req), now));
}
