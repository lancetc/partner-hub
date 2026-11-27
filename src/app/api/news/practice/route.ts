import { body, handle } from "@/server/http";
import { tickPractice } from "@/server/storyGlance";

/** Ticks one of a story's "Put it into practice" actions off (or back on), for this person alone. `{ slug, itemId, done }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => tickPractice(db, user, await body<{ slug?: unknown; itemId?: unknown; done?: unknown }>(req), now));
}
