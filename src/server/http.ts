import "server-only";
import { connection } from "next/server";
import { getDb, type Db } from "./db";
import { currentUser, HttpError, type User } from "./auth";
import { now } from "./clock";

export type Ctx = { db: Db; user: User; now: Date };

/** Wraps a route handler: resolves the database, signed-in user and clock, and maps errors. */
export async function handle(fn: (ctx: Ctx) => unknown) {
  // Every API response depends on the signed-in person and the clock, so never prerender it.
  await connection();
  try {
    const db = getDb();
    const user = await currentUser(db);
    const result = await fn({ db, user, now: now(db) });
    return result instanceof Response ? result : Response.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
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
