import { body, handle } from "@/server/http";
import { reviewerOnLink } from "@/server/reviewSession";
import { deleteReviewComment, postReviewComment, reviewComments } from "@/server/reviews";
import { HttpError } from "@/server/auth";

/** Review comments on the lesson a review link opens, for someone who has joined the review. */
export async function GET(_req: Request, ctx: RouteContext<"/api/review/[token]">) {
  const { token } = await ctx.params;
  return handle(async ({ db, user }) => {
    const { slug, who } = await reviewerOnLink(db, user, token);
    return reviewComments(db, who, slug);
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/review/[token]">) {
  const { token } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { slug, who } = await reviewerOnLink(db, user, token);
    const b = await body<{ action: "post"; card: string; text: string; parent?: number } | { action: "delete"; comment: number }>(req);
    if (b.action === "post") return postReviewComment(db, who, slug, b, now);
    if (b.action === "delete") return deleteReviewComment(db, who, slug, Number(b.comment), now);
    throw new HttpError(400, "Unknown action.");
  });
}
