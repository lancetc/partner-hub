import { body, handle } from "@/server/http";
import { recordActivityEvent } from "@/server/activityCatalogue";

/** A homepage or directory event: shown, opened or saved. The activity's id and version and the course only, never an answer or a figure. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordActivityEvent(db, user, await body<Record<string, unknown>>(req), now));
}
