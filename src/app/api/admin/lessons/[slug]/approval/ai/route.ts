import { eventStream, handle } from "@/server/http";
import { runAiReview } from "@/server/topicAiReview";

/** Step 3: Claude checks the submitted topic against the facts library and its official sources, streaming its progress. */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/approval/ai">) {
  const { slug } = await ctx.params;
  return handle(({ db, user, now }) => eventStream((send) => runAiReview(db, user, slug, now, send)));
}
