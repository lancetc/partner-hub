import { eventStream, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { generateLessonDraft } from "@/server/lessonDraft";
import type { Lesson } from "@/content/lessons";

/**
  Claude drafts a new lesson's cards from a brief and an optional PDF, Word or text file.
  With ?stream=1 the reply is a stream of JSON lines: progress as Claude works (which stage of the
  build it's writing), then {"type":"done", lesson, source} or {"type":"error", error}.
*/
export async function POST(req: Request) {
  const streaming = new URL(req.url).searchParams.get("stream") === "1";
  return handle(async ({ db, user, now }) => {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "Expected a brief or a document.");
    });
    const file = form.get("file");
    const audience = String(form.get("audience") ?? "partner");
    if (!["core", "partner", "coordinator", "briefing"].includes(audience)) throw new HttpError(400, "Unknown audience.");
    const request = { brief: String(form.get("brief") ?? ""), audience: audience as Lesson["track"], minutes: Number(form.get("minutes")) || 4 };
    const source = file instanceof File && file.size > 0 ? file : null;
    if (!streaming) return generateLessonDraft(db, user, request, source, now);
    return eventStream((send) => generateLessonDraft(db, user, request, source, now, send));
  });
}
