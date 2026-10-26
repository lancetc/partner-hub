import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { rate, ratingResults } from "@/server/ratings";

/** Your rating for a rating card, and everyone's once you've rated: `?lesson=&card=`. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    const lesson = q.get("lesson");
    const card = q.get("card");
    if (!lesson || !card) throw new HttpError(400, "Which rating?");
    return ratingResults(db, user, lesson, card);
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ lesson: string; card: string; stars: number }>(req);
    return rate(db, user, b.lesson, b.card, Number(b.stars), now);
  });
}
