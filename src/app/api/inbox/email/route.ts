import { handle } from "@/server/http";
import { campaignForReader } from "@/server/campaigns";

/** An email from the hub, as you got it, to read in your Inbox (?campaign=id). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("campaign") ?? "";
  return handle(({ db, user }) => campaignForReader(db, user, id));
}
