import { handle } from "@/server/http";
import { digitalMembers } from "@/server/digitalMembers";

/** The fictional people learners meet in training (Community → Digital Members): introductions and portraits only. */
export async function GET() {
  return handle(({ db, user, now }) => digitalMembers(db, user, now));
}
