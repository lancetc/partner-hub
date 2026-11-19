import { body, handle } from "@/server/http";
import { teleprompterScript } from "@/server/magazineScript";

/** A teleprompter script for a video on this course, written by Claude from the page it's on. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/script">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user }) => teleprompterScript(db, user, id, await body(req)));
}
