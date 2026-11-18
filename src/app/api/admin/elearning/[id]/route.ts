import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteCourse, setCoursePoster, setCourseStatus } from "@/server/elearning/service";

const ACTIONS = { publish: "published", unpublish: "draft" } as const;

/** Publish a course to learners, take it back to draft, or set its poster (null clears it). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action, poster } = await body<{ action: keyof typeof ACTIONS | "poster"; poster?: string | null }>(req);
    if (action === "poster") return setCoursePoster(db, user, id, poster ?? null, now);
    if (!(action in ACTIONS)) throw new HttpError(400, "Unknown action.");
    return setCourseStatus(db, user, id, ACTIONS[action], now);
  });
}

/** Delete a course: for good if no learner has tried it, otherwise removed with learners' records kept. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => deleteCourse(db, user, id, now));
}
