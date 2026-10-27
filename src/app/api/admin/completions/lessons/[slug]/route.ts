import { handle } from "@/server/http";
import { lessonReport } from "@/server/completionReports";

/** One lesson: who has finished, started or not opened it, and how each quiz question went. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/completions/lessons/[slug]">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => lessonReport(db, user, slug));
}
