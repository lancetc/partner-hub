import { eventStream, handle } from "@/server/http";
import { runAiReview } from "@/server/magazineApproval";

/** Claude pre-reviews the submitted course against its documents, streaming its progress. */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/approval/ai">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => eventStream((send) => runAiReview(db, user, id, now, send)));
}
