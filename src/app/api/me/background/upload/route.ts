import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { uploadBackground } from "@/server/backgrounds";

/** Upload your own photo as your background (form field "file"). It's resized and kept as WebP on the server. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a photo to upload.");
    return uploadBackground(db, user, file, now);
  });
}
