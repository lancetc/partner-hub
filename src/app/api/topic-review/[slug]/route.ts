import { body, handle } from "@/server/http";
import { reviewerOnTopic } from "@/server/reviewSession";
import { deleteReviewComment, postReviewComment, reviewComments } from "@/server/reviews";
import { HttpError } from "@/server/auth";

/*
  Review comments on a topic opened straight from the hub, not through a review link. Until
  someone gives their name, `me` is empty and the panel asks for it.
*/
export async function GET(_req: Request, ctx: RouteContext<"/api/topic-review/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user }) => {
    const { who } = await reviewerOnTopic(db, user, slug);
    return who ? reviewComments(db, who, slug) : { comments: [], canResolve: false, me: "" };
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/topic-review/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { who } = await reviewerOnTopic(db, user, slug);
    if (!who) throw new HttpError(401, "Add your name first, so the author knows who the comment is from.");
    const b = await body<{ action: "post"; card: string; text: string; parent?: number } | { action: "delete"; comment: number }>(req);
    if (b.action === "post") return postReviewComment(db, who, slug, b, now);
    if (b.action === "delete") return deleteReviewComment(db, who, slug, Number(b.comment), now);
    throw new HttpError(400, "Unknown action.");
  });
}
