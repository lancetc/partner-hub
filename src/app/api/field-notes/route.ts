import { body, handle } from "@/server/http";
import { fieldNotes, noteAction, openNote } from "@/server/living";

/** The signed-in person's Field Notes from Ava (docs/living-cases.md): the ones that have arrived and are theirs to open. */
export async function GET() {
  return handle(({ db, user, now }) => fieldNotes(db, user, now));
}

/** `open` marks a note read and says where it leads. `dismiss`, `snooze` and `restore` never touch a course or a completion. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "open" ? openNote(db, user, input.id, now) : noteAction(db, user, input, now);
  });
}
