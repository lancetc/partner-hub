import { body, handle } from "@/server/http";
import { HttpError, userById } from "@/server/auth";
import { reportMismatch } from "@/server/onboarding";
import { askForHelp, chooseRole, myCourses, saveAbout, myEnrolment, savePrefs, seedDemoCourses } from "@/server/onboardingCourses";

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
      case "about":
        // Get to know you: their own answers about their background.
        return saveAbout(db, user, input, now);
      case "help":
        return askForHelp(db, user, input, now);
      case "role":
        // "Which best describes you?": takes effect now; an administrator keeps it or changes it back.
        // Their courses are read from the account as it is now, not as it was when the request came in.
        chooseRole(db, user, input, now);
        return myCourses(db, userById(db, user.id) ?? user, now);
      case "mismatch":
        // The setup's own request: it goes to the population's owner and changes nothing by itself.
        reportMismatch(db, user, input, now);
        return myCourses(db, user, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
