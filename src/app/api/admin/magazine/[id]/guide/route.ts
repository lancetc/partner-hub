import { body, handle } from "@/server/http";
import { draftGuideScript } from "@/server/learningGuide";

/** A draft script for one AI Learning Guide segment, from the page as it is: for the author to rewrite and a person to approve. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/guide">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user }) => draftGuideScript(db, user, id, await body(req)));
}
