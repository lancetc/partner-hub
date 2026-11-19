import { body, eventStream, handle } from "@/server/http";
import { draftPlan, generatePage } from "@/server/magazineDraft";
import { pageScript } from "@/server/magazineNarration";

/**
  Claude writes one page of the approved outline, streaming its progress, and its Audio Guide script
  to go with it (a draft to approve). The page goes back to the editor; nothing is saved here.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/page">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ index?: number }>(req);
    return eventStream(async (send) => {
      const out = await generatePage(db, user, id, input, now, send);
      const outline = draftPlan(db, user, id).outline ?? [];
      const script = await pageScript(db, user, id, { page: out.page, index: out.index, outline });
      return script ? { ...out, page: { ...out.page, narration: { script, status: "draft" as const } } } : out;
    });
  });
}
