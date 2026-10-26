import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { pendingSurveys, skipSurvey, submitSurvey } from "@/server/surveys";

/** Surveys waiting for the signed-in person. `?lesson=` limits it to ones that lesson just triggered. */
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get("lesson") ?? undefined;
  return handle(({ db, user }) => ({ pending: pendingSurveys(db, user, lesson) }));
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "submit" | "skip"; surveyId: string; target: { type: "path" | "lesson"; id: string }; answers?: Record<string, unknown> }>(req);
    if (!b.target || !["path", "lesson"].includes(b.target.type)) throw new HttpError(400, "Missing where the survey was asked.");
    if (b.action === "submit") return submitSurvey(db, user, b.surveyId, b.target, b.answers ?? {}, now);
    if (b.action === "skip") return skipSurvey(db, user, b.surveyId, b.target, now);
    throw new HttpError(400, "Unknown action.");
  });
}
