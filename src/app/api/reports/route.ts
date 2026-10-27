import { body, handle } from "@/server/http";
import { reportCard } from "@/server/contentReports";

/** A learner flags a card that looks wrong or out of date. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lesson: string; card: string; text: string }>(req);
    return reportCard(db, user, b.lesson, b.card, b.text, now);
  });
}
