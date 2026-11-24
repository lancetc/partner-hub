import { body, handle } from "@/server/http";
import { logToolEvent, previewCoordinator, saveWorkbench, toolHome } from "@/server/shadowCoachTool";

/*
  The First 100 Days coaching workbench (docs/shadow-and-coach.md): demo data only. Every read and write checks, on the
  server, that the person is the business's owner or a member they've authorised (plannerAccess). GET says whether
  this person has access (and, if so, sends the demo and their business's latest saved version; ?version= for an
  earlier one); ?coordinator=<demo hire id> returns what that coordinator would see.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("coordinator") ? previewCoordinator(db, user, q.get("coordinator"), now) : toolHome(db, user, now, q.get("version")),
  );
}

/** Save the next version, or record one of the workbench's events. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "event" ? logToolEvent(db, user, input, now) : saveWorkbench(db, user, input, now);
  });
}
