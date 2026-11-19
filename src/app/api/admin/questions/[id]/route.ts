import { body, handle } from "@/server/http";
import { questionDetail, reviewQuestion, updateQuestion } from "@/server/questionPool";

/** One question: its versions, answers and feedback, source, review history and every place it's used. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/questions/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => questionDetail(db, user, id));
}

/** { action: "update", ...details } or a review step: submit, approve, request_changes, flag, retire, restore. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/questions/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "update" ? updateQuestion(db, user, id, input, now) : reviewQuestion(db, user, id, input, now);
  });
}
