import { handle, intParam } from "@/server/http";
import { HttpError } from "@/server/auth";
import { saveAttempt, type SaveInput } from "@/server/elearning/service";
import { MAX_SAVE_CHARS } from "@/server/elearning/runtime";

/**
  Saves what a course committed. Called by the Hub's player page with the learner's sign-in (never by
  course content), including by sendBeacon as the page closes, which sends the same JSON as text.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/elearning/attempts/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const text = await req.text();
    if (text.length > MAX_SAVE_CHARS) throw new HttpError(413, "That save is too large.");
    let input: SaveInput;
    try {
      input = JSON.parse(text) as SaveInput;
    } catch {
      throw new HttpError(400, "Expected a JSON body.");
    }
    return saveAttempt(db, user, intParam(id), input, now);
  });
}
