import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { deleteCourse, setCourseDetails, setCoursePoster, setCourseStatus } from "@/server/elearning/service";

const ACTIONS = { publish: "published", unpublish: "draft" } as const;

/** Publish a course to learners, take it back to draft, name it ("details"), or set its poster (null clears it). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action, poster, title, description } = await body<{
      action: keyof typeof ACTIONS | "poster" | "details";
      poster?: string | null;
      title?: string;
      description?: string;
    }>(req);
    if (action === "poster") return setCoursePoster(db, user, id, poster ?? null, now);
    if (action === "details") return setCourseDetails(db, user, id, { title, description }, now);
    if (!(action in ACTIONS)) throw new HttpError(400, "Unknown action.");
    return setCourseStatus(db, user, id, ACTIONS[action], now);
  });
}

/** Delete a course: for good if no learner has tried it, otherwise removed with learners' records kept. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => deleteCourse(db, user, id, now));
}
