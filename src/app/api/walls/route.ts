import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { hidePost, likePost, postToWall, readWall } from "@/server/walls";

/** An insight wall: `?lesson=&card=`. Other people's posts only come back once you've posted. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    const lesson = q.get("lesson");
    const card = q.get("card");
    if (!lesson || !card) throw new HttpError(400, "Which wall?");
    return readWall(db, user, lesson, card);
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "post"; lesson: string; card: string; text: string } | { action: "like" | "unlike" | "hide"; post: number }>(req);
    if (b.action === "post") return postToWall(db, user, b.lesson, b.card, b.text, now);
    if (b.action === "like" || b.action === "unlike") return likePost(db, user, Number(b.post), b.action === "like");
    if (b.action === "hide") return hidePost(db, user, Number(b.post), now);
    throw new HttpError(400, "Unknown action.");
  });
}
