import { handle } from "@/server/http";
import { playbookList } from "@/server/playbooks";
import { aidsForTopic } from "@/server/favourites";

/** The playbooks the signed-in person's role may see, and which they've saved to their Shift Wallet. */
export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get("topic");
  // With ?topic=, the Job Aids placed on that Topic's cards.
  return handle(({ db, user, now }) => (topic ? aidsForTopic(db, user, topic, now) : playbookList(db, user, now)));
}
