import { body, handle } from "@/server/http";
import { recordDiary } from "@/server/livesAuthoring";

/**
  Records an episode's audio diary in the character's approved voice. Charged: without `confirm: true` it only returns
  the estimate. Authors only; a learner's page never makes a recording.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordDiary(db, user, await body<{ episodeId?: unknown; confirm?: unknown }>(req), now));
}
