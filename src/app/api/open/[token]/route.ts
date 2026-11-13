import { body, handle } from "@/server/http";
import { publicPathId, recordPublicEvent } from "@/server/publicPaths";
import { recordTopicEvent } from "@/server/publicTopics";

/**
  `{ kind, slug? }` from a public path: "opened", "topic" (with the topic's slug) or "path" when every
  topic is done. Counted anonymously: nothing about the person or their device is stored.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/open/[token]">) {
  const { token } = await ctx.params;
  return handle(async ({ db, now }) => {
    const b = await body<{ kind?: unknown; slug?: unknown }>(req);
    // A public learning path, or a single public topic (opened from its QR code).
    if (publicPathId(db, token)) return recordPublicEvent(db, token, b.kind, b.slug, now);
    return recordTopicEvent(db, token, b.kind, now);
  });
}
