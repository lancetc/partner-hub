import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { reportMismatch } from "@/server/onboarding";
import { askForHelp, myCourses, myEnrolment, savePrefs, seedDemoCourses } from "@/server/onboardingCourses";

/**
  Your starting courses (docs/onboarding.md, "Starting courses"): only ever the signed-in person's own. Reading it
  brings their assignments up to date first, which is safe to repeat: it never adds a duplicate.
*/
export async function GET(req: Request) {
  const enrolment = new URL(req.url).searchParams.get("enrolment");
  return handle(({ db, user, now }) => {
    seedDemoCourses(db, now);
    return enrolment ? myEnrolment(db, user, enrolment, now) : myCourses(db, user, now);
  });
}

/** Read or listen and text size, where they are in the first run, a request for help, or "This isn't my role". */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "prefs":
        return savePrefs(db, user, input, now);
      case "help":
        return askForHelp(db, user, input, now);
      case "mismatch":
        // The setup's own request: it goes to the population's owner and changes nothing by itself.
        reportMismatch(db, user, input, now);
        return myCourses(db, user, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
