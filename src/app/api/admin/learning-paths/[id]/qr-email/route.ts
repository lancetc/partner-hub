import { handle } from "@/server/http";
import { emailPathQr } from "@/server/qr";

/** Email everyone assigned to this path its link and QR code. */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/learning-paths/[id]/qr-email">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => emailPathQr(db, user, id, now));
}
