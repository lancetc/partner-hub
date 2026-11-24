import { body, handle } from "@/server/http";
import { moveShadow, retryShadow, shadowState, shadowStats, startShadow, submitShadow, viewedShadow } from "@/server/shadowCoach";

/**
  First 100 Days: Shadow & Coach (docs/shadow-and-coach.md): the signed-in person's own attempts at the fictional
  episodes. ?block= lists each episode's status; &scenario= adds that episode's attempt. With ?stats=1, totals for
  authors (counts only under five people). Nothing here reads or writes a real employee, participant or QA record.
*/
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("stats") ? shadowStats(db, user, id) : shadowState(db, user, id, q.get("block"), q.get("scenario"), now, { embed: q.get("embed") === "1" }),
  );
}

/** Start or resume an episode, make a move, submit, note the debrief viewed, or try again. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startShadow(db, user, id, input, now);
      case "submit":
        return submitShadow(db, user, id, input, now);
      case "viewed":
        return viewedShadow(db, user, id, input, now);
      case "retry":
        return retryShadow(db, user, id, input, now);
      default:
        return moveShadow(db, user, id, input, now);
    }
  });
}
