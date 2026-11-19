import { body, handle } from "@/server/http";
import { recordNarration } from "@/server/magazineNarration";

/** Records one approved Audio Guide script with ElevenLabs; the recording goes back to the editor to attach. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/narration/record">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => recordNarration(db, user, id, await body<{ script?: string; voice?: string; target?: string }>(req), now));
}
