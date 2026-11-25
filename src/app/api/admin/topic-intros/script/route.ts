import { body, handle } from "@/server/http";
import { draftIntroScript } from "@/server/topicIntros";
import type { Lesson } from "@/content/lessons";

/** AI drafts the presenter's script for the Topic as it stands in the editor (a paid call the author asked for). Nothing is saved here. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => draftIntroScript(db, user, (await body<{ lesson: Lesson }>(req)).lesson, now));
}
