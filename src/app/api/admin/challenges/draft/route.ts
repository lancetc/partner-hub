import { eventStream, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { generateChallengeDraft } from "@/server/challengeDraft";

/** Claude drafts a challenge (name, story, a mission and story beat each day) from a brief and an optional document, streaming its progress. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a brief or a document.");
    });
    const file = form.get("file");
    const source = file instanceof File && file.size > 0 ? file : null;
    return eventStream((send) =>
      generateChallengeDraft(db, user, { brief: String(form.get("brief") ?? ""), days: Number(form.get("days")) || 5 }, source, now, send),
    );
  });
}
