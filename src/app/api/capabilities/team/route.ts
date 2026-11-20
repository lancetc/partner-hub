import { body, handle } from "@/server/http";
import { personCapabilities, recordObservation, teamCapabilities, withdrawObservation } from "@/server/capability";

/** A manager's team: the people who report to them and what's waiting to be observed. With ?person=<id>, one person's record. */
export async function GET(req: Request) {
  const person = new URL(req.url).searchParams.get("person");
  return handle(({ db, user, now }) => (person ? personCapabilities(db, user, person, now) : teamCapabilities(db, user, now)));
}

/** Record an observation (sign off, or needs more practice), or withdraw one. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "withdraw") withdrawObservation(db, user, input.id, input.reason, now);
    else recordObservation(db, user, input, now);
    return teamCapabilities(db, user, now);
  });
}
