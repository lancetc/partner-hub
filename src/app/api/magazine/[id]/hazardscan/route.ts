import { body, handle } from "@/server/http";
import {
  hazardScanState,
  hazardScanStats,
  reportUnclear,
  retryHazardScan,
  saveHazardScan,
  startHazardScan,
  submitFindings,
  submitResponse,
  viewedHazardScan,
} from "@/server/hazardScan";

/**
  Spot the Hazard: the signed-in person's own attempt at a scene. With ?embed=1 (a Topic card placing the scene by
  reference), the readers' copy of the block comes with it. With ?stats=1, totals by variant and item for authors.
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("stats") ? hazardScanStats(db, user, id) : hazardScanState(db, user, id, q.get("block"), { embed: q.get("embed") === "1" }, now),
  );
}

/** Start or resume, save flags, submit findings, submit the action, note the debrief viewed, report an unclear item, or try another room. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startHazardScan(db, user, id, input, now);
      case "findings":
        return submitFindings(db, user, id, input, now);
      case "respond":
        return submitResponse(db, user, id, input, now);
      case "viewed":
        return viewedHazardScan(db, user, id, input, now);
      case "unclear":
        return reportUnclear(db, user, id, input, now);
      case "retry":
        return retryHazardScan(db, user, id, input, now);
      default:
        return saveHazardScan(db, user, id, input, now);
    }
  });
}
