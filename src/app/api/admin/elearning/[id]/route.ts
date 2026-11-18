import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteCourse, setCourseStatus } from "@/server/elearning/service";

const ACTIONS = { publish: "published", unpublish: "draft" } as const;

/** Publish a course to learners, or take it back to draft. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action: keyof typeof ACTIONS }>(req);
    if (!(action in ACTIONS)) throw new HttpError(400, "Unknown action.");
    return setCourseStatus(db, user, id, ACTIONS[action], now);
  });
}

/** Delete a course: for good if no learner has tried it, otherwise removed with learners' records kept. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => deleteCourse(db, user, id, now));
}
