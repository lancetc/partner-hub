import { body, handle } from "@/server/http";
import { momentActivity, momentFeed } from "@/server/lifeMoments";

/** "Meanwhile, in their lives…": the Life Moments feed for the reader, best first. `?all=1` for every moment that's out, newest first. */
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return handle(({ db, user, now }) => momentFeed(db, user, now, { all }));
}

/** What the reader did with the feed: what was on screen, what they opened, played or read. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => momentActivity(db, user, await body<Record<string, unknown>>(req), now));
}
