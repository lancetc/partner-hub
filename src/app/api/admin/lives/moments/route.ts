import { body, handle } from "@/server/http";
import { demoMomentsEstimate, momentAction, momentsAdmin, momentsReport } from "@/server/lifeMoments";

/** Admin → Lives in Progress → Life Moments. `?report=1&days=` for the feed's report; `?estimate=1&voice=` for the demo voice messages' cost. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("report")
      ? momentsReport(db, user, now, Math.min(365, Math.max(7, Number(q.get("days")) || 30)))
      : q.get("estimate")
        ? demoMomentsEstimate(db, user, now, q.get("voice") || "openai:sage")
        : momentsAdmin(db, user, now),
  );
}

/** One change, by `action` (moment.new, moment.save, moment.status, moment.bulk…). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => momentAction(db, user, await body<Record<string, unknown>>(req), now));
}
