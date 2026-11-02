import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { archiveChallenge, challengeDetail, publishChallenge, updateChallenge, type ChallengeInput } from "@/server/challenges";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => challengeDetail(db, user, id));
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => updateChallenge(db, user, id, await body<ChallengeInput>(req), now));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => archiveChallenge(db, user, id, now));
}

/** `{ action: "publish" | "unpublish" }`. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/challenges/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: string }>(req);
    if (b.action !== "publish" && b.action !== "unpublish") throw new HttpError(400, "Unknown action.");
    return publishChallenge(db, user, id, b.action === "publish", now);
  });
}
