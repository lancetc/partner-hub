import { handle } from "@/server/http";
import { challengeReport } from "@/server/challenges";

/** Participation by day, knowledge gaps, and everyone's points. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/challenges/[id]/report">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => challengeReport(db, user, id, now));
}
