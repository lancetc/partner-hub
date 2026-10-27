import { body, handle } from "@/server/http";
import { createPlaceholders } from "@/server/authoredLessons";

/** Create empty draft lessons by title, for planning a path before the lessons are written. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ titles: string[]; track?: string }>(req);
    return { lessons: createPlaceholders(db, user, b.titles, b.track, now) };
  });
}
