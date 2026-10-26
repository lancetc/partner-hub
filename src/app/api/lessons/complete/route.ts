import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { lessons } from "@/content/lessons";
import { recordLessonCompletion } from "@/server/learning";

/** Server-confirmed lesson completion. Enrols the learner in any follow up path it triggers. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { slug, version } = await body<{ slug: string; version: string }>(req);
    if (!lessons.some((l) => l.slug === slug && l.version === version)) throw new HttpError(404, "Unknown lesson version.");
    return recordLessonCompletion(db, user, { slug, version }, now);
  });
}
