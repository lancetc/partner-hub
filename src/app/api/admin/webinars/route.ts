import { body, handle } from "@/server/http";
import { adminWebinars, saveWebinar, type WebinarInput } from "@/server/webinars";

export async function GET() {
  return handle(({ db, user }) => ({ webinars: adminWebinars(db, user) }));
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveWebinar(db, user, null, await body<WebinarInput>(req), now));
}
