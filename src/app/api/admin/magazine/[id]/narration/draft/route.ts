import { body, eventStream, handle } from "@/server/http";
import { draftNarration } from "@/server/magazineNarration";

/** Claude drafts Audio Guide scripts for the course as it stands in the editor, streaming its progress. Nothing is saved here. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/narration/draft">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ scope?: string; only?: string[]; note?: string; doc?: unknown; title?: string; standfirst?: string }>(req);
    return eventStream((send) => draftNarration(db, user, id, input, now, send));
  });
}
