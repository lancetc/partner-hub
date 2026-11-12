import { handle } from "@/server/http";
import { approvalQueue } from "@/server/topicApproval";

/** The Approvals page: what's waiting on the signed-in person, everything in progress, and topics due a refresh. */
export async function GET() {
  return handle(({ db, user, now }) => approvalQueue(db, user, now));
}
