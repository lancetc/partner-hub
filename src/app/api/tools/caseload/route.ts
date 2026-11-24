import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import {
  accessList,
  comparePlans,
  duplicatePlan,
  plannerHome,
  plannerReport,
  recordPlannerEvent,
  savePlan,
  setAccess,
  setToolFavourite,
} from "@/server/caseloadPlanner";

/**
  The Caseload-to-Margin Work Tool (docs/caseload-margin-calculator.md). GET: the person's access, their business's
  plans and whether the tool is in their Favourites (?report=1 for authors: use counts only).
*/
export async function GET(req: Request) {
  const report = new URL(req.url).searchParams.get("report");
  return handle(({ db, user }) => (report ? plannerReport(db, user) : plannerHome(db, user)));
}

/**
  `action`: "save" (a new plan, or the next version of one), "duplicate", "compare", "access" (the owner's list),
  "grant" (the owner authorises or removes someone), "favourite", or "event" (a use event, never a figure). Every one
  is checked against the person's business on the server.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "save":
        return savePlan(db, user, input, now);
      case "duplicate":
        return duplicatePlan(db, user, input, now);
      case "compare":
        return comparePlans(db, user, input, now);
      case "access":
        return accessList(db, user);
      case "grant":
        return setAccess(db, user, input, now);
      case "favourite":
        return setToolFavourite(db, user, input.saved === true, now);
      case "event":
        return recordPlannerEvent(db, user, input, now);
    }
    throw new HttpError(400, "Unknown action.");
  });
}
