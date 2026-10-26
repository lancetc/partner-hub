import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { pollResults, vote } from "@/server/polls";

/** Results for a poll card: `?lesson=&card=`. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    const lesson = q.get("lesson");
    const card = q.get("card");
    if (!lesson || !card) throw new HttpError(400, "Which poll?");
    return pollResults(db, user, lesson, card);
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lesson: string; card: string; option: string }>(req);
    return vote(db, user, b.lesson, b.card, b.option, now);
  });
}
