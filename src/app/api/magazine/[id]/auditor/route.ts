import { body, handle } from "@/server/http";
import { answerVariant, auditorState, auditorStats, restartAuditor, saveAuditor, submitAuditor } from "@/server/auditor";

/** Document Auditor: the signed-in person's own work on a case. With ?stats=1, totals for the course's authors. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/auditor">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("stats") ? auditorStats(db, user, id) : auditorState(db, user, id, q.get("block"))));
}

/** Save marks, submit a decision, answer the changed fact, or try again. Nothing here approves a supplier or pays an invoice. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/auditor">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "submit") return submitAuditor(db, user, id, input, now);
    if (input.action === "variant") return answerVariant(db, user, id, input, now);
    if (input.action === "restart") return restartAuditor(db, user, id, input, now);
    return saveAuditor(db, user, id, input, now);
  });
}
