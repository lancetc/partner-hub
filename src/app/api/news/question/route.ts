import { body, handle } from "@/server/http";
import { answerQuestion } from "@/server/newsEdition";

/** Answer the homepage's weekly question; the results come back (server/newsEdition). `{ questionId, optionId }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => answerQuestion(db, user, await body<Record<string, unknown>>(req), now));
}
