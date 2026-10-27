import { body, handle } from "@/server/http";
import { checkWritten } from "@/server/writtenCheck";

/** AI feedback on a written answer card. The answer itself isn't stored. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lesson: string; card: string; answer: string }>(req);
    return checkWritten(db, user, b.lesson, b.card, b.answer, now);
  });
}
