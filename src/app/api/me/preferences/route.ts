import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { audit } from "@/server/db";
import { isLanguage } from "@/lib/languages";

/** Your own settings. For now: the language you read the hub in. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { language } = await body<{ language: string }>(req);
    if (!isLanguage(language)) throw new HttpError(400, "Choose one of the languages listed.");
    db.prepare("UPDATE users SET language = ? WHERE id = ?").run(language === "en" ? null : language, user.id);
    audit(db, { actor: user.id, event: "preferences.language", entity: `user:${user.id}`, next: { language }, at: now });
    return { language };
  });
}
