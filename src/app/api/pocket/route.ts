import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { drawerData, homePins, pinTool, pocketEvent, pocketSearch, reorderPins, saveTool, toolDetail, toolOpened } from "@/server/pocketPlaybook";

/**
  The Live Call Pocket Playbook (docs/pocket-playbook.md), for the signed-in person.
  GET: the Companion Drawer (no query), ?view=home for the pinned row, ?tool=<id> for one tool, ?q=<task> to search.
  The search phrase is answered and not kept.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    if (q.get("tool")) return toolDetail(db, user, q.get("tool"), now);
    if (q.has("q")) return pocketSearch(db, user, q.get("q"), now);
    if (q.get("view") === "home") return homePins(db, user, now);
    return drawerData(db, user, now);
  });
}

/**
  `pin` (`{ kind: "tool" | "job_aid", id, on }`), `save` (a Pocket tool, `{ id, on }`), `reorder` (`{ ids }`, favourite ids),
  `opened` (`{ id, place, key }`) and `event` (ids and counts only). No calculator value, search phrase or incident
  detail is read from any of them.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "pin":
        return pinTool(db, user, input, now);
      case "save":
        return saveTool(db, user, input, now);
      case "reorder":
        return reorderPins(db, user, input, now);
      case "opened":
        return toolOpened(db, user, input, now);
      case "event":
        return pocketEvent(db, user, input, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
