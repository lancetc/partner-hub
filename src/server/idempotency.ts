import "server-only";
import type { Db } from "./db";

/*
  Replay protection for saves sent from a device's offline outbox. Each carries an Idempotency-Key;
  the first response to it is stored, and the same key from the same person later gets that stored
  response instead of running the save again. Kept for 30 days.
*/

const KEEP_MS = 30 * 86_400_000;
export const validKey = (key: string | null): key is string => Boolean(key && /^[A-Za-z0-9-]{8,100}$/.test(key));

export function storedResponse(db: Db, key: string, userId: string) {
  const row = db.prepare("SELECT status, response FROM idempotency WHERE key = ? AND user_id = ?").get(key, userId) as
    { status: number; response: string } | undefined;
  return row ? { status: row.status, body: JSON.parse(row.response) as unknown } : null;
}

export function storeResponse(db: Db, key: string, userId: string, status: number, body: unknown, now: Date) {
  db.prepare("INSERT OR IGNORE INTO idempotency (key, user_id, status, response, created_at) VALUES (?, ?, ?, ?, ?)").run(
    key,
    userId,
    status,
    JSON.stringify(body ?? { ok: true }),
    now.toISOString(),
  );
  // Tidy up now and then.
  if (Math.random() < 0.02) db.prepare("DELETE FROM idempotency WHERE created_at < ?").run(new Date(now.getTime() - KEEP_MS).toISOString());
}
