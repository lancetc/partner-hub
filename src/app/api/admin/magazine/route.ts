import { body, handle } from "@/server/http";
import { adminGuides, createGuide, type GuideInput } from "@/server/magazine";

/** Every Magazine guide, for the admin list. */
export async function GET() {
  return handle(({ db, user }) => ({ guides: adminGuides(db, user) }));
}

/** A new guide from a template (or blank), as a draft. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => createGuide(db, user, await body<GuideInput>(req), now));
}
