import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { signalSummary } from "@/server/livingAssist";
import { signalDetail, signalList } from "@/server/signalRoom";

/**
  The Signal Room, for learning authors (docs/living-cases.md): verified themes, or one with ?theme=, read as
  evidence over time. Filters: from and to (months), source (a signal channel) and audience (the learners' role).
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const theme = q.get("theme");
    return theme
      ? signalDetail(db, user, theme, { from: q.get("from"), to: q.get("to"), source: q.get("source"), audience: q.get("audience") }, now)
      : signalList(db, user, now);
  });
}

/** `summarise` drafts a description of the figures on the page. Nothing is saved: recording a review is done on the Problem desk's own route. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "summarise") return signalSummary(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
