import { body, handle } from "@/server/http";
import { leaveAtlas, myAtlas, saveMyAtlas } from "@/server/communityAtlas";

/** Whether you're on the Community Atlas, and what it shows: { atlas: null } until you choose to join. */
export async function GET() {
  return handle(({ db, user }) => ({ atlas: myAtlas(db, user) }));
}

/** Join, or change what the Atlas shows: { town, topics, canHelp?, askingAbout?, showOrg? }. */
export async function PUT(req: Request) {
  return handle(async ({ db, user, now }) => ({ atlas: saveMyAtlas(db, user, await body(req), now) }));
}

/** Leave the Atlas. Your town and topics are deleted, not hidden. */
export async function DELETE() {
  return handle(({ db, user, now }) => ({ ...leaveAtlas(db, user, now), atlas: null }));
}
