import { handle } from "@/server/http";
import { allReviewComments } from "@/server/reviews";

/** Every review comment, by topic, for the admin Comments page. Authors only. */
export async function GET() {
  return handle(({ db, user }) => allReviewComments(db, user));
}
