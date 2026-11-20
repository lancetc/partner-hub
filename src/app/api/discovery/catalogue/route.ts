import { handle } from "@/server/http";
import { searchCatalogue } from "@/server/discovery";

/** The Topics, courses and standalone Magazine pages this person can add to a Discovery Path. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user }) => searchCatalogue(db, user, { q: q.get("q"), kind: q.get("kind"), max: q.get("max") }));
}
