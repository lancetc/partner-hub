import { body, handle } from "@/server/http";
import { recordMomentAudio } from "@/server/lifeMoments";

/** Records a Life Moment's voice message. Charged: without `confirm: true` it only returns the estimate. Authors only. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordMomentAudio(db, user, await body<{ momentId?: unknown; confirm?: unknown }>(req), now));
}
