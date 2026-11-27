import { body, handle } from "@/server/http";
import { draftGlance, practiceLinks } from "@/server/storyGlance";
import { canAuthor, HttpError } from "@/server/auth";
import type { Story } from "@/content/stories";

/*
  Drafts a story's "At a glance" takeaways and "Put it into practice" actions with Claude, from the story as it stands in
  the News editor (server/storyGlance). Returns a proposal for the author to check; nothing is saved.
  `{ story, what: "glance" | "practice" | "both" }`.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => draftGlance(db, user, await body<{ story?: Partial<Story>; what?: unknown }>(req), now));
}

/** The Hub pages an action can link to: topics, resources and approved Work Tools. */
export async function GET() {
  return handle(async ({ db, user, now }) => {
    if (!canAuthor(user)) throw new HttpError(403, "Only learning authors can edit the news.");
    return { links: practiceLinks(db, user, now) };
  });
}
