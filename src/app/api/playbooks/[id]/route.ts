import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { acknowledge, askLead, gapAction, replyToGap, resolveSnippet, toggleSaved } from "@/server/playbooks";
import { aidViewed } from "@/server/favourites";

/** A playbook snippet as this reader may see it: the current approved release (or its fallback), for their role. */
export async function GET(_req: Request, ctx: RouteContext<"/api/playbooks/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => resolveSnippet(db, user, id, now));
}

/** Viewed, acknowledged, saved; ask a lead; reply; or a question's next step. Nothing here reports an incident. */
export async function POST(req: Request, ctx: RouteContext<"/api/playbooks/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "viewed") return aidViewed(db, user, id, input, now);
    if (input.action === "ack") return acknowledge(db, user, id, now);
    if (input.action === "save") return toggleSaved(db, user, id, input.on === true, now);
    if (input.action === "ask") return askLead(db, user, { ...input, snippetId: id }, now);
    if (input.action === "reply") return replyToGap(db, user, input, now);
    if (["close", "approve-post", "decline", "policy-pending", "resolve"].includes(input.action as string)) return gapAction(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
