import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteUpload, replaceUpload, restoreUpload, uploadUsage } from "@/server/uploads";

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

/** Replace the picture with a new file everywhere it's used: multipart form with `file`, `width` and `height`. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/uploads/[name]">) {
  const { name } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a picture.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a picture to replace it with.");
    return replaceUpload(db, user, name, file, { width: Number(form.get("width")), height: Number(form.get("height")) }, now);
  });
}
