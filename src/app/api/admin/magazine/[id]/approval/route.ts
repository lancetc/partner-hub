import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { approvalFor, decide, publishCourse, signOff, skipAiReview, submit, withdraw } from "@/server/magazineApproval";

/** Where the course is in its review, and what the signed-in person can do. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/approval">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => approvalFor(db, user, id));
}

type Action =
  | { action: "submit"; reviewer: string; compliance?: boolean; note?: string }
  | { action: "ai_skip"; note?: string }
  | { action: "signoff"; blockId: string; note?: string; remove?: boolean }
  | { action: "decide"; decision: "approve" | "changes"; note?: string; compliance?: boolean }
  | { action: "withdraw" }
  | { action: "publish"; summary?: string; moveLearners?: boolean; anyway?: boolean };

/** Submit, skip the AI pre-review, sign off a flagged item, approve or ask for changes, withdraw, or publish. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/approval">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<Action>(req);
    if (b.action === "submit") return submit(db, user, id, b, now);
    if (b.action === "ai_skip") return skipAiReview(db, user, id, b.note, now);
    if (b.action === "signoff") return signOff(db, user, id, b, now);
    if (b.action === "decide") return decide(db, user, id, b, now);
    if (b.action === "withdraw") return withdraw(db, user, id, now);
    if (b.action === "publish") {
      try {
        return publishCourse(db, user, id, b, now);
      } catch (e) {
        const problems = (e as { problems?: string[] }).problems;
        if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
        throw e;
      }
    }
    throw new HttpError(400, "Unknown action.");
  });
}
