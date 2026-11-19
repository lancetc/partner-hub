import { body, handle } from "@/server/http";
import { completeGuide } from "@/server/magazine";

/** The reader finishes a guide; the server checks its completion rule against the revision they read. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/complete">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { revisionId } = await body<{ revisionId?: string }>(req);
    return completeGuide(db, user, id, revisionId, now);
  });
}
