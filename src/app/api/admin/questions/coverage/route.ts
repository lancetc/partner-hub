import { handle } from "@/server/http";
import { coverage } from "@/server/questionPool";

/** Coverage: native questions by where they're used, what still needs attention, and imported SCORM packages. */
export async function GET() {
  return handle(({ db, user, now }) => coverage(db, user, now));
}
