import { body, handle } from "@/server/http";
import { recordLivingEvent, returnFor } from "@/server/living";

/**
  For a learner on a Magazine page (docs/living-cases.md): what opens it if it is a return episode (?guide=&page=),
  or null. With preview=1 an author sees their working copy, and prior= shows the line for one earlier choice.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => ({
    opening: returnFor(db, user, { guide: q.get("guide"), page: q.get("page"), preview: q.get("preview") === "1", prior: q.get("prior") ?? undefined }, now),
  }));
}

/** A return opened, the person's story followed, the transfer activity reached. Each is counted once. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordLivingEvent(db, user, await body<Record<string, unknown>>(req), now));
}
