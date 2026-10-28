import { body, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import type { Lesson } from "@/content/lessons";
import { deleteLesson, discardDraft, lessonStatus, publishLesson, restoreLesson, restoreVersion, saveDraft } from "@/server/authoredLessons";

/** Where the draft stands, so an open editor can tell when the lesson was saved somewhere else. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/content">) {
  const { slug } = await ctx.params;
  return handle(({ db, user }) => {
    requireAuthor(user);
    return { status: lessonStatus(db, slug) };
  });
}

/** Save the editor's draft of a lesson. `base` is the save the editor started from (see saveDraft). */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/content">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { lesson, base } = await body<{ lesson: Lesson; base?: string | null }>(req);
    return saveDraft(db, user, slug, lesson, now, base);
  });
}

/** `publish` makes the saved draft live; `discard` throws away unpublished changes; `delete` hides the lesson; `restore` brings it back. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/lessons/[slug]/content">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action, notes, kind, version } = await body<{ action: string; notes?: string; kind?: "minor" | "important"; version?: string }>(req);
    if (action === "publish") return publishLesson(db, user, slug, now, { notes, kind });
    if (action === "restore_version" && version) return restoreVersion(db, user, slug, version, now);
    if (action === "discard") return discardDraft(db, user, slug, now);
    if (action === "delete") return deleteLesson(db, user, slug, now);
    if (action === "restore") return restoreLesson(db, user, slug, now);
    throw new HttpError(400, "Unknown action.");
  });
}
