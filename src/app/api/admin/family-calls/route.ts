import { body, handle } from "@/server/http";
import { familyCallsAdmin, resolveReview, reviewDetail } from "@/server/familyCall";

/**
  For authors and Quality: every published Tough Family Call with participation, aggregate levels (suppressed under five
  people), approved critical patterns, content health, the learning-to-work trace and the review queue. ?review=<attempt>
  opens one flagged attempt's evidence (audited).
*/
export async function GET(req: Request) {
  const review = new URL(req.url).searchParams.get("review");
  return handle(({ db, user, now }) => (review ? reviewDetail(db, user, review, now) : familyCallsAdmin(db, user, now)));
}

/** A reviewer settles a flagged assessed attempt: passed, not passed, or formative only. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => resolveReview(db, user, await body<Record<string, unknown>>(req), now));
}
