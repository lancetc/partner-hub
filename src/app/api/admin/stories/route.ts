import { body, handle } from "@/server/http";
import { adminStories, saveStory } from "@/server/stories";
import type { Story } from "@/content/stories";

/** Every news story, for the editor's list. */
export async function GET() {
  return handle(({ db, user }) => adminStories(db, user));
}

/** A new story, saved as a draft. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => saveStory(db, user, null, (await body<{ story: Partial<Story> }>(req)).story, now));
}
