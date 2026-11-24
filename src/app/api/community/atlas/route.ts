import { handle } from "@/server/http";
import { atlasMembers } from "@/server/communityAtlas";

/** The members who chose to appear on the Community Atlas: town, topics and what they chose to show. Signed-in readers only. */
export async function GET() {
  return handle(({ db, user }) => ({ members: atlasMembers(db, user) }));
}
