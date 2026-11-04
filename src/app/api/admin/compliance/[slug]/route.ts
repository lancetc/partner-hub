import { body, handle } from "@/server/http";
import { registerTopic, removeFromRegister, saveRegisterEntry } from "@/server/complianceRegister";

/** One register topic: its rules and every person's record. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/compliance/[slug]">) {
  const { slug } = await ctx.params;
  return handle(({ db, user, now }) => registerTopic(db, user, slug, now));
}

/** Save the topic's register settings. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/compliance/[slug]">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => saveRegisterEntry(db, user, slug, await body<unknown>(req), now));
}

/** Take the topic off the register; records stay. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/compliance/[slug]">) {
  const { slug } = await ctx.params;
  return handle(({ db, user, now }) => removeFromRegister(db, user, slug, now));
}
