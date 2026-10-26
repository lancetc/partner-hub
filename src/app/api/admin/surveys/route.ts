import { body, handle } from "@/server/http";
import { createSurvey, listSurveys, type SurveyInput } from "@/server/surveys";

export async function GET() {
  return handle(({ db, user }) => ({ surveys: listSurveys(db, user) }));
}

/** New survey, from the module feedback template or blank. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => createSurvey(db, user, await body<Partial<SurveyInput> & { template?: "module" | "blank" }>(req), now));
}
