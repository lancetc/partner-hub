import { body, handle } from "@/server/http";
import { characterHistory, recordStoryEvent, storyFor } from "@/server/story";

/**
  For learners: the approved story moments placed in a Topic (?topic=) or a Magazine course (?guide=), or one
  character's history (?character=, with the placement it was opened from or the episode a page sits at, and later=1 to show what comes after).
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const character = q.get("character");
    if (character) return characterHistory(db, user, character, { placement: q.get("placement"), episode: q.get("episode"), later: q.get("later") }, now);
    return storyFor(db, user, { topic: q.get("topic"), guide: q.get("guide") }, now);
  });
}

/** An engagement event: a check-in opened, a transmission started. Never an attempt or a completion. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => recordStoryEvent(db, user, await body<Record<string, unknown>>(req), now));
}
