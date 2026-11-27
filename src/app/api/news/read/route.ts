import { body, handle } from "@/server/http";
import { markStoryRead } from "@/server/newsEdition";

/** A story was opened: the homepage stops featuring it to this person (server/newsEdition). `{ slug }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => markStoryRead(db, user, (await body<{ slug?: unknown }>(req)).slug, now));
}
