import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { assignLearningPath, unassignLearningPath } from "@/server/learningPaths";

/** Assign people (with an optional due date) or remove one person's assignment. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/assignments">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "assign"; userIds: string[]; dueDate?: string | null } | { action: "remove"; userId: string }>(req);
    if (b.action === "assign") return assignLearningPath(db, user, id, b.userIds, b.dueDate || null, now);
    if (b.action === "remove") return unassignLearningPath(db, user, id, b.userId, now);
    throw new HttpError(400, "Unknown action.");
  });
}
