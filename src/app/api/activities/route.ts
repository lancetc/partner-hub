import { handle } from "@/server/http";
import { learnerDirectory } from "@/server/activityCatalogue";

/** Every interactive activity the signed-in person can open: published courses built around one, and the tools and games their role allows. */
export async function GET() {
  return handle(({ db, user, now }) => learnerDirectory(db, user, now));
}
