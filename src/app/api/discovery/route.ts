import { body, handle } from "@/server/http";
import { createPath, itemInPaths, myDiscovery, requestTopic, suggest } from "@/server/discovery";

/**
  My Discovery: the signed-in person's own Discovery Paths and topic requests. With ?item=<key>, whether
  that Topic or Magazine page can be saved, and which of their paths already have it.
*/
export async function GET(req: Request) {
  const item = new URL(req.url).searchParams.get("item");
  return handle(({ db, user, now }) => (item ? itemInPaths(db, user, item) : myDiscovery(db, user, now)));
}

/** Suggest a route for a goal, make a path (empty, from one item, or from a suggestion), or ask for a missing topic. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "suggest") return suggest(db, user, input, now);
    if (input.action === "request") return requestTopic(db, user, input, now);
    return createPath(db, user, input, now);
  });
}
