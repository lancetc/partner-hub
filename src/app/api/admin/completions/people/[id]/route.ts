import { handle } from "@/server/http";
import { personReport } from "@/server/completionReports";

/** One person: every lesson, learning path and sign-off. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/completions/people/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => personReport(db, user, id));
}
