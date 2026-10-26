import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { learnerWebinar, markWatched } from "@/server/webinars";

export async function GET(_req: Request, ctx: RouteContext<"/api/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => learnerWebinar(db, user, id));
}

/** Marks the recording watched for the signed-in person. */
export async function POST(req: Request, ctx: RouteContext<"/api/webinars/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action } = await body<{ action: "watched" }>(req);
    if (action !== "watched") throw new HttpError(400, "Unknown action.");
    return markWatched(db, user, id, now);
  });
}
