import { body, handle } from "@/server/http";
import { demoDiaryEstimate, livesAction, livesAdmin, livesBible, livesReport } from "@/server/livesAuthoring";

/**
  Admin → Lives in Progress (docs/lives-in-progress.md), authors only. `?bible=<member id>` for one Character Bible,
  `?report=1` for the report (counts only), `?estimate=1` for what recording the demo diaries would cost.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("bible")
      ? livesBible(db, user, q.get("bible"), now)
      : q.get("report")
        ? livesReport(db, user, now, Math.min(365, Math.max(7, Number(q.get("days")) || 30)))
        : q.get("estimate")
          ? demoDiaryEstimate(db, user, now, q.get("voice") || undefined)
          : livesAdmin(db, user, now),
  );
}

/** One change, by `action` (bible.save, arc.status, episode.save, settings.save…). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => livesAction(db, user, await body<Record<string, unknown>>(req), now));
}
