import { body, handle } from "@/server/http";
import { narrationVoices } from "@/server/magazineNarration";
import { characterDetail, courseFromPlan, generateStoryAudio, momentDetail, planDetail, storyAction, storyLibrary, storyPlaces } from "@/server/story";
import { storyProposal } from "@/server/storyAssist";
import { storyReport } from "@/server/storyReport";

/** Characters, episodes, story moments and plans, for learning authors. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(async ({ db, user, now }) => {
    switch (q.get("view")) {
      case "character":
        return characterDetail(db, user, q.get("id"), now);
      case "moment":
        return momentDetail(db, user, q.get("id"), now);
      case "plan":
        return planDetail(db, user, q.get("id"), now);
      case "places":
        return storyPlaces(db, user);
      case "voices":
        return narrationVoices(user);
      case "report":
        return storyReport(db, user, { from: q.get("from"), to: q.get("to") }, now);
      default:
        return storyLibrary(db, user, now);
    }
  });
}

/** One change at a time; the page reads its view again afterwards. Recording audio and AI proposals are the slow ones. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "generate-audio") return generateStoryAudio(db, user, input.id, now);
    if (input.action === "plan-course") return courseFromPlan(db, user, input.id, now);
    // An AI proposal: returned for the author to take or leave. Nothing is saved by asking.
    if (input.action === "propose") return storyProposal(db, user, input, now);
    return storyAction(db, user, input, now);
  });
}
