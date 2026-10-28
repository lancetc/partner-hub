import { cookies } from "next/headers";
import { body, handle } from "@/server/http";
import { REVIEWER_COOKIE } from "@/server/reviewSession";
import { joinReview } from "@/server/reviews";

/** Someone opening a review link gives their name and email; their browser keeps who they are. */
export async function POST(req: Request, ctx: RouteContext<"/api/review/[token]/join">) {
  const { token } = await ctx.params;
  return handle(async ({ db, now }) => {
    const { id, name } = joinReview(db, token, await body<{ name: string; email: string }>(req), now);
    (await cookies()).set(REVIEWER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
    return { name };
  });
}

/** "Not you?": forget the reviewer in this browser, so someone else can join. */
export async function DELETE() {
  return handle(async () => {
    (await cookies()).delete(REVIEWER_COOKIE);
    return { ok: true };
  });
}
