import { body, handle } from "@/server/http";
import { businessHome, getPlan, savePlan } from "@/server/cashBridge";

/*
  "Plan my next 90 days" for the 90-Day Cash Bridge block: a partner business's private 90-Day Cash Plans. Every read
  and write checks, on the server, that the person is the business's owner or a member they've authorised, and that
  the plan belongs to that business; reads and saves are recorded. GET with no id says whether this person has access
  (and lists their business's plans); with ?id= (and optionally &version=) it returns one.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("id") ? getPlan(db, user, q.get("id"), q.get("version"), now) : businessHome(db, user)));
}

/** Save a 90-Day Cash Plan: a new one (with a name) or the next version of one (with its id). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => savePlan(db, user, await body<Record<string, unknown>>(req), now));
}
