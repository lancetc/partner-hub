import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { adminWebinar, deleteWebinar, publishWebinar, saveWebinar, type WebinarInput } from "@/server/webinars";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => adminWebinar(db, user, id));
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => saveWebinar(db, user, id, await body<WebinarInput>(req), now));
}

export async function POST(req: Request, ctx: RouteContext<"/api/admin/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action: "publish" | "unpublish" }>(req);
    if (action !== "publish" && action !== "unpublish") throw new HttpError(400, "Unknown action.");
    return publishWebinar(db, user, id, action === "publish", now);
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => deleteWebinar(db, user, id, now));
}
