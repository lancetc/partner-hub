import { handle } from "@/server/http";
import { myRequiredTraining } from "@/server/complianceRegister";

/** The signed-in person's required training: each register topic, its status and when it needs refreshing. */
export async function GET() {
  return handle(({ db, user, now }) => ({ training: myRequiredTraining(db, user, now) }));
}
