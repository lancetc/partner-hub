import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { generateLessonDraft } from "@/server/lessonDraft";
import type { Lesson } from "@/content/lessons";

/** Claude drafts a new lesson's cards from a brief and an optional PDF, Word or text file. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a brief or a document.");
    });
    const file = form.get("file");
    const audience = String(form.get("audience") ?? "partner");
    if (!["core", "partner", "coordinator", "briefing"].includes(audience)) throw new HttpError(400, "Unknown audience.");
    return generateLessonDraft(
      db,
      user,
      { brief: String(form.get("brief") ?? ""), audience: audience as Lesson["track"], minutes: Number(form.get("minutes")) || 4 },
      file instanceof File && file.size > 0 ? file : null,
      now,
    );
  });
}
