import { body, handle } from "@/server/http";
import { archiveLearningPath, learningPathDetail, updateLearningPath, type PathInput } from "@/server/learningPaths";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => learningPathDetail(db, user, id));
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => updateLearningPath(db, user, id, await body<PathInput>(req), now));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => archiveLearningPath(db, user, id, now));
}
