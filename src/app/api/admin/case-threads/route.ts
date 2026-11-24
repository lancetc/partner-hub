import { body, handle } from "@/server/http";
import { caseModeration, caseModerationAction, caseThreadInsights } from "@/server/caseThreads";

/** The one moderation queue for every case thread, whichever page a post came from (moderators only), or aggregate insights (?insights=1). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("insights") ? caseThreadInsights(db, user) : caseModeration(db, user, now)));
}

/** A moderator's decision on a post, comment, thread or verified contributor, with its reason. Every one is logged. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => caseModerationAction(db, user, await body<Record<string, unknown>>(req), now));
}
