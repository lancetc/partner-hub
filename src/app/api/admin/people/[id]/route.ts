import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { personDetail, setAccess, unassign } from "@/server/people";

/** One person in full: access, assigned paths and topics, recent completions (superadmins only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/people/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => personDetail(db, user, id, now));
}

/** Change their access, or take an assignment away. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/people/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const b = await body<
      { action: "access"; access: string; reviewRole?: string | null; reviewArea?: string } | { action: "unassign"; kind: "path" | "topic"; itemId: string }
    >(req);
    if (b.action === "access") return setAccess(db, user, id, b, now);
    if (b.action === "unassign") return unassign(db, user, { kind: b.kind, id: b.itemId, userId: id }, now);
    throw new HttpError(400, "Unknown action.");
  });
}
