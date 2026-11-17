import { handle } from "@/server/http";
import { learnerCourses } from "@/server/elearning/service";

/** Published eLearning courses and how the signed-in learner is going on each. */
export async function GET() {
  return handle(({ db, user }) => learnerCourses(db, user));
}
