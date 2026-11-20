import { body, handle } from "@/server/http";
import { moderation, setModeration } from "@/server/reset";

/** Which Community posts are withdrawn, and whether the signed-in person can moderate. */
export async function GET() {
  return handle(({ db, user }) => moderation(db, user));
}

/** Withdraw a Community post (from the feed and every lesson that uses it), or put it back. Authors only. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => setModeration(db, user, await body<Record<string, unknown>>(req), now));
}
