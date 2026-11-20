import { handle } from "@/server/http";
import { portraitRoster } from "@/server/characters";

/** The character portraits scenarios show beside a named person: names and picture addresses only. */
export async function GET() {
  return handle(({ db }) => portraitRoster(db));
}
