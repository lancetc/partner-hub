import { handle } from "@/server/http";
import { lessonsOverview, peopleOverview } from "@/server/completionReports";

/** Completion summaries by lesson and by person, for the viewer's organisation (or everyone, for authors). */
export async function GET() {
  return handle(({ db, user, now }) => ({ lessons: lessonsOverview(db, user), people: peopleOverview(db, user, now) }));
}
