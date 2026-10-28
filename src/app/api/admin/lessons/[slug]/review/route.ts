import { body, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { deleteReviewComment, postReviewComment, resolveReviewComment, reviewComments, reviewSharing, setReviewLink } from "@/server/reviews";

/** The editor's review: the lesson's review link, who has joined, and every comment. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/review">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => {
    requireAuthor(user);
    return { ...reviewSharing(db, user, slug), ...reviewComments(db, { kind: "author", user }, slug) };
  });
}

type Action =
  | { action: "link"; on: boolean }
  | { action: "post"; card: string; text: string; parent?: number }
  | { action: "delete"; comment: number }
  | { action: "resolve" | "reopen"; comment: number };

export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/review">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const b = await body<Action>(req);
    const who = { kind: "author" as const, user };
    if (b.action === "link") setReviewLink(db, user, slug, Boolean(b.on), now);
    else if (b.action === "post") postReviewComment(db, who, slug, b, now);
    else if (b.action === "delete") deleteReviewComment(db, who, slug, Number(b.comment), now);
    else if (b.action === "resolve" || b.action === "reopen") resolveReviewComment(db, user, slug, Number(b.comment), b.action === "resolve", now);
    else throw new HttpError(400, "Unknown action.");
    return { ...reviewSharing(db, user, slug), ...reviewComments(db, who, slug) };
  });
}
