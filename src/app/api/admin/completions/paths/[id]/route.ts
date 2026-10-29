import { handle } from "@/server/http";
import { pathReport } from "@/server/completionReports";

/** One learning path's progress, person by person and topic by topic. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/completions/paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => pathReport(db, user, id, now));
}
