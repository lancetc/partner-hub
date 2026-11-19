import { handle } from "@/server/http";
import { noteStats } from "@/server/magazineNotes";

/** For authors: how many learners used each reflect-and-apply block. Counts only, never what anyone wrote. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/notes">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => noteStats(db, user, id));
}
