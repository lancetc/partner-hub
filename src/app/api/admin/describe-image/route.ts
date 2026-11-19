import { body, handle } from "@/server/http";
import { describeImage } from "@/server/describeImage";

/** Describe with AI: a suggested description (alt text) for one picture on the Hub. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => describeImage(db, user, await body<{ src?: string; context?: string }>(req), now));
}
