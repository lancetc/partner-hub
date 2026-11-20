import { body, handle } from "@/server/http";
import { askForObservation, myCapabilities, requestCorrection } from "@/server/capability";

/** My Capabilities: the signed-in person's own evidence profile. No one else's is ever returned here. */
export async function GET() {
  return handle(({ db, user, now }) => myCapabilities(db, user, now));
}

/** Ask to be observed, or say a record is wrong or missing something. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "ask") return askForObservation(db, user, input.competencyId, now);
    return requestCorrection(db, user, input, now);
  });
}
