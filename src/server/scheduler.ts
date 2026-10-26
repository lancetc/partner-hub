import "server-only";
import { getDb } from "./db";
import { now } from "./clock";
import { runWorker } from "./worker";

/*
  In-process scheduler for the prototype: runs the worker every 15 minutes while the Next.js
  server is up. A production deployment should trigger the same runWorker() from a platform
  scheduler (cron job, queue or scheduled function) so it doesn't depend on a web process.
*/

const INTERVAL_MS = 15 * 60 * 1000;
const state = globalThis as unknown as { __hubScheduler?: { timer: NodeJS.Timeout; lastRun?: string; lastError?: string } };

export function startScheduler() {
  if (state.__hubScheduler || process.env.HUB_WORKER === "off") return;
  const tick = async () => {
    try {
      const db = getDb();
      await runWorker(db, now(db));
      state.__hubScheduler!.lastRun = new Date().toISOString();
      state.__hubScheduler!.lastError = undefined;
    } catch (e) {
      state.__hubScheduler!.lastError = (e as Error).message;
    }
  };
  state.__hubScheduler = { timer: setInterval(tick, INTERVAL_MS) };
  state.__hubScheduler.timer.unref?.();
  void tick();
}

export function workerStatus() {
  const s = state.__hubScheduler;
  return { running: Boolean(s), intervalMinutes: INTERVAL_MS / 60000, lastRun: s?.lastRun ?? null, lastError: s?.lastError ?? null };
}
