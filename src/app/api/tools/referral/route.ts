import { body, handle } from "@/server/http";
import { businessHome, getReview, saveReview } from "@/server/referralJourney";

/*
  "Review my relationships" for the Referral Journey block: a partner business's private Relationship Reviews. Every
  read and write checks, on the server, that the person is the business's owner or a member they've authorised, and
  that the review belongs to that business. GET with no id says whether this person has access (and lists their
  business's reviews); with ?id= (and optionally &version=) it returns one. A guide and block id, when given, only let
  the activity log note that a review was saved or reopened from that article: never its figures.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("id") ? getReview(db, user, q.get("id"), q.get("version"), { guideId: q.get("guide"), blockId: q.get("block") }, now) : businessHome(db, user),
  );
}

/** Save a review: a new one (with a name) or the next version of one (with its id). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveReview(db, user, await body<Record<string, unknown>>(req), now));
}
