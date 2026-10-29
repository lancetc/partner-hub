import { handle } from "@/server/http";
import { HttpError, requireReporter } from "@/server/auth";
import { localOnly, qrTarget } from "@/server/qr";

/** What a path's or lesson's QR code opens (?path=<id> or ?lesson=<slug>), and whether phones can reach it yet. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    requireReporter(user);
    const path = q.get("path");
    const lesson = q.get("lesson");
    if (!path && !lesson) throw new HttpError(400, "Which path or topic?");
    return { ...qrTarget(db, path ? { kind: "path", id: path } : { kind: "lesson", id: lesson! }), localOnly: localOnly() };
  });
}
