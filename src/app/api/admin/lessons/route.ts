import { body, handle } from "@/server/http";
import { requireReporter } from "@/server/auth";
import { spacedOverview } from "@/server/spaced";
import { GENERATION_MODEL, MAX_INSTRUCTIONS } from "@/server/generate";
import { createLesson, deletedLessons, editorLesson } from "@/server/authoredLessons";
import { aiDrafted, charactersAfterTopic } from "@/server/peopleInContent";
import { pathTopicOrder } from "@/server/learningPaths";
import type { Lesson } from "@/content/lessons";

export async function GET() {
  return handle(({ db, user }) => {
    requireReporter(user);
    return {
      lessons: spacedOverview(db),
      deleted: deletedLessons(db),
      paths: pathTopicOrder(db),
      generator: {
        model: GENERATION_MODEL,
        maxInstructions: MAX_INSTRUCTIONS,
        // Claude, or the Hub's OpenAI connection, which drafting falls back to.
        connected: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENAI_API_KEY),
      },
    };
  });
}

/**
  First save of a new lesson. Returns its slug, which comes from the title. A Topic Claude drafted brings its people
  into the character library straight away (server/peopleInContent), as publishing does.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const lesson = (await body<{ lesson: Lesson }>(req)).lesson;
    const made = createLesson(db, user, lesson, now);
    if (!aiDrafted(lesson)) return made;
    return { ...made, people: charactersAfterTopic(db, user, editorLesson(db, made.slug)?.lesson ?? lesson, now) };
  });
}
