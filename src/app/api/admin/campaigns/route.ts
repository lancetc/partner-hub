import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { createCampaign, listCampaigns, type Kind } from "@/server/campaigns";

export async function GET() {
  return handle(({ db, user, now }) => listCampaigns(db, user, now));
}

/** A new campaign from the monthly or quarterly template. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { kind } = await body<{ kind: Kind }>(req);
    if (!["monthly", "quarterly", "one_off"].includes(kind)) throw new HttpError(400, "Unknown kind of campaign.");
    return createCampaign(db, user, kind, now);
  });
}
