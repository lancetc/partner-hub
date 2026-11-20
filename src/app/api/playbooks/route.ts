import { handle } from "@/server/http";
import { playbookList } from "@/server/playbooks";

/** The playbooks the signed-in person's role may see, and which they've saved to their Shift Wallet. */
export async function GET() {
  return handle(({ db, user, now }) => playbookList(db, user, now));
}
