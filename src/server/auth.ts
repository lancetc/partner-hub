import "server-only";
import { cookies } from "next/headers";
import type { Db } from "./db";

/*
  Demo sign-in: the person is chosen from seeded accounts and kept in a cookie. Real
  verified sign-in replaces this; every permission check below already runs on the server.
*/

export type User = {
  id: string;
  name: string;
  email: string;
  org_id: string;
  role: "learner" | "org_admin" | "author";
  audience: "partner" | "coordinator" | "staff";
  service_role: string | null;
  timezone: string | null;
  /** Who confirms this person's practice after spaced learning. */
  manager_id?: string | null;
  /** The language they read the hub in, through Google Translate. Null is English. */
  language?: string | null;
  /** Their profile picture file (server/profilePictures), or null for initials. */
  avatar?: string | null;
  /** 1: manages people and permissions across every organisation (server/people). */
  superadmin?: number;
};

export const SESSION_COOKIE = "tc-demo-user";

export function userById(db: Db, id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export async function currentUser(db: Db): Promise<User> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value ?? "sam";
  return userById(db, id) ?? userById(db, "sam")!;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const canAuthor = (u: User) => u.role === "author";
/** Trilogy staff who manage people, their access and their learning across every organisation. */
export const isSuperadmin = (u: User) => u.superadmin === 1;

export function requireSuperadmin(u: User) {
  if (!isSuperadmin(u)) throw new HttpError(403, "Only superadmins can manage people and permissions.");
}
export const canReport = (u: User) => u.role === "author" || u.role === "org_admin";

/** Organisation scope for reports: Trilogy authors see all; organisation admins see their own. */
export const reportOrgScope = (u: User): string | null => (u.role === "author" ? null : u.org_id);

export function requireAuthor(u: User) {
  if (!canAuthor(u)) throw new HttpError(403, "Only learning authors can manage paths.");
}

export function requireReporter(u: User) {
  if (!canReport(u)) throw new HttpError(403, "You don't have access to reports.");
}
