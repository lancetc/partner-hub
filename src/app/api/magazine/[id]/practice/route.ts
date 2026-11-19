import { body, handle } from "@/server/http";
import { answerPractice, practiceMoment, practiceState, startPractice } from "@/server/magazinePractice";

/** Self-review ("Test myself"): GET ?pageId= opens the dialog's state; a learner only ever sees their own reviews. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/practice">) {
  const { id } = await ctx.params;
  const pageId = new URL(req.url).searchParams.get("pageId");
  return handle(({ db, user, now }) => practiceState(db, user, id, pageId, now));
}

/** start, answer, or a moment in the dialog (opened, pause, resume, source). Never progress or completion. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/practice">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "start") return startPractice(db, user, id, input, now);
    if (input.action === "answer") return answerPractice(db, user, id, input, now);
    return practiceMoment(db, user, id, input, now);
  });
}
