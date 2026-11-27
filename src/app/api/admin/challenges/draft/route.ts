import { eventStream, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { generateChallengeDraft } from "@/server/challengeDraft";
import { draftSourceFrom } from "@/server/lessonDraft";

/** Claude drafts a challenge (name, story, a mission and story beat each day) from a brief and an optional document, streaming its progress. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a brief or a document.");
    });
    // A document's words, read in the browser, or a SCORM package to read here.
    const source = draftSourceFrom(form);
    return eventStream((send) =>
      generateChallengeDraft(db, user, { brief: String(form.get("brief") ?? ""), days: Number(form.get("days")) || 5 }, source, now, send),
    );
  });
}
