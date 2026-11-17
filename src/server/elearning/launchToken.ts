import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "../db";

/*
  The pass a launch gives the course's content origin. Course files and the player shell are served on a
  separate origin, which never sees the Hub's sign-in cookie, so each launch carries a signed, short-lived
  token naming one attempt, its version and launch session, and the Hub origin it was launched from.
  It grants nothing but reading that version's files and running the player for that session; saving
  progress always goes back through the Hub page, with the learner's own sign-in.
*/

export type LaunchClaims = { attempt: number; version: string; session: string; hub: string; exp: number };

const HOURS = 12;

function secret(db: Db) {
  const env = process.env.HUB_ELEARNING_SECRET;
  if (env && env.length >= 32) return env;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'elearning_secret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const value = randomBytes(32).toString("base64url");
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('elearning_secret', ?)").run(value);
  return (db.prepare("SELECT value FROM settings WHERE key = 'elearning_secret'").get() as { value: string }).value;
}

const sign = (db: Db, body: string) => createHmac("sha256", secret(db)).update(body).digest("base64url");

export function launchToken(db: Db, c: Omit<LaunchClaims, "exp">, now: Date) {
  const body = Buffer.from(JSON.stringify({ ...c, exp: now.getTime() + HOURS * 3600_000 })).toString("base64url");
  return `${body}.${sign(db, body)}`;
}

/** The claims in a token, or null if it's damaged, forged or expired. */
export function readLaunchToken(db: Db, token: string, now: Date): LaunchClaims | null {
  const [body, mac] = token.split(".");
  if (!body || !mac || token.length > 2000) return null;
  const expected = Buffer.from(sign(db, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LaunchClaims;
    return typeof c.exp === "number" && c.exp > now.getTime() ? c : null;
  } catch {
    return null;
  }
}

/*
  The content origin. Set HUB_CONTENT_ORIGIN (for example https://content.hub.example) where the Hub is
  hosted. On this computer, localhost and 127.0.0.1 are different origins to a browser, so content opened
  from one is served from the other.
*/
export function contentOriginFor(hubOrigin: string) {
  if (process.env.HUB_CONTENT_ORIGIN) return process.env.HUB_CONTENT_ORIGIN.replace(/\/$/, "");
  const u = new URL(hubOrigin);
  if (u.hostname === "localhost") u.hostname = "127.0.0.1";
  else if (u.hostname === "127.0.0.1") u.hostname = "localhost";
  else return null;
  return u.origin;
}
