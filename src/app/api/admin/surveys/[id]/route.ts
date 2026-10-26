import { body, handle } from "@/server/http";
import { archiveSurvey, surveyDetail, updateSurvey, type SurveyInput } from "@/server/surveys";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/surveys/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => surveyDetail(db, user, id));
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/surveys/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => updateSurvey(db, user, id, await body<SurveyInput>(req), now));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/surveys/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => archiveSurvey(db, user, id, now));
}
