import { handle } from "@/server/http";
import { hazardScanPlacements } from "@/server/hazardScan";

/**
  For authors and Quality: every published Spot the Hazard scene, where it's live (Magazine and Topic cards), its
  approved variants and reviewers, and its sources. ?source=<id> lists only the scenes resting on that source.
*/
export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get("source") ?? undefined;
  return handle(({ db, user, now }) => hazardScanPlacements(db, user, now, { source }));
}
