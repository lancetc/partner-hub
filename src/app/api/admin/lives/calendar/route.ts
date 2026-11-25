import { body, handle } from "@/server/http";
import { calendarAdmin, calendarReport, routineAction } from "@/server/livingCalendar";

/** Admin → Lives in Progress → Life Moments, calendar view: `?month=YYYY-MM` (with routines and the review); `?report=1&days=`. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("report") ? calendarReport(db, user, now, Math.min(365, Math.max(7, Number(q.get("days")) || 30))) : calendarAdmin(db, user, now, q.get("month")),
  );
}

/** Routine changes: routine.new, routine.save, routine.status, routine.delete. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => routineAction(db, user, await body<Record<string, unknown>>(req), now));
}
