import { body, handle } from "@/server/http";
import { ESSENTIAL_EMAILS } from "@/lib/emailTopics";
import { emailSettings, setAllTopics, setTopic } from "@/server/emailPrefs";

/** Your email topics, for Profile and settings. */
export async function GET() {
  return handle(({ db, user }) => ({ email: user.email, topics: emailSettings(db, user.id), essential: ESSENTIAL_EMAILS }));
}

/** Switch one topic on or off (`topic`), or every topic at once (`all`). */
export async function PUT(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ topic?: string; on?: boolean; all?: boolean }>(req);
    const topics = b.all ? setAllTopics(db, user.id, Boolean(b.on), now, "settings") : setTopic(db, user.id, b.topic, Boolean(b.on), now, "settings");
    return { email: user.email, topics, essential: ESSENTIAL_EMAILS };
  });
}
