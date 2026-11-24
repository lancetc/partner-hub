import { handle } from "@/server/http";
import { avaForLearners, avaVideoFor } from "@/server/ava";

/**
  Ava, the AI Learning Guide, as learners see her: her name and portrait (docs/ai-learning-guide.md). With ?key= (one of
  her lines, keyed like the narration), also her talking video for it, when one is ready and still matches.
*/
export async function GET(req: Request) {
  return handle(async ({ db }) => {
    const key = new URL(req.url).searchParams.get("key");
    return { ...avaForLearners(db), video: key ? await avaVideoFor(db, key) : null };
  });
}
