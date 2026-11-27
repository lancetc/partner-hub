import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { stories } from "@/content/stories";
import { briefingAction, briefingAdmin, newsBrief, questionAdmin, setQuestion } from "@/server/newsEdition";

/*
  The News admin's "This edition": this week's Trilogy Briefing (its script, drafted from the week's news, its recording
  and approval) and the weekly question. Authors only (server/newsEdition).
*/
export async function GET() {
  return handle(({ db, user, now }) => ({
    briefing: briefingAdmin(
      db,
      user,
      [...stories].sort((a, b) => b.date.localeCompare(a.date)),
      newsBrief(db, user, now),
      now,
    ),
    question: questionAdmin(db, user, now),
  }));
}

/** `{ area: "briefing", action: "save" | "record" | "approve" | "unapprove", script? }` or `{ area: "question", action: "set" | "close", question?, options? }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.area === "briefing") return briefingAction(db, user, input, now);
    if (input.area === "question") return setQuestion(db, user, input, now);
    throw new HttpError(400, "Unknown area.");
  });
}
