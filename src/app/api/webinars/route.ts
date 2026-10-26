import { handle } from "@/server/http";
import { learnerWebinars } from "@/server/webinars";

/** Published webinar recordings for the signed-in person. */
export async function GET() {
  return handle(({ db, user }) => ({ webinars: learnerWebinars(db, user) }));
}
