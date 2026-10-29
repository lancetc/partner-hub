import { handle } from "@/server/http";
import { myCertificates } from "@/server/learningPaths";

/** The signed-in person's certificates, one for each learning path they've finished, newest first. */
export async function GET() {
  return handle(({ db, user }) => ({ certificates: myCertificates(db, user) }));
}
