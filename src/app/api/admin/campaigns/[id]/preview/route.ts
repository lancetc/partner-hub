import { handle } from "@/server/http";
import { previewHtml } from "@/server/campaigns";

/** The email as the signed-in author would receive it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => new Response(previewHtml(db, user, id), { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'none'" } }));
}
