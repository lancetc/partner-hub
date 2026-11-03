import { cookies } from "next/headers";
import { body, handle } from "@/server/http";
import { reviewerOnTopic, REVIEWER_COOKIE } from "@/server/reviewSession";
import { addReviewer } from "@/server/reviews";

/** Someone commenting on a topic gives their name (email optional); their browser keeps who they are. */
export async function POST(req: Request, ctx: RouteContext<"/api/topic-review/[slug]/join">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    await reviewerOnTopic(db, user, slug);
    const { id, name } = addReviewer(db, await body<{ name: string; email?: string }>(req), now, { emailOptional: true });
    (await cookies()).set(REVIEWER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
    return { name };
  });
}

/** "Not you?": forget the reviewer in this browser, so someone else can add their name. */
export async function DELETE() {
  return handle(async () => {
    (await cookies()).delete(REVIEWER_COOKIE);
    return { ok: true };
  });
}
