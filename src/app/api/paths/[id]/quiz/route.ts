import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { previewQuiz, startQuiz, submitQuiz } from "@/server/pathQuiz";

/**
  `{ action: "start" }` begins (or resumes) the path's upfront quiz; `{ action: "submit", attempt, answers }` marks it.
  `{ action: "preview" }` is for authors: questions with their answers, and nothing saved.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/paths/[id]/quiz">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "start" | "preview" } | { action: "submit"; attempt: number; answers: Record<string, string> }>(req);
    if (b.action === "preview") return previewQuiz(db, user, id);
    if (b.action === "start") return startQuiz(db, user, id, now);
    if (b.action === "submit") return submitQuiz(db, user, id, Number(b.attempt), b.answers, now);
    throw new HttpError(400, "Unknown action.");
  });
}
