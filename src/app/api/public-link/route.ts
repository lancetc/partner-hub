import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { ensurePublicLink } from "@/server/publicPaths";
import { topicLink } from "@/server/publicTopics";
import { publicOrigin } from "@/server/qr";

/**
  The public link and QR code for a topic or learning path, shown beside its Enrol button: anyone who
  scans it opens it on their phone without signing in. Made the first time someone signed in asks.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { kind, id } = await body<{ kind?: string; id?: string }>(req);
    const host = req.headers.get("host");
    if (kind === "topic" && id) {
      const token = topicLink(db, user, id, now);
      return { url: `${publicOrigin(host)}/open/topic/${token}`, qr: `/api/qr?openTopic=${encodeURIComponent(id)}&size=360` };
    }
    if (kind === "path" && id) {
      const token = ensurePublicLink(db, user, id, now);
      return { url: `${publicOrigin(host)}/open/${token}`, qr: `/api/qr?open=${encodeURIComponent(id)}&size=360` };
    }
    throw new HttpError(400, "Which topic or path?");
  });
}
