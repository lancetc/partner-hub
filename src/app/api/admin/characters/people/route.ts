import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { editorLesson } from "@/server/authoredLessons";
import { actOnPeople, peopleToAdd, topicPeople } from "@/server/peopleInContent";

/**
  People in your content (docs/character-photos.md): everyone named in Topics and Magazine courses who isn't in the
  character library or has no portrait. With ?slug=…, just the people one Topic's draft names, for the editor's notice.
*/
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  return handle(({ db, user }) => {
    if (!slug) return peopleToAdd(db, user);
    const found = editorLesson(db, slug);
    if (!found) throw new HttpError(404, "Topic not found.");
    return { people: topicPeople(db, user, found.lesson) };
  });
}

/** Add people to the library (free), make their portraits (paid: needs `confirm: true`), or dismiss a name. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => actOnPeople(db, user, await body<Record<string, unknown>>(req), now));
}
