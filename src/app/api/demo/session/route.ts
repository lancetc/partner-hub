import { cookies } from "next/headers";
import { body, handle } from "@/server/http";
import { HttpError, SESSION_COOKIE, userById } from "@/server/auth";

/** Demo sign-in only: switches between seeded accounts. The cookie is readable so browser-side demo progress can be kept per account. */
export async function POST(req: Request) {
  return handle(async ({ db }) => {
    const { userId } = await body<{ userId: string }>(req);
    if (!userById(db, userId)) throw new HttpError(404, "Unknown demo account.");
    (await cookies()).set(SESSION_COOKIE, userId, { sameSite: "lax", path: "/" });
    return { ok: true };
  });
}
