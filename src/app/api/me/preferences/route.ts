import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { audit } from "@/server/db";
import { isLanguage } from "@/lib/languages";

const MAX_NAME = 80;

/** Your own settings: the language you read the hub in, and the name shown on your profile. Send either or both. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { language, name } = await body<{ language?: string; name?: string }>(req);
    if (language === undefined && name === undefined) throw new HttpError(400, "Nothing to save.");
    const saved: { language?: string; name?: string } = {};
    if (name !== undefined) {
      const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
      if (!clean) throw new HttpError(400, "Enter the name you’d like to use.");
      if (clean.length > MAX_NAME) throw new HttpError(400, `Keep your name under ${MAX_NAME} characters.`);
      if (clean !== user.name) {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(clean, user.id);
        audit(db, { actor: user.id, event: "preferences.name", entity: `user:${user.id}`, previous: { name: user.name }, next: { name: clean }, at: now });
      }
      saved.name = clean;
    }
    if (language !== undefined) {
      if (!isLanguage(language)) throw new HttpError(400, "Choose one of the languages listed.");
      db.prepare("UPDATE users SET language = ? WHERE id = ?").run(language === "en" ? null : language, user.id);
      audit(db, { actor: user.id, event: "preferences.language", entity: `user:${user.id}`, next: { language }, at: now });
      saved.language = language;
    }
    return saved;
  });
}
