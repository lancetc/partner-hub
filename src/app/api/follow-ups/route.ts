import { handle } from "@/server/http";
import { learnerFollowUps } from "@/server/learning";
import { spacedLearningOn } from "@/lib/features";

/** The signed-in person's follow ups. None while spaced learning is switched off (lib/features). */
export async function GET() {
  return handle(({ db, user, now }) => ({ items: spacedLearningOn() ? learnerFollowUps(db, user) : [], now: now.toISOString() }));
}
