import { body, eventStream, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { createSampleTopic, mySampleTopics } from "@/server/sampleTopics";
import { cleanInterest } from "@/lib/sampleTopic";

/** Your sample topics (made in onboarding), newest first. */
export async function GET() {
  return handle(({ db, user }) => ({ topics: mySampleTopics(db, user) }));
}

/**
  Make a sample topic: `{ interest }`, what you'd like to learn. Streams progress as JSON lines while
  it's written (Claude when connected, else the starter template), then the saved topic.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { interest } = await body<{ interest?: unknown }>(req);
    if (!cleanInterest(interest)) throw new HttpError(400, "Tell us a little about what you’d like to learn (a few words is fine).");
    return eventStream((send) => createSampleTopic(db, user, interest, now, send));
  });
}
