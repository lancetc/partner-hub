import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { spacedAction, type SpacedActionName } from "@/server/spaced";
import { MAX_INSTRUCTIONS } from "@/server/generate";

/** Spaced learning checkbox and its variations: enable (generates on first use), disable, regenerate, approve. Generation takes optional author instructions. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action, instructions } = await body<{ action: SpacedActionName; instructions?: string }>(req);
    if (!["enable", "disable", "regenerate", "approve", "signoff_on", "signoff_off"].includes(action)) throw new HttpError(400, "Unknown action.");
    if (instructions !== undefined && typeof instructions !== "string") throw new HttpError(400, "Instructions must be text.");
    if (instructions && instructions.length > MAX_INSTRUCTIONS) throw new HttpError(400, `Keep instructions under ${MAX_INSTRUCTIONS} characters.`);
    return (await spacedAction(db, user, slug, action, now, instructions)) ?? { ok: true };
  });
}
