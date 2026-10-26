import { handle } from "@/server/http";
import { myLearningPaths } from "@/server/learningPaths";

/** The signed-in person's assigned learning paths. */
export async function GET() {
  return handle(({ db, user }) => ({ paths: myLearningPaths(db, user) }));
}
