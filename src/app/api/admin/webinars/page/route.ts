import { body, handle } from "@/server/http";
import { setWebinarsPage, webinarsPage, type WebinarsPage } from "@/server/webinars";

/** The Webinars page's heading and introduction. */
export async function GET() {
  return handle(({ db }) => webinarsPage(db));
}

export async function PUT(req: Request) {
  return handle(async ({ db, user, now }) => setWebinarsPage(db, user, await body<Partial<WebinarsPage>>(req), now));
}
