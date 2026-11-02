import { body, handle } from "@/server/http";
import { networkOrigins, pathReviewSharing, setPathReviewLink } from "@/server/pathReviews";

/** The path's review link and its reviewers, plus this Mac's network addresses for copying a link others can open. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/review">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => ({ ...pathReviewSharing(db, user, id), origins: networkOrigins(req.headers.get("host")) }));
}

/** `{ on }`: switch the path's review link on or off. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/review">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => ({
    ...setPathReviewLink(db, user, id, Boolean((await body<{ on: boolean }>(req)).on), now),
    origins: networkOrigins(req.headers.get("host")),
  }));
}
