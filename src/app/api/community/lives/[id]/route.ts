import { body, handle } from "@/server/http";
import { livesActivity, livesStory } from "@/server/livesInProgress";

/*
  One Digital Member's Lives in Progress story, for the reader (docs/lives-in-progress.md). `?episode=<id>` looks back
  at an earlier episode; `?preview=1` lets an author see episodes that aren't out yet. Learners only ever get what's out.
*/
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  return handle(({ db, user, now }) =>
    livesStory(db, user, id, now, { episode: url.searchParams.get("episode"), preview: url.searchParams.get("preview") === "1" }),
  );
}

/** What the reader did: opened the story, viewed an episode, listened, chose a "what if", followed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async ({ db, user, now }) => livesActivity(db, user, id, await body<Record<string, unknown>>(req), now));
}
