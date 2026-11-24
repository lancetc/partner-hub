import { handle } from "@/server/http";
import { dischargePlacements } from "@/server/dischargePivot";

/**
  For authors and Quality: every published 72-Hour Discharge Pivot, where it's live (Magazine and Topic cards), its
  scenario version and its sources. ?source=<id> lists only those resting on that source. The Topic editor uses it to
  offer simulations a card can place by reference.
*/
export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get("source") ?? undefined;
  return handle(({ db, user, now }) => dischargePlacements(db, user, now, { source }));
}
