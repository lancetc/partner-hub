import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { benchmarkResults, benchmarkState, benchmarkStats, lockBenchmark, reflectBenchmark } from "@/server/benchmark";

/**
  Peer benchmark poll: the signed-in person's own decision. With ?results=1, the latest disclosure-checked batch
  (only once they've locked). With ?stats=1, the same aggregate for the course's authors.
*/
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/benchmark">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("stats")
      ? benchmarkStats(db, user, id, q.get("block"), now)
      : q.get("results")
        ? benchmarkResults(db, user, id, q.get("block"), now)
        : benchmarkState(db, user, id, q.get("block"), now),
  );
}

/** Lock a first decision (once per version), or save the private reflection. Nothing here contacts anyone. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/benchmark">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "lock") return lockBenchmark(db, user, id, input, now);
    if (input.action === "reflect") return reflectBenchmark(db, user, id, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
