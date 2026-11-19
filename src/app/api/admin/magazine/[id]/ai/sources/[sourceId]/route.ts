import { body, handle } from "@/server/http";
import { removeSource, updateSource } from "@/server/magazineDraft";

/** Mark a document authoritative or background only. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/sources/[sourceId]">) {
  const { id, sourceId } = await ctx.params;
  return handle(async ({ db, user }) => updateSource(db, user, id, sourceId, await body(req)));
}

/** Remove a document from the draft's sources. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/sources/[sourceId]">) {
  const { id, sourceId } = await ctx.params;
  return handle(({ db, user }) => {
    removeSource(db, user, id, sourceId);
    return { ok: true };
  });
}
