import { handle } from "@/server/http";
import { introAudioStats } from "@/server/narrationStats";

/** Listening to the course's Audio Introductions, by page: totals only, never who listened. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/narration/stats">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => introAudioStats(db, user, id));
}
