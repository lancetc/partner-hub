import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { archiveLearningPath, learningPathDetail, restoreLearningPath, updateLearningPath, type PathInput } from "@/server/learningPaths";

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

/** `{ action: "restore" }` brings back a deleted path, with its lessons and assignments. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: string }>(req);
    if (b.action !== "restore") throw new HttpError(400, "Unknown action.");
    restoreLearningPath(db, user, id, now);
    return { ok: true };
  });
}
