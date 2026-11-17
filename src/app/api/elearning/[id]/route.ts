import { body, handle } from "@/server/http";
import { courseForPlayer, launch } from "@/server/elearning/service";
import { requestOrigin } from "@/server/elearning/content";

/** A course for its player: details, and the learner's latest attempt. */
export async function GET(_req: Request, ctx: RouteContext<"/api/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => courseForPlayer(db, user, id));
}

/** Launch: starts or resumes the learner's attempt ({ restart: true } starts a new one). */
export async function POST(req: Request, ctx: RouteContext<"/api/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { restart } = await body<{ restart?: boolean }>(req);
    return launch(db, user, id, { restart: restart === true, hubOrigin: requestOrigin(req) }, now);
  });
}
