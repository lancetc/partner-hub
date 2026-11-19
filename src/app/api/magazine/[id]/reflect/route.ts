import { body, handle } from "@/server/http";
import { reflect } from "@/server/magazineReflect";

/** A learner's answer to a Reflection block: kept, with Claude's feedback on it. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/reflect">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => reflect(db, user, id, await body(req), now));
}
