import { handle } from "@/server/http";
import { lessonsOverview, pathsOverview, peopleOverview } from "@/server/completionReports";

/** Completion summaries by topic, by learning path and by person, for the viewer's organisation (or everyone, for authors). */
export async function GET() {
  return handle(({ db, user, now }) => ({ lessons: lessonsOverview(db, user), paths: pathsOverview(db, user, now), people: peopleOverview(db, user, now) }));
}
