import { body, handle } from "@/server/http";
import { recordPublicEvent } from "@/server/publicPaths";

/**
  `{ kind, slug? }` from a public path: "opened", "topic" (with the topic's slug) or "path" when every
  topic is done. Counted anonymously: nothing about the person or their device is stored.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/open/[token]">) {
  const { token } = await ctx.params;
  return handle(async ({ db, now }) => {
    const b = await body<{ kind?: unknown; slug?: unknown }>(req);
    return recordPublicEvent(db, token, b.kind, b.slug, now);
  });
}
