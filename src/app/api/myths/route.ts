import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { flagMyth, logMyth, tilesFor } from "@/server/myths";

/**
  Myth vs Reality tiles for learners: ?ids=a,b gives those tiles' current approved versions, in order (a course
  block); with no ids, every approved tile (the Resources page). ?preview=1 lets an author see drafts.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ids = q.get("ids");
  return handle(({ db, user, now }) =>
    tilesFor(db, user, ids ? ids.split(",").filter(Boolean).slice(0, 12) : null, now, { preview: q.get("preview") === "1" }),
  );
}

/** Record an open, a source open, practice or a copy (never a send), or flag a tile as useful or out of date. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "event") return logMyth(db, user, input, now);
    if (input.action === "flag") return flagMyth(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
