import { body, handle } from "@/server/http";
import { draftStory } from "@/server/storyDraft";

/** Claude writes a news item from the author's brief, every field filled in, for the editor (nothing is saved). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => draftStory(db, user, (await body<{ brief: string }>(req)).brief, now));
}
