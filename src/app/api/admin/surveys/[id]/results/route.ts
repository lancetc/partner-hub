import { handle } from "@/server/http";
import { surveyResults } from "@/server/surveys";

export async function GET(req: Request, ctx: RouteContext<"/api/admin/surveys/[id]/results">) {
  const { id } = await ctx.params;
  const place = new URL(req.url).searchParams.get("place") ?? undefined;
  return handle(({ db, user }) => surveyResults(db, user, id, place));
}
