import { handle } from "@/server/http";
import { learnerWebinars, webinarsPage } from "@/server/webinars";

/** Published webinar recordings for the signed-in person, and the page's heading and introduction. */
export async function GET() {
  return handle(({ db, user }) => ({ webinars: learnerWebinars(db, user), page: webinarsPage(db) }));
}
