import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { clientAidEvent, favouriteAction, favouriteFor, favouritesList, pageMarks, savePassage } from "@/server/favourites";

/**
  The signed-in person's Favourites (docs/job-aids.md): whole Job Aids and highlighted passages. Private to them.
  GET lists them (?q= to search, ?kind=job_aid|passage, ?limit=), or with ?id= gives one, as it stands now.
  With ?marks=<source>&id=…(&page=…), their own passages on that page, for the marker there.
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("marks")
      ? pageMarks(db, user, { source: q.get("marks"), id: q.get("id"), page: q.get("page") }, now)
      : q.get("id")
        ? favouriteFor(db, user, q.get("id"), now)
        : favouritesList(db, user, { q: q.get("q"), kind: q.get("kind"), limit: q.get("limit") }, now),
  );
}

/**
  `{ action: "save-passage", source: "guide" | "aid" | "topic" | "news" | "resource", id, … }` saves a highlight or a section. `rename`, `pin`,
  `remove`, `opened` and `checked` act on one favourite. `event` records a use event. A whole Job Aid is saved
  from the aid itself (/api/playbooks/[id]).
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "save-passage") return savePassage(db, user, input, now);
    if (input.action === "event") return clientAidEvent(db, user, input, now);
    if (["rename", "pin", "remove", "opened", "checked"].includes(input.action as string)) return favouriteAction(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
