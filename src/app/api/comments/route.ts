import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteComment, hideComment, pinComment, postComment, readComments } from "@/server/cardComments";

/** Comments on a lesson card: `?lesson=&card=`. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    const lesson = q.get("lesson");
    const card = q.get("card");
    if (!lesson || !card) throw new HttpError(400, "Which card?");
    return readComments(db, user, lesson, card);
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "post"; lesson: string; card: string; text: string } | { action: "delete" | "hide" | "pin" | "unpin"; comment: number }>(
      req,
    );
    if (b.action === "post") return postComment(db, user, b.lesson, b.card, b.text, now);
    if (b.action === "delete") return deleteComment(db, user, Number(b.comment), now);
    if (b.action === "hide") return hideComment(db, user, Number(b.comment), now);
    if (b.action === "pin" || b.action === "unpin") return pinComment(db, user, Number(b.comment), b.action === "pin", now);
    throw new HttpError(400, "Unknown action.");
  });
}
