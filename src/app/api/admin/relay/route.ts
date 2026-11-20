import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { relayOutlook, relaySettings, saveRelaySettings } from "@/server/relay";
import { createRelayPilot, draftRelay, relayReport } from "@/server/relayAdmin";
import { relayChoices } from "@/server/story";
import { requireAuthor } from "@/server/auth";

/**
  Ava Relay for authors and administrators. GET ?view=choices (approved people and episodes), ?view=outlook&guide=&page=
  (what Ava would be told on a page of the saved draft), ?view=report&guide=&revision=&from=&to=, or ?view=settings.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    requireAuthor(user);
    const view = q.get("view");
    if (view === "choices") return relayChoices(db, user, now);
    if (view === "outlook") return relayOutlook(db, user, q.get("guide") ?? "", q.get("page") ?? "", now);
    if (view === "report") return relayReport(db, user, { guide: q.get("guide"), revision: q.get("revision"), from: q.get("from"), to: q.get("to") }, now);
    if (view === "settings") return relaySettings(db);
    throw new HttpError(400, "Unknown view.");
  });
}

/** `{ action: "draft", guideId, pageId }` (an AI proposal), `{ action: "pilot" }` (the pilot course, as a draft), `{ action: "settings", … }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "draft") return draftRelay(db, user, String(input.guideId ?? ""), String(input.pageId ?? ""), now);
    if (input.action === "pilot") return createRelayPilot(db, user, now);
    if (input.action === "settings") return saveRelaySettings(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
