import { body, handle } from "@/server/http";
import { testWritten, type WrittenCard } from "@/server/writtenCheck";

/** Lets an author try a sample answer against a written answer card while editing it. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lessonTitle: string; outcome: string; card: WrittenCard; answer: string }>(req);
    return testWritten(db, user, { lessonTitle: b.lessonTitle, outcome: b.outcome }, b.card, b.answer, now);
  });
}
