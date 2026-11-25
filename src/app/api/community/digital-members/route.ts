import { handle } from "@/server/http";
import { digitalMembers } from "@/server/digitalMembers";
import { livesCards } from "@/server/livesInProgress";

/**
  The fictional people learners meet in training (Community → Digital Members): introductions and portraits, and for
  a Lives in Progress character their latest episode for this reader (docs/lives-in-progress.md).
*/
export async function GET() {
  return handle(({ db, user, now }) => {
    const out = digitalMembers(db, user, now);
    const stories = livesCards(db, user, now);
    return { ...out, members: out.members.map((m) => ({ ...m, story: stories.get(m.id) ?? null })) };
  });
}
