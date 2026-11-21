import { body, handle } from "@/server/http";
import { transferSubmitted } from "@/server/living";
import { recordGuideEvent } from "@/server/magazine";

/** What a reader did in a guide: opened it, reached a section, or answered a decision question. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/events">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ event?: unknown; blockId?: unknown }>(req);
    const result = recordGuideEvent(db, user, id, input, now);
    // The Magazine keeps the answer. If the question was a return's transfer question, living cases notes that it was answered.
    if (input.event === "decision") transferSubmitted(db, user, id, input.blockId, (result as { attempt?: number }).attempt, now);
    return result;
  });
}
