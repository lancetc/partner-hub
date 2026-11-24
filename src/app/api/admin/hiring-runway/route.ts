import { handle } from "@/server/http";
import { hiringAdmin } from "@/server/hiringRunway";
import { plannerReport } from "@/server/caseloadPlanner";

/**
  For authors (docs/hiring-runway-lab.md): every published Hiring Runway lab with participation, rubric means and
  misconceptions over their denominator (suppressed under five people), and the private Work Tool's use counts (small
  numbers suppressed). Nothing identifies a partner business or carries its figures.
*/
export async function GET() {
  return handle(({ db, user, now }) => hiringAdmin(db, user, now, plannerReport(db, user)));
}
