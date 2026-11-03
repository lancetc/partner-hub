import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { assignLearningPath, unassignLearningPath } from "@/server/learningPaths";
import { clearQuizAttempts } from "@/server/pathQuiz";

/** Assign people (with an optional due date), remove one person's assignment, or give someone another try at the upfront quiz. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/assignments">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "assign"; userIds: string[]; dueDate?: string | null } | { action: "remove" | "clear-quiz"; userId: string }>(req);
    if (b.action === "assign") return assignLearningPath(db, user, id, b.userIds, b.dueDate || null, now);
    if (b.action === "remove") return unassignLearningPath(db, user, id, b.userId, now);
    if (b.action === "clear-quiz") return clearQuizAttempts(db, user, id, b.userId, now);
    throw new HttpError(400, "Unknown action.");
  });
}
