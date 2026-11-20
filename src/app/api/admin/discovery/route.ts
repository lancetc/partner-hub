import { body, handle } from "@/server/http";
import { discoveryGaps, handleRequest } from "@/server/discovery";

/** Discovery gaps, for content owners: what learners look for and don't find, and the topics they've asked for. */
export async function GET() {
  return handle(({ db, user, now }) => discoveryGaps(db, user, now));
}

/** Move a topic request on, record what was done, or tidy its wording. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return handleRequest(db, user, input.id, input, now);
  });
}
