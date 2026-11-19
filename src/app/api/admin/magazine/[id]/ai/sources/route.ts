import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { addSource } from "@/server/magazineDraft";

/** Upload a source document (PDF, Word, PowerPoint or text). One that can't be read comes back marked with why. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/ai/sources">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a document.");
    });
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "Choose a document to upload.");
    return addSource(db, user, id, file, now);
  });
}
