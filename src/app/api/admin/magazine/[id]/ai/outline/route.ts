import { body, eventStream, handle } from "@/server/http";
import { proposeOutline } from "@/server/magazineDraft";

/** Claude proposes the course outline from the brief, the time target and the documents, streaming its progress. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/outline">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ brief?: string; minutes?: number | null }>(req);
    return eventStream((send) => proposeOutline(db, user, id, input, now, send));
  });
}
