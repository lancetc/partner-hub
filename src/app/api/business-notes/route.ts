import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { businessAction, businessCard, businessDeck, businessSpace, contributeAction, myBusinessNotes } from "@/server/businessNotes";

/**
  Care Partner Business Field Notes (docs/business-field-notes.md), for verified principals only: anyone else gets
  "not found" from every request here.

  GET: the deck (?q=&collection=&theme=&stage=&tool=&model=), one card in full (?id=, with ?v= from an old link),
  the Community space (?space=1), or the signed-in principal's own contributions (?mine=1).
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    if (q.get("id")) return businessCard(db, user, q.get("id"), now, q.get("v"));
    if (q.get("space")) return businessSpace(db, user, now);
    if (q.get("mine")) return myBusinessNotes(db, user, now);
    return businessDeck(
      db,
      user,
      { q: q.get("q"), collection: q.get("collection"), theme: q.get("theme"), stage: q.get("stage"), tool: q.get("tool"), model: q.get("model") },
      now,
    );
  });
}

const CONTRIBUTE = ["draft", "submit", "approve-edits", "decline-edits", "consent", "withdraw", "chapter", "chapter-approve"];

/** A reader's action on a card (`noteId`), or a contributor's on their own note (`contribute: true`). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.contribute === true) {
      if (!CONTRIBUTE.includes(input.action as string)) throw new HttpError(400, "Unknown action.");
      try {
        return contributeAction(db, user, input, now);
      } catch (e) {
        const problems = (e as { problems?: string[] }).problems;
        if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
        throw e;
      }
    }
    return businessAction(db, user, input, now);
  });
}
