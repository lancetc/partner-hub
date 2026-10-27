import { body, handle } from "@/server/http";
import { listFacts, saveFact, type FactInput } from "@/server/facts";

/** The facts library, with the lessons that use each fact. */
export async function GET() {
  return handle(({ db, user }) => ({ facts: listFacts(db, user) }));
}

/** Add or update a fact. Every lesson using it shows the new value straight away. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveFact(db, user, await body<FactInput>(req), now));
}
