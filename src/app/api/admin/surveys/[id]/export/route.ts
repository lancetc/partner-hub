import { handle } from "@/server/http";
import { surveyCsv } from "@/server/surveys";

/** Responses as a spreadsheet. Names are left out of anonymous surveys. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/surveys/[id]/export">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => {
    const { filename, body } = surveyCsv(db, user, id);
    return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` } });
  });
}
