import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { transcribe } from "@/server/roleplay";

/** A spoken reply, turned into text for the learner to check before sending. The recording isn't kept. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/roleplay/transcribe">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new HttpError(400, "No recording arrived. Try again, or type instead.");
    return transcribe(db, user, id, form.get("blockId"), file, now);
  });
}
