import { handle } from "@/server/http";
import { budgetLabPlacements } from "@/server/budgetLab";

/** For the Topic editor (authors only): the published Quarterly Budget Decision Labs a card can place by reference. */
export async function GET() {
  return handle(({ db, user, now }) => budgetLabPlacements(db, user, now));
}
