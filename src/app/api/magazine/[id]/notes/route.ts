import { body, handle } from "@/server/http";
import { deleteNote, myNotes, perspectivesOpened, saveNote, setActionStatus } from "@/server/magazineNotes";

/** My Notes: the learner's own journal entries and action notes in this course. No one else's are ever returned. */
export async function GET(_req: Request, ctx: RouteContext<"/api/magazine/[id]/notes">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => myNotes(db, user, id));
}

/** Save a note, a pulse answer or how an action went; delete a note; or record that perspectives were opened. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/notes">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "delete") return deleteNote(db, user, id, input.blockId, now);
    if (input.action === "status") return { note: setActionStatus(db, user, id, input, now) };
    if (input.action === "perspectives") return perspectivesOpened(db, user, id, input, now);
    return { note: saveNote(db, user, id, input, now) };
  });
}
