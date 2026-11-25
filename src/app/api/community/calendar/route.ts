import { body, handle } from "@/server/http";
import { calendarActivity, livingCalendar } from "@/server/livingCalendar";

/**
  The Living Calendar for the reader: `?month=YYYY-MM` (this month by default), `&members=id,id` or `&following=1`.
  Only what's been shared, plus approved teasers and usual routines: decided here, never in the browser.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    livingCalendar(db, user, now, { month: q.get("month"), members: q.get("members") ?? "", following: q.get("following") }),
  );
}

/** What the reader did: a visit, a day explored, a filter, an event opened. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => calendarActivity(db, user, await body<Record<string, unknown>>(req), now));
}
