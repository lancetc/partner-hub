import { body, handle } from "@/server/http";
import { networkOrigins } from "@/server/pathReviews";
import { publicSharing, setPublicLink } from "@/server/publicPaths";

/** The path's public link (if it's public) and the anonymous counts, plus this Mac's network addresses for links others can open. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/public">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => ({ ...publicSharing(db, user, id), origins: networkOrigins(req.headers.get("host")) }));
}

/** `{ on }`: make the path public (anyone with the link, no sign in) or private again. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/public">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => ({
    ...setPublicLink(db, user, id, Boolean((await body<{ on: boolean }>(req)).on), now),
    origins: networkOrigins(req.headers.get("host")),
  }));
}
