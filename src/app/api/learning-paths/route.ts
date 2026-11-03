import { handle } from "@/server/http";
import { myLearningPaths, startedLearningPaths } from "@/server/learningPaths";
import { quizOffer } from "@/server/pathQuiz";

/** The signed-in person's assigned learning paths, and with ?started=1 the ones they've begun on their own too. */
export async function GET(req: Request) {
  const started = new URL(req.url).searchParams.get("started") === "1";
  return handle(({ db, user }) => ({
    paths: [...myLearningPaths(db, user), ...(started ? startedLearningPaths(db, user) : [])].map((p) => ({ ...p, quiz: quizOffer(db, user, p.id) })),
  }));
}
