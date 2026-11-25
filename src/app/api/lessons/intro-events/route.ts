import { body, handle } from "@/server/http";
import { recordIntroEvent } from "@/server/topicIntros";

/** What a learner did on a Topic's Introduction card: ids and numbers only. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordIntroEvent(db, user, await body<Record<string, unknown>>(req), now));
}
