import { handle } from "@/server/http";
import { inboxCount } from "@/server/notifications";

/** The number on the Inbox icon in the header. */
export async function GET() {
  return handle(({ db, user, now }) => inboxCount(db, user, now));
}
