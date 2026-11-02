import { body, handle } from "@/server/http";
import { challengeView, setMyPreferences } from "@/server/challenges";

/** Your view of a challenge: the days, your points and badges, the leaderboards and your story so far. */
export async function GET(_req: Request, ctx: RouteContext<"/api/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => challengeView(db, user, id, now));
}

/** Your own settings: `{ hideName?, emails? }`. */
export async function PUT(req: Request, ctx: RouteContext<"/api/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user }) => setMyPreferences(db, user, id, await body<{ hideName?: boolean; emails?: boolean }>(req)));
}
