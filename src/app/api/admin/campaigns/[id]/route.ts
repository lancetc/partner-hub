import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { campaignDetail, deleteCampaign, scheduleCampaign, sendCampaign, sendTest, unscheduleCampaign, updateCampaign, type CampaignInput } from "@/server/campaigns";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => campaignDetail(db, user, id));
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => updateCampaign(db, user, id, await body<CampaignInput>(req), now));
}

/** test (send me a copy), schedule, unschedule or send now. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "test" | "schedule" | "unschedule" | "send"; sendAt?: string }>(req);
    if (b.action === "test") return sendTest(db, user, id, now);
    if (b.action === "schedule") return scheduleCampaign(db, user, id, b.sendAt ?? "", now);
    if (b.action === "unschedule") return unscheduleCampaign(db, user, id, now);
    if (b.action === "send") return sendCampaign(db, id, now, undefined, user);
    throw new HttpError(400, "Unknown action.");
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => deleteCampaign(db, user, id, now));
}
