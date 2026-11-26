import { body, handle } from "@/server/http";
import { requireAuthor } from "@/server/auth";
import { featuredTags, setFeaturedTag } from "@/server/magazineFeatured";

/** Whether this Discovery Path carries the Featured tag on its card (`tagged`). Authors only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/featured">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => {
    requireAuthor(user);
    return { tagged: featuredTags(db, "path").has(id) };
  });
}

/** `{ tag: boolean }`: tags or untags it, straight away. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/featured">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => ({
    tagged: setFeaturedTag(db, user, id, (await body<{ tag?: unknown }>(req)).tag === true, now, "path"),
  }));
}
