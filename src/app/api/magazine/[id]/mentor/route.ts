import { body, handle } from "@/server/http";
import { deckAction, deckState } from "@/server/notes";

/** Notes to a Younger Me: the signed-in person's deck in this course, dealt once and kept stable. */
export async function GET(req: Request, ctx: RouteContext<"/api/magazine/[id]/mentor">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => deckState(db, user, id, q.get("block"), now));
}

/** Turn a card, record a first instinct (private), reflect (private), or deal another note. */
export async function POST(req: Request, ctx: RouteContext<"/api/magazine/[id]/mentor">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => deckAction(db, user, id, await body<Record<string, unknown>>(req), now));
}
