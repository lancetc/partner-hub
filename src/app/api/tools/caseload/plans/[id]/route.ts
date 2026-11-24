import { handle } from "@/server/http";
import { getPlan } from "@/server/caseloadPlanner";

/** One saved plan in the person's business, at a version (?version=, the latest otherwise). Anyone else gets "not found". */
export async function GET(req: Request, ctx: RouteContext<"/api/tools/caseload/plans/[id]">) {
  const { id } = await ctx.params;
  const version = new URL(req.url).searchParams.get("version");
  return handle(({ db, user }) => getPlan(db, user, id, version ?? undefined));
}
