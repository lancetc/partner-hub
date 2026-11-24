import { body, handle } from "@/server/http";
import {
  checkFamily,
  controlFamily,
  correctFamily,
  deleteFamily,
  draftFamilyNote,
  endFamily,
  familyState,
  familyStats,
  familyTurn,
  reportFamilySource,
  retryFamily,
  startFamily,
  submitFamily,
  viewedFamily,
} from "@/server/familyCall";

/**
  A Tough Family Call: the signed-in person's own attempt, never anyone else's. With ?stats=1, totals for the course's
  authors (counts, and levels only with five or more people).
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? familyStats(db, user, id) : familyState(db, user, id, q.get("block"), now)));
}

/** Start or resume, open a case-file section, send a turn, pause, switch text and voice, end, correct a spoken line, save or submit the note, view the debrief, retry, delete, or report a problem. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startFamily(db, user, id, input, now);
      case "check":
        return checkFamily(db, user, id, input, now);
      case "pause":
      case "resume":
      case "channel":
      case "cues":
        return controlFamily(db, user, id, input, now);
      case "end":
        return endFamily(db, user, id, input, now);
      case "correct":
        return correctFamily(db, user, id, input, now);
      case "note":
        return draftFamilyNote(db, user, id, input, now);
      case "submit":
        return submitFamily(db, user, id, input, now);
      case "viewed":
        return viewedFamily(db, user, id, input, now);
      case "retry":
        return retryFamily(db, user, id, input, now);
      case "delete":
        return deleteFamily(db, user, input);
      case "report":
        return reportFamilySource(db, user, id, input, now);
      default:
        return familyTurn(db, user, id, input, now);
    }
  });
}
