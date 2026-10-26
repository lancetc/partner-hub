import { body, handle } from "@/server/http";
import { requireReporter } from "@/server/auth";
import { spacedOverview } from "@/server/spaced";
import { GENERATION_MODEL, MAX_INSTRUCTIONS } from "@/server/generate";
import { createLesson, deletedLessons } from "@/server/authoredLessons";
import type { Lesson } from "@/content/lessons";

export async function GET() {
  return handle(({ db, user }) => {
    requireReporter(user);
    return {
      lessons: spacedOverview(db),
      deleted: deletedLessons(db),
      generator: {
        model: GENERATION_MODEL,
        maxInstructions: MAX_INSTRUCTIONS,
        connected: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      },
    };
  });
}

/** First save of a new lesson. Returns its slug, which comes from the title. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => createLesson(db, user, (await body<{ lesson: Lesson }>(req)).lesson, now));
}
