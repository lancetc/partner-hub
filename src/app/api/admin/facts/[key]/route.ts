import { handle } from "@/server/http";
import { deleteFact } from "@/server/facts";

/** Remove a fact that no lesson uses. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/facts/[key]">) {
  const { key } = await ctx.params;
  return handle(({ db, user, now }) => deleteFact(db, user, key, now));
}
