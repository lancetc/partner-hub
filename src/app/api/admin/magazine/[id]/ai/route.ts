import { body, handle } from "@/server/http";
import { draftPlan, updatePlan } from "@/server/magazineDraft";

/** The AI draft so far: documents, brief, time target and outline. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => draftPlan(db, user, id));
}

/** The author's edits to the brief, time target or outline. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => updatePlan(db, user, id, await body(req), now));
}
