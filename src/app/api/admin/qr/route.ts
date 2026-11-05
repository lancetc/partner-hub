import { handle } from "@/server/http";
import { HttpError, requireReporter } from "@/server/auth";
import { localOnly, qrTarget } from "@/server/qr";

/** What a path's or lesson's QR code opens (?path=<id>, ?lesson=<slug> or ?open=<path id> for its public link), and whether phones can reach it yet. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => {
    requireReporter(user);
    const path = q.get("path");
    const lesson = q.get("lesson");
    const open = q.get("open");
    if (!path && !lesson && !open) throw new HttpError(400, "Which path or topic?");
    const target = qrTarget(
      db,
      open ? { kind: "open", id: open } : path ? { kind: "path", id: path } : { kind: "lesson", id: lesson! },
      req.headers.get("host"),
    );
    // A public link uses this computer's network address until the hub has its web address.
    return { ...target, localOnly: localOnly(target.url), network: Boolean(open) && localOnly() && !localOnly(target.url) };
  });
}
