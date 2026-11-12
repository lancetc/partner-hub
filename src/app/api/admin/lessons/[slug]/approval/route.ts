import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { approvalFor, decide, publishApproved, submitForReview, withdraw } from "@/server/topicApproval";

/** Where the topic is in the approval process, and what the signed-in person can do. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/approval">) {
  const { slug } = await ctx.params;
  return handle(({ db, user, now }) => approvalFor(db, user, slug, now));
}

type Action =
  | { action: "submit"; reviewer: string; compliance?: boolean; note?: string }
  | { action: "decide"; decision: "approve" | "changes"; note?: string; compliance?: boolean }
  | { action: "withdraw" }
  | { action: "publish"; notes?: string; kind?: "minor" | "important" };

/** Submit for review, approve or ask for changes, withdraw, or publish the approved draft. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/approval">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<Action>(req);
    if (b.action === "submit") return submitForReview(db, user, slug, b, now);
    if (b.action === "decide") return decide(db, user, slug, b, now);
    if (b.action === "withdraw") return withdraw(db, user, slug, now);
    if (b.action === "publish") return publishApproved(db, user, slug, now, { notes: b.notes, kind: b.kind === "important" ? "important" : "minor" });
    throw new HttpError(400, "Unknown action.");
  });
}
