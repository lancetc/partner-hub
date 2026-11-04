import { eventStream, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { generatePathDraft } from "@/server/pathDraft";

/** Claude drafts a learning path (overview, outcomes, chapters of topics) from a brief and an optional document, streaming its progress. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a brief or a document.");
    });
    const file = form.get("file");
    const audience = String(form.get("audience") ?? "core");
    if (!["core", "partner", "coordinator"].includes(audience)) throw new HttpError(400, "Unknown audience.");
    const source = file instanceof File && file.size > 0 ? file : null;
    return eventStream((send) => generatePathDraft(db, user, { brief: String(form.get("brief") ?? ""), audience }, source, now, send));
  });
}
