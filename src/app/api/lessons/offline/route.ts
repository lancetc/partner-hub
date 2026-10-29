import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { lessonBySlug } from "@/content/lessons";
import { lessonAssets } from "@/lib/offlineAssets";
import { ttsConfig } from "@/server/tts";

/** What to save to make a lesson work offline: `?slug=`. Narration is included only when voices are set up. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  return handle(() => {
    const lesson = lessonBySlug(slug);
    if (!lesson) throw new HttpError(404, "Topic not found.");
    const { media, narration } = lessonAssets(lesson);
    return { slug, title: lesson.title, version: lesson.version, page: `/learning/${slug}`, media, narration: ttsConfig().apiKey ? narration : [] };
  });
}
