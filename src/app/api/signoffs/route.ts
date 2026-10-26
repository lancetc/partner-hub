import { handle } from "@/server/http";
import { mySignoffs } from "@/server/signoffs";

/** The signed-in person's manager sign-off status, by lesson. */
export async function GET() {
  return handle(({ db, user }) => ({ signoffs: mySignoffs(db, user) }));
}
