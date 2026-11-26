import { body, handle } from "@/server/http";
import { activityInventory, saveShowcase } from "@/server/activityCatalogue";

/** The Activity Catalogue with each entry's checked status, the selection report and the homepage picks. Authors only. */
export async function GET() {
  return handle(({ db, user, now }) => activityInventory(db, user, now));
}

/** Saves the homepage picks an editor chose, ordered and scheduled (`{ picks }`), or `{ picks: null }` to go back to the defaults. */
export async function PUT(req: Request) {
  return handle(async ({ db, user, now }) => ({ showcase: saveShowcase(db, user, (await body<{ picks?: unknown }>(req)).picks ?? null, now) }));
}
