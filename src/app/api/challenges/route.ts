import { handle } from "@/server/http";
import { myChallenges } from "@/server/challenges";

/** Challenges you're in: running, about to start, or recently finished. */
export async function GET() {
  return handle(({ db, user, now }) => ({ challenges: myChallenges(db, user, now) }));
}
