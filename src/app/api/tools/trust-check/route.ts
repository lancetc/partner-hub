import { body, handle } from "@/server/http";
import { getBoard, logToolEvent, saveBoard, toolHome } from "@/server/trustTool";

/*
  The 28-Day Trust Check Work Tool (docs/trust-check.md): demo data only. Every read and write checks, on the server,
  that the person is the business's owner or a member they've authorised (plannerAccess), and that a board belongs to
  that business. GET with no id says whether this person has access (and, if so, sends the demo and their business's
  boards); with ?id= (and optionally &version=) it returns one board.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("id") ? getBoard(db, user, q.get("id"), q.get("version")) : toolHome(db, user)));
}

/** Save a board (a new one with a name, or the next version with its id), or record one of the tool's events. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "event" ? logToolEvent(db, user, input, now) : saveBoard(db, user, input, now);
  });
}
