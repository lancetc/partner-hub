import { handle } from "@/server/http";
import { contentReview } from "@/server/contentReview";

/** What needs checking: overdue and due-soon lessons, cards and facts, learner reports and suggestions. */
export async function GET() {
  return handle(({ db, user, now }) => contentReview(db, user, now));
}
