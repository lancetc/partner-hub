import { handle } from "@/server/http";
import { learnerPath } from "@/server/learningPaths";

/** One learning path with the signed-in person's progress (where its QR code leads). */
export async function GET(_req: Request, ctx: RouteContext<"/api/paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => learnerPath(db, user, id));
}
