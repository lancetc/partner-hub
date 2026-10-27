import { body, handle, intParam } from "@/server/http";
import { resolveReport } from "@/server/contentReports";

/** Mark a learner's report as dealt with. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/reports/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ resolution?: string }>(req);
    resolveReport(db, user, intParam(id), b.resolution ?? "", now);
    return { ok: true };
  });
}
