import "server-only";
import { cookies } from "next/headers";
import type { Db } from "./db";
import { canAuthor, HttpError, type User } from "./auth";
import { requireLink, reviewerById, type Reviewer } from "./reviews";

/** The browser cookie that remembers a reviewer who joined through a review link. */
export const REVIEWER_COOKIE = "tc-reviewer";

/** Who is reviewing in this browser: the reviewer who joined, or else a signed-in author. Undefined until they join. */
export async function currentReviewer(db: Db, user: User): Promise<Reviewer | undefined> {
  const joined = reviewerById(db, (await cookies()).get(REVIEWER_COOKIE)?.value);
  if (joined) return joined;
  return canAuthor(user) ? { kind: "author", user } : undefined;
}

export async function reviewerOnLink(db: Db, user: User, token: string) {
  const slug = requireLink(db, token);
  const who = await currentReviewer(db, user);
  if (!who) throw new HttpError(401, "Add your name and email to join the review.");
  return { slug, who };
}
