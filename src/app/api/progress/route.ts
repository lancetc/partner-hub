import { body, handle } from "@/server/http";
import { readProgress, saveProgress } from "@/server/progress";

/** Your progress in every lesson, as saved from any of your devices. */
export async function GET() {
  return handle(({ db, user }) => ({ progress: readProgress(db, user) }));
}

/** Save where you're up to in one lesson. The newer save wins. */
export async function PUT(req: Request) {
  return handle(async ({ db, user }) => {
    const b = await body<{ slug: string; attempt: unknown; savedAt: string }>(req);
    return saveProgress(db, user, b.slug, b.attempt, b.savedAt);
  });
}
