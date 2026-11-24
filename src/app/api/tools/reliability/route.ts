import { body, handle } from "@/server/http";
import { businessHome, getSheet, saveSheet } from "@/server/serviceReliability";

/*
  "Review my service reliability" for the Service Reliability Calculator block: a partner business's private
  Reliability Decision Sheets. Every read and write checks, on the server, that the person is the business's owner or
  a member they've authorised, and that the sheet belongs to that business. GET with no id says whether this person
  has access (and lists their business's sheets); with ?id= (and optionally &version=) it returns one.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => (q.get("id") ? getSheet(db, user, q.get("id"), q.get("version")) : businessHome(db, user)));
}

/** Save a Decision Sheet: a new one (with a name) or the next version of one (with its id). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveSheet(db, user, await body<Record<string, unknown>>(req), now));
}
