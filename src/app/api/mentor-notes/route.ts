import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { myNoteAction, myNotes, noteUse, pocketDeck, saveMyNote, toggleHelpful, toggleSave } from "@/server/notes";

/** Pocket Deck (?pocket=1) or the signed-in person's own contributions (?mine=1). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("mine") ? myNotes(db, user, now) : pocketDeck(db, user, now)));
}

/** Helpful, save, copy or discussion on a card; or the contributor's own note: save a draft, submit, approve or decline edits, withdraw. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "helpful") return toggleHelpful(db, user, input, now);
    if (input.action === "save") return toggleSave(db, user, input, now);
    if (input.action === "use") return noteUse(db, user, input, now);
    if (input.action === "draft") return saveMyNote(db, user, input, now);
    if (["submit", "approve-edits", "decline-edits", "withdraw"].includes(input.action as string)) {
      try {
        return myNoteAction(db, user, input, now);
      } catch (e) {
        const problems = (e as { problems?: string[] }).problems;
        if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
        throw e;
      }
    }
    throw new HttpError(400, "Unknown action.");
  });
}
