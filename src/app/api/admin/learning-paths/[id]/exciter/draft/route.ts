import { body, eventStream, handle } from "@/server/http";
import { requireAuthor } from "@/server/auth";
import { draftExciters } from "@/server/pathExciter";

/** AI drafts this path's Discovery Exciter from the whole path, streaming its progress. It arrives as a new draft version. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/exciter/draft">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const input = await body<{ note?: unknown }>(req);
    return eventStream((send) => draftExciters(db, user, { pathIds: [id], note: input.note }, now, send));
  });
}
