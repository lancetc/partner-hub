import "server-only";
import { lessons } from "@/content/lessons";
import { ALIS_COURSE, ALIS_MODULES, ALIS_PARTS, ALIS_PATH_QUIZ, moduleNumber } from "@/content/alisCourse";
import { buildGuideDoc, buildTopic } from "@/lib/alisBuild";
import type { Db } from "./db";
import type { User } from "./auth";
import { createLesson, editorLesson, restoreLesson, saveDraft } from "./authoredLessons";
import { archiveLearningPath, createLearningPath, updateLearningPath, type PathInput } from "./learningPaths";
import { createGuide, saveGuideDraft } from "./magazine";

/*
  Creates or updates the ALIS course from content/alisCourse.ts (docs/alis-course.md), through the Hub's own server
  functions, as drafts. Run by scripts/build-alis.ts:

  - 19 short-form Topics at stable slugs;
  - three Discovery Paths, one per part, each with a 5-question, 100% path quiz drawn across its Topics;
  - one long-form Magazine course in three chapters, each chapter ending in its part's path quiz.

  Running it again updates the drafts and creates nothing twice: Topics are found by slug, paths by name, the Magazine
  course by slug. It also archives what the first version of the course made and no longer uses (a single path in three
  chapters, and a check path per module). Nothing is published.
*/

export const ALIS_GUIDE_SLUG = "aged-care-learning-information-solution-alis";

/** Paths from the first version of the course, archived when found. */
export const ALIS_RETIRED_PATHS = [ALIS_COURSE.title, ...ALIS_MODULES.map((m) => `ALIS check ${moduleNumber(m)}: ${m.title}`)];

const pathIdByName = (db: Db, name: string) =>
  (db.prepare("SELECT id FROM learning_paths WHERE name = ? AND archived = 0 ORDER BY created_at LIMIT 1").get(name) as { id: string } | undefined)?.id;

function savePath(db: Db, actor: User, input: PathInput, now: Date) {
  const id = pathIdByName(db, input.name);
  if (id) {
    updateLearningPath(db, actor, id, input, now);
    return { id, created: false };
  }
  return { id: createLearningPath(db, actor, input, now).id, created: true };
}

export function buildAlis(db: Db, actor: User, now: Date) {
  // 1. The Topics, at their stable slugs. createLesson takes its address from the title, so a new Topic is created
  // under a title that spells its slug, then saved with its real content.
  const topics = ALIS_MODULES.map((m) => {
    if (lessons.some((l) => l.slug === m.slug && l.track !== "reinforcement") && !editorLesson(db, m.slug))
      throw new Error(`A built-in topic already uses the slug ${m.slug}.`);
    const row = db.prepare("SELECT deleted_at FROM authored_lessons WHERE slug = ?").get(m.slug) as { deleted_at: string | null } | undefined;
    let created = false;
    if (!row) {
      const made = createLesson(db, actor, { ...buildTopic(m), title: m.slug.replace(/-/g, " ") }, now);
      if (made.slug !== m.slug) throw new Error(`Expected the topic at ${m.slug}, but it was created at ${made.slug}.`);
      created = true;
    } else if (row.deleted_at) restoreLesson(db, actor, m.slug, now);
    const version = editorLesson(db, m.slug)?.lesson.version ?? "0.1";
    saveDraft(db, actor, m.slug, buildTopic(m, version), now);
    return { slug: m.slug, created };
  });

  // 2. Archive the first version's paths. Before the new ones are saved, so a Topic is never in two live ALIS paths.
  const archived = ALIS_RETIRED_PATHS.flatMap((name) => {
    const id = pathIdByName(db, name);
    if (!id) return [];
    archiveLearningPath(db, actor, id, now);
    return [id];
  });

  // 3. A Discovery Path per part: its Topics in order, and its path quiz.
  const paths = ALIS_PARTS.map((p) => ({
    part: p.n,
    title: p.title,
    ...savePath(
      db,
      actor,
      {
        name: p.title,
        // Ava's spoken introduction on the path page (and its text there).
        description: p.intro,
        audience: "Everyone supporting older people at home",
        inOrder: true,
        whoFor: p.whoFor,
        whoPhoto: p.cover.src,
        outcomes: p.outcomes,
        quiz: ALIS_PATH_QUIZ,
        lessons: ALIS_MODULES.filter((m) => m.part === p.n).map((m) => m.slug),
      },
      now,
    ),
  }));

  // 4. The one Magazine course, in three chapters, each ending in its part's path quiz.
  const input = {
    title: ALIS_COURSE.title,
    standfirst: ALIS_COURSE.standfirst,
    cover: ALIS_PARTS[0].cover.src,
    audience: ["staff", "coordinator"],
    completion: "assessed",
    doc: buildGuideDoc(ALIS_MODULES, Object.fromEntries(paths.map((p) => [p.part, p.id]))),
  };
  const existing = db.prepare("SELECT id FROM magazine_guides WHERE slug = ? AND status != 'archived'").get(ALIS_GUIDE_SLUG) as { id: string } | undefined;
  const guide = existing ? saveGuideDraft(db, actor, existing.id, input, now) : createGuide(db, actor, input, now);
  if (!existing && guide.slug !== ALIS_GUIDE_SLUG) throw new Error(`Expected the Magazine course at ${ALIS_GUIDE_SLUG}, but it was created at ${guide.slug}.`);

  return { topics, paths, archived, guide: { id: guide.id, slug: guide.slug, created: !existing } };
}
