import { body, handle } from "@/server/http";
import {
  answerFollowUp,
  answerVariant,
  auditorState,
  auditorStats,
  restartAuditor,
  saveAuditor,
  signalAuditor,
  submitAuditor,
  viewedAuditor,
} from "@/server/auditor";

/** Document Auditor and Contractor Vetting Card: the signed-in person's own work on a case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/auditor">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("stats") ? auditorStats(db, user, id) : auditorState(db, user, id, q.get("block"), now)));
}

/**
  Save marks, submit a decision (a resent submit returns it unchanged), record that the debrief was viewed, answer the
  changed fact, the corrected pack or the renewal, record what was opened or checked, or try again. Nothing here
  approves a supplier, agrees a price or pays an invoice.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/auditor">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "submit") return submitAuditor(db, user, id, input, now);
    if (input.action === "viewed") return viewedAuditor(db, user, id, input, now);
    if (input.action === "variant") return answerVariant(db, user, id, input, now);
    if (input.action === "followup") return answerFollowUp(db, user, id, input, now);
    if (input.action === "signal") return signalAuditor(db, user, id, input, now);
    if (input.action === "restart") return restartAuditor(db, user, id, input, now);
    return saveAuditor(db, user, id, input, now);
  });
}
