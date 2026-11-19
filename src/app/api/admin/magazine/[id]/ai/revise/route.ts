import { body, eventStream, handle } from "@/server/http";
import { proposeRevision } from "@/server/magazineRevise";

/**
  Revise with AI: Claude reviews the course (or one page) as it stands in the editor against the
  author's instructions, streaming its progress. The proposed changes go back to the editor; nothing
  is saved here.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/revise">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ prompt?: string; scope?: string; doc?: unknown }>(req);
    return eventStream((send) => proposeRevision(db, user, id, input, now, send));
  });
}
