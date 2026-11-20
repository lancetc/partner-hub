import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { approveTile, library, mythStats, openMythFlags, pauseTile, resolveMythFlag, saveTile } from "@/server/myths";

/** The tile library for authors: every tile with its live and draft versions, the open flags, and usage counts. */
export async function GET() {
  return handle(({ db, user, now }) => ({ ...library(db, user, now), flags: openMythFlags(db, user), stats: mythStats(db, user) }));
}

/** Save a draft (a new version when the tile is approved), approve it, pause or resume the live version, or resolve a flag. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    const id = typeof input.id === "string" ? input.id : "";
    if (input.action === "save") return { tile: saveTile(db, user, input, now) };
    if (input.action === "approve") {
      try {
        return { tile: approveTile(db, user, id, now) };
      } catch (e) {
        const problems = (e as { problems?: string[] }).problems;
        if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
        throw e;
      }
    }
    if (input.action === "pause") return { tile: pauseTile(db, user, id, true, input.reason, now) };
    if (input.action === "resume") return { tile: pauseTile(db, user, id, false, "", now) };
    if (input.action === "resolve") {
      resolveMythFlag(db, user, input.flagId, input.resolution, now);
      return { ok: true };
    }
    throw new HttpError(400, "Unknown action.");
  });
}
