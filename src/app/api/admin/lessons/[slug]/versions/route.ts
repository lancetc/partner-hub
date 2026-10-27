import { handle } from "@/server/http";
import { listVersions } from "@/server/lessonVersions";

/** A lesson's published versions, newest first, each with what changed from the one before. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/versions">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => ({ versions: listVersions(db, user, slug) }));
}
