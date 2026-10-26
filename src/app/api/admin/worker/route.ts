import { body, handle } from "@/server/http";
import { HttpError, requireAuthor, requireReporter } from "@/server/auth";
import { audit } from "@/server/db";
import { demoOffsetMs, now as clockNow, setDemoOffset } from "@/server/clock";
import { runWorker } from "@/server/worker";
import { workerStatus } from "@/server/scheduler";

export async function GET() {
  return handle(({ db, user, now }) => {
    requireReporter(user);
    return {
      clock: now.toISOString(),
      offsetDays: demoOffsetMs(db) / 86_400_000,
      background: workerStatus(),
      runs: db.prepare("SELECT * FROM worker_runs ORDER BY id DESC LIMIT 8").all(),
    };
  });
}

/** Run the worker now, or move the prototype demo clock and then run it. */
export async function POST(req: Request) {
  return handle(async ({ db, user }) => {
    requireAuthor(user);
    const a = await body<{ action: "run" | "advance" | "reset"; days?: number }>(req);
    if (a.action === "advance") {
      const days = Number(a.days);
      if (!Number.isFinite(days) || days <= 0 || days > 60) throw new HttpError(400, "Advance by 1 to 60 days.");
      setDemoOffset(db, demoOffsetMs(db) + days * 86_400_000);
      audit(db, { actor: user.id, event: "demo_clock.advanced", entity: "settings", next: { days }, at: new Date() });
    } else if (a.action === "reset") {
      setDemoOffset(db, 0);
      audit(db, { actor: user.id, event: "demo_clock.reset", entity: "settings", at: new Date() });
    }
    const result = await runWorker(db, clockNow(db));
    return { ...result, clock: clockNow(db).toISOString() };
  });
}
