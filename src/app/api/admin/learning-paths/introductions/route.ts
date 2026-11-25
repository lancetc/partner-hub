import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { approveExciterScripts, exciterManager, exciterStats, queueExciterAudio } from "@/server/pathExciter";

/** The Discovery Path Introduction Manager: every live path's Exciter, the recording price to estimate from, and listening totals. */
export async function GET() {
  return handle(({ db, user }) => ({ ...exciterManager(db, user), stats: exciterStats(db, user) }));
}

/** Bulk actions, each confirmed: approve scripts, or generate (or regenerate) audio for approved scripts. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<{ action?: string; pathIds?: unknown; confirmed?: unknown; fresh?: unknown }>(req);
    if (input.action === "approve-scripts") return approveExciterScripts(db, user, input, now);
    if (input.action === "queue-audio") return queueExciterAudio(db, user, input.pathIds, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
