import { body, handle } from "@/server/http";
import { exciterAction, exciterView } from "@/server/pathExciter";

/** The path's Discovery Exciter as its author sees it: the script, its audio, approval, freshness and the latest recording job. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/exciter">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => exciterView(db, user, id));
}

/**
  An author's change: save the script, approve it, approve the audio for publication, show or hide it, the delivery
  note, "still appropriate", discard a replacement, attach an uploaded recording, remove, or (confirmed) generate audio.
  Saving a script never makes audio.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/exciter">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => exciterAction(db, user, id, await body<Record<string, unknown>>(req), now));
}
