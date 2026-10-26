import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { listUploads, saveUpload } from "@/server/uploads";

/** Images authors have uploaded, newest first. */
export async function GET() {
  return handle(({ db, user }) => ({ uploads: listUploads(db, user) }));
}

/** Upload a card image: multipart form with `file`, `width` and `height` (measured in the browser). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected an image upload.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
    return saveUpload(db, user, file, { width: Number(form.get("width")), height: Number(form.get("height")) }, now);
  });
}
