import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteUpload, restoreUpload, uploadUsage } from "@/server/uploads";

/** Which lessons use an uploaded image, asked before deleting it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/uploads/[name]">) {
  const { name } = await ctx.params;
  return handle(({ db, user }) => uploadUsage(db, user, name));
}

/** Delete an image from the library (the file is kept for cards still using it). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/uploads/[name]">) {
  const { name } = await ctx.params;
  return handle(({ db, user, now }) => deleteUpload(db, user, name, now));
}

/** `{ action: "restore" }` undoes a delete. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/uploads/[name]">) {
  const { name } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: string }>(req);
    if (b.action !== "restore") throw new HttpError(400, "Unknown action.");
    return restoreUpload(db, user, name, now);
  });
}
