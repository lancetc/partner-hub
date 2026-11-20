import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { uploadDocument } from "@/server/onboarding";

/** Upload a document for one of your setup tasks. It's stored privately and isn't sent for review until you submit it. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
    return uploadDocument(db, user, form.get("taskId"), file, now);
  });
}
