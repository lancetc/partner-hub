import { handle } from "@/server/http";
import { learnerPath } from "@/server/learningPaths";
import { quizOffer } from "@/server/pathQuiz";
import { learnerExciter } from "@/server/pathExciter";

/**
  One learning path with the signed-in person's progress (where its QR code leads), its upfront quiz if it has one, and
  its approved Discovery Exciter (null until one is approved: the page then shows no player).
*/
export async function GET(_req: Request, ctx: RouteContext<"/api/paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => ({ ...learnerPath(db, user, id), quiz: quizOffer(db, user, id), exciter: learnerExciter(db, id) }));
}
