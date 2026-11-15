import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { lessons } from "@/content/lessons";
import { recordLessonCompletion } from "@/server/learning";
import { completionEvidence } from "@/lib/assessment";
import { mySampleLesson } from "@/server/sampleTopics";

/** Server-confirmed lesson completion. Enrols the learner in any follow up path it triggers. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { slug, version, evidence } = await body<{ slug: string; version: string; evidence?: unknown }>(req);
    if (!lessons.some((l) => l.slug === slug && l.version === version)) {
      // Their own sample topic from onboarding: finished, but it isn't training on record.
      if (typeof slug === "string" && mySampleLesson(db, user, slug)) return { completedAt: now.toISOString(), followUps: [] };
      throw new HttpError(404, "Unknown topic version.");
    }
    return recordLessonCompletion(db, user, { slug, version }, now, completionEvidence(evidence));
  });
}
