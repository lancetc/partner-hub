import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { markNarrationJobsAttached, narrationJobs, queueNarrationAudio, retryNarrationJob } from "@/server/narrationJobs";

/** The course's Audio Introduction recordings: queued, running, done or failed, newest first, with who records and the price to estimate from. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/narration/jobs">) {
  const { id } = await ctx.params;
  const voice = new URL(req.url).searchParams.get("voice") ?? undefined;
  return handle(({ db, user }) => narrationJobs(db, user, id, voice));
}

/** Queue audio for approved scripts (several at once needs `confirmed`), try a failed recording again, or note recordings the editor has attached. Recording happens in the background. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]/narration/jobs">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ action?: string; items?: unknown; voice?: unknown; confirmed?: unknown; fresh?: unknown; jobId?: unknown; jobIds?: unknown }>(
      req,
    );
    if (input.action === "queue") return queueNarrationAudio(db, user, id, input, now);
    if (input.action === "retry") return retryNarrationJob(db, user, id, input.jobId, now);
    if (input.action === "attached") return markNarrationJobsAttached(db, user, id, input.jobIds, now);
    throw new HttpError(400, "Unknown action.");
  });
}
