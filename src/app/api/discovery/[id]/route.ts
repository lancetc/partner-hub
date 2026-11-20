import { body, handle } from "@/server/http";
import { addStep, deletePath, openStep, readPath, removeStep, reorderSteps, updatePath, updateStep } from "@/server/discovery";

/** One of the person's own Discovery Paths. Anyone else's is a 404. */
export async function GET(_req: Request, ctx: RouteContext<"/api/discovery/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => readPath(db, user, id, now));
}

/** Rename, pause or archive; add, remove, reorder or mark a step; open a step; or delete the path. */
export async function POST(req: Request, ctx: RouteContext<"/api/discovery/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "add":
        return addStep(db, user, id, input, now);
      case "remove":
        return removeStep(db, user, id, input.stepId, now);
      case "reorder":
        return reorderSteps(db, user, id, input.order, now);
      case "step":
        return updateStep(db, user, id, input.stepId, input, now);
      case "open":
        return openStep(db, user, id, input.stepId, now);
      case "delete":
        return deletePath(db, user, id, now);
      default:
        return updatePath(db, user, id, input, now);
    }
  });
}
