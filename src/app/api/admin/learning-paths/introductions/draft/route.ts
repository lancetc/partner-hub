import { body, eventStream, handle } from "@/server/http";
import { requireAuthor } from "@/server/auth";
import { draftExciters } from "@/server/pathExciter";

/** AI drafts Discovery Exciters for several paths (confirmed), one at a time, streaming progress. `missingOnly` skips paths with a script. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const input = await body<{ pathIds?: unknown; confirmed?: unknown; missingOnly?: unknown; note?: unknown }>(req);
    return eventStream((send) => draftExciters(db, user, input, now, send));
  });
}
