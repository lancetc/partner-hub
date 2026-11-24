import { body, handle } from "@/server/http";
import { businessHome, getScenario, saveScenario } from "@/server/growthReadiness";

/*
  "Use my business" for the growth readiness block: a partner business's private scenarios. Every read and write
  checks, on the server, that the person is the business's owner or a member they've authorised, and that the
  scenario belongs to that business. GET with no id says whether this person has access (and lists their business's
  scenarios); with ?id= (and optionally &version=) it returns one.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("id") ? getScenario(db, user, q.get("id"), q.get("version")) : businessHome(db, user)));
}

/** Save a scenario: a new one (with a name) or the next version of one (with its id). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveScenario(db, user, await body<Record<string, unknown>>(req), now));
}
