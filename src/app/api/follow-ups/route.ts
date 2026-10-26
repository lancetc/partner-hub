import { handle } from "@/server/http";
import { learnerFollowUps } from "@/server/learning";

export async function GET() {
  return handle(({ db, user, now }) => ({ items: learnerFollowUps(db, user), now: now.toISOString() }));
}
