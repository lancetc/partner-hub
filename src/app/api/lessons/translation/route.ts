import { handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { lessonBySlug } from "@/content/lessons";
import { isLanguage } from "@/lib/languages";
import { lessonIn } from "@/server/lessonTranslations";
import { canOpenTopic } from "@/server/catalogue";

/** Where a lesson's translation is up to: `?slug=&lang=`. Starts one if there isn't one yet. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const lesson = lessonBySlug(q.get("slug") ?? "");
    const lang = q.get("lang");
    // Only a topic this person may open (catalogue.canOpenTopic), as on the topic's own page.
    if (!lesson || !canOpenTopic(db, user, lesson.slug)) throw new HttpError(404, "Topic not found.");
    if (!isLanguage(lang) || lang === "en") throw new HttpError(400, "Which language?");
    const t = lessonIn(db, lesson, lang, now);
    return t.state === "ready" ? { state: "ready" } : t;
  });
}
