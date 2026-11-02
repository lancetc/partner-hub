import { cookies } from "next/headers";
import { body, handle } from "@/server/http";
import { REVIEWER_COOKIE } from "@/server/reviewSession";
import { addReviewer } from "@/server/reviews";
import { requirePathLink } from "@/server/pathReviews";

/** Someone opening a learning path's review link gives their name and email once, for every topic in it. */
export async function POST(req: Request, ctx: RouteContext<"/api/review/path/[token]/join">) {
  const { token } = await ctx.params;
  return handle(async ({ db, now }) => {
    requirePathLink(db, token);
    const { id, name } = addReviewer(db, await body<{ name: string; email: string }>(req), now);
    (await cookies()).set(REVIEWER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180 });
    return { name };
  });
}
