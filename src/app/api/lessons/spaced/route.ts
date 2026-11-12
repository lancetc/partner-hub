import { handle } from "@/server/http";
import { spacedOverview } from "@/server/spaced";
import { spacedLearningOn } from "@/lib/features";

/**
  Which master lessons include spaced follow ups, and when they arrive. Safe for learners: no drafts.
  Nothing while spaced learning is switched off (lib/features), so learners see no mention of it.
*/
export async function GET() {
  return handle(({ db }) => {
    if (!spacedLearningOn()) return { signoff: [], lessons: {} };
    const live = spacedOverview(db).filter((l) => l.state === "live");
    return {
      /** Lessons that end with a manager confirming the learner is applying it at work. */
      signoff: live.filter((l) => l.signoff).map((l) => l.slug),
      lessons: Object.fromEntries(
        live
        .map((l) => [l.slug, l.variations.filter((v) => !v.variant).map((v, i) => ({ stage: v.stage === "Follow up" ? `Follow up ${i + 1}` : v.stage, gap: v.gap }))]),
      ),
    };
  });
}
