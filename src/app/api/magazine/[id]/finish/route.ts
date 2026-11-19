import { body, handle } from "@/server/http";
import { finishPage } from "@/server/magazine";

/** The reader finishes a page; the course completes when its required pages (and any quiz) are done. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/finish">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { revisionId, pageId } = await body<{ revisionId?: string; pageId?: string }>(req);
    return finishPage(db, user, id, revisionId, pageId, now);
  });
}
