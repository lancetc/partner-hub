import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { adminStory, deleteStory, restoreStory, revertStory, saveStory, setStoryStatus } from "@/server/stories";
import type { Story } from "@/content/stories";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/stories/[slug]">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => adminStory(db, user, slug));
}

/** Save the story's changes. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/stories/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => saveStory(db, user, slug, (await body<{ story: Partial<Story> }>(req)).story, now));
}

/** `publish`, `unpublish`, `restore` (from deleted) or `revert` (a built-in story back as it shipped). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/stories/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action: string }>(req);
    if (action === "publish" || action === "unpublish") return setStoryStatus(db, user, slug, action === "publish" ? "published" : "draft", now);
    if (action === "restore") return restoreStory(db, user, slug, now);
    if (action === "revert") return revertStory(db, user, slug, now);
    throw new HttpError(400, "Unknown action.");
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/stories/[slug]">) {
  const { slug } = await ctx.params;
  return handle(({ db, user, now }) => deleteStory(db, user, slug, now));
}
