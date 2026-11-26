import { body, handle } from "@/server/http";
import { featureStatus, setFeatured } from "@/server/activityCatalogue";
import { featuredTags, setFeaturedTag } from "@/server/magazineFeatured";

/**
  This course's two "featured" settings: the homepage spotlight ("Practise the decisions you make every day", one course
  at a time, and whether it can be), and the Featured tag on its Magazine card ("tagged": any number of courses).
*/
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/featured">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => ({ ...featureStatus(db, user, id), tagged: featuredTags(db).has(id) }));
}

/** `{ featured: boolean }` sets the homepage spotlight (replacing the course before); `{ tag: boolean }` the Magazine card's tag. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/featured">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ featured?: unknown; tag?: unknown }>(req);
    if (typeof input.tag === "boolean") setFeaturedTag(db, user, id, input.tag, now);
    if (typeof input.featured === "boolean") setFeatured(db, user, id, input.featured, now);
    return { ...featureStatus(db, user, id), tagged: featuredTags(db).has(id) };
  });
}
