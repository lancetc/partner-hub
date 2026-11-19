import { body, handle } from "@/server/http";
import { practiceStats } from "@/server/magazinePractice";
import { draftPracticeItems } from "@/server/magazinePracticeDraft";

/** Self-review for authors: GET how each question is doing (totals only, no learner's answers). */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/practice">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => practiceStats(db, user, id));
}

/** POST { pageId, count }: questions drafted by AI from that page of the draft, for the author to check and approve. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/practice">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => ({ items: await draftPracticeItems(db, user, id, await body(req), now) }));
}
