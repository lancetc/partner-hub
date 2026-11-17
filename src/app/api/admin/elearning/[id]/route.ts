import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { setCourseStatus } from "@/server/elearning/service";

const ACTIONS = { publish: "published", unpublish: "draft", archive: "archived" } as const;

/** Publish a course to learners, take it back to draft, or archive it. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/elearning/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action: keyof typeof ACTIONS }>(req);
    if (!(action in ACTIONS)) throw new HttpError(400, "Unknown action.");
    return setCourseStatus(db, user, id, ACTIONS[action], now);
  });
}
