import { body, handle } from "@/server/http";
import { backgroundFor, setBackground } from "@/server/backgrounds";

/** Your background behind the main pages. */
export async function GET() {
  return handle(({ db, user }) => ({ background: backgroundFor(db, user.id) }));
}

/** Choose a brand colour, a Pexels photo or no background: { kind: "colour", id } | { kind: "pexels", ... } | { kind: "none" }. */
export async function PUT(req: Request) {
  return handle(async ({ db, user, now }) => setBackground(db, user, await body(req), now));
}
