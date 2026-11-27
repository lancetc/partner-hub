import { body, handle } from "@/server/http";
import { canAuthor, HttpError } from "@/server/auth";
import { makeRecording, recordingsThisHour, RECORDINGS_PER_HOUR } from "@/server/magazineNarration";

/*
  Records a news story's voiced introduction (the owner, Nov 2026) in the Magazine Editorial Voice (OpenAI's Alloy), the
  same way a Magazine page's is made. The recording comes back to the News editor to listen to; it's kept with the story
  when the author saves, and learners hear it only once it's approved there. `{ script, part? }`: part "summary" is the
  reading of the story's At a glance takeaways (server/storyGlance), which never plays by itself.
*/
export async function POST(req: Request, ctx: RouteContext<"/api/admin/stories/[slug]/narration">) {
  const { slug } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    if (!canAuthor(user)) throw new HttpError(403, "Only learning authors can record introductions.");
    if (recordingsThisHour(db, user, now) >= RECORDINGS_PER_HOUR) throw new HttpError(429, "That’s a lot of recordings this hour. Try again shortly.");
    const { script, part } = await body<{ script?: string; part?: string }>(req);
    const audio = await makeRecording(
      db,
      user,
      `story:${slug}`,
      { script: String(script ?? ""), voice: "profile:editorial", target: part === "summary" ? "news summary" : "news introduction" },
      now,
    );
    return { audio };
  });
}
