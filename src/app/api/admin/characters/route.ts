import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { characterLibrary, missingPortraits, queuePortraits, saveCharacter } from "@/server/characters";

/** The character photo library, for authors. */
export async function GET() {
  return handle(({ db, user }) => characterLibrary(db, user));
}

/** Save a character, or queue portraits: for some characters, or every one still missing a portrait. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "save") return saveCharacter(db, user, input, now);
    if (input.action === "generate")
      return queuePortraits(db, user, Array.isArray(input.ids) ? input.ids.filter((x): x is string => typeof x === "string").slice(0, 40) : []);
    if (input.action === "generate-missing") return queuePortraits(db, user, missingPortraits(db));
    throw new HttpError(400, "Unknown action.");
  });
}
