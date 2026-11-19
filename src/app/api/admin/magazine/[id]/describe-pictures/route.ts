import { body, handle } from "@/server/http";
import { describeMissing } from "@/server/describeImage";

/** Describe with AI for every picture in the course still missing a description. Nothing is saved here. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/describe-pictures">) {
  await ctx.params;
  return handle(async ({ db, user, now }) => describeMissing(db, user, await body<{ doc?: unknown }>(req), now));
}
