import { body, handle } from "@/server/http";
import { reflectFeedback } from "@/server/reflectFeedback";

/** Practice feedback from Claude on a Reflect card answer. The answer itself isn't stored. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lesson: string; card: string; response: string }>(req);
    return reflectFeedback(db, user, b.lesson, b.card, b.response, now);
  });
}
