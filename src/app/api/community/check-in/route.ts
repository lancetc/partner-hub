import { body, handle } from "@/server/http";
import { checkInList, checkInOpened } from "@/server/checkIn";

/** People I follow, for the homepage: a card for each, with a real opening line and starters (docs/lives-in-progress.md). */
export async function GET() {
  return handle(({ db, user, now }) => checkInList(db, user, now));
}

/** A catch-up was opened (`{ memberId }`): for the report only, never counted as learning. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => checkInOpened(db, user, (await body<{ memberId?: unknown }>(req)).memberId, now));
}
