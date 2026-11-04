import "server-only";
import { connection } from "next/server";
import { headers } from "next/headers";
import { getDb, type Db } from "./db";
import { currentUser, HttpError, type User } from "./auth";
import { now } from "./clock";
import { storedResponse, storeResponse, validKey } from "./idempotency";

export type Ctx = { db: Db; user: User; now: Date };

/**
  Wraps a route handler: resolves the database, signed-in user and clock, and maps errors.
  Saves sent with an Idempotency-Key (from the offline outbox) run once; a resend gets the first answer.
*/
export async function handle(fn: (ctx: Ctx) => unknown) {
  // Every API response depends on the signed-in person and the clock, so never prerender it.
  await connection();
  let replay: { db: Db; key: string; userId: string; now: Date } | null = null;
  try {
    const db = getDb();
    const user = await currentUser(db);
    const at = now(db);
    const key = (await headers()).get("idempotency-key");
    if (validKey(key)) {
      const stored = storedResponse(db, key, user.id);
      if (stored) return Response.json(stored.body, { status: stored.status, headers: { "idempotent-replay": "true" } });
      replay = { db, key, userId: user.id, now: at };
    }
    const result = await fn({ db, user, now: at });
    if (result instanceof Response) return result;
    if (replay) storeResponse(replay.db, replay.key, replay.userId, 200, result, replay.now);
    return Response.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      // A refusal is an answer too: a resend gets the same one. Server faults aren't kept, so they can be retried.
      if (replay && e.status < 500) storeResponse(replay.db, replay.key, replay.userId, e.status, { error: e.message }, replay.now);
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

export const intParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, "Not found.");
  return n;
};

/**
  A streamed reply of JSON lines: progress events as `run` sends them, then {"type":"done", ...result}
  or {"type":"error", error}. For long Claude drafts, so the editor can show what's happening.
*/
export function eventStream(run: (send: (event: unknown) => void) => Promise<object>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "done", ...(await run(send)) });
      } catch (e) {
        send({ type: "error", error: e instanceof HttpError ? e.message : "Something went wrong while Claude was drafting." });
        if (!(e instanceof HttpError)) console.error(e);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
