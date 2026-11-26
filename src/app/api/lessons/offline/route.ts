import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { canOpenTopic } from "@/server/catalogue";
import { lessonBySlug } from "@/content/lessons";
import { lessonAssets } from "@/lib/offlineAssets";
import { ttsConfig } from "@/server/tts";

/** What to save to make a lesson work offline: `?slug=`. Narration is included only when voices are set up. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  return handle(({ db, user }) => {
    const lesson = lessonBySlug(slug);
    // Only a topic this person may open (catalogue.canOpenTopic), as on the topic's own page.
    if (!lesson || !canOpenTopic(db, user, slug)) throw new HttpError(404, "Topic not found.");
    const { media, narration } = lessonAssets(lesson);
    return { slug, title: lesson.title, version: lesson.version, page: `/topics/${slug}`, media, narration: ttsConfig().configured ? narration : [] };
  });
}
