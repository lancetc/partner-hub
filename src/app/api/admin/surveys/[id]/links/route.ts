import { body, handle } from "@/server/http";
import { setSurveyLinks } from "@/server/surveys";

/** Where the survey is asked: finishing these learning paths and lessons. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/surveys/[id]/links">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => setSurveyLinks(db, user, id, (await body<{ targets: { type: "path" | "lesson"; id: string }[] }>(req)).targets ?? [], now));
}
