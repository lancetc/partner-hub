import { body, handle } from "@/server/http";
import { caseThreadAction, caseThreadSpace, caseThreadView, mySavedScripts } from "@/server/caseThreads";

/**
  "What Would You Do?" Community Case Threads (docs/case-threads.md): one canonical thread per case, the same for
  the Magazine block and the Community page. Every request is checked against the thread's own audience.

  GET: one thread (?id=, with ?view= and ?cursor= for the feed), the threads this person can see (?space=1), or
  their saved scripts across threads (?saved=1).
*/
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    if (q.get("space")) return caseThreadSpace(db, user);
    if (q.get("saved")) return { saved: mySavedScripts(db, user) };
    return caseThreadView(db, user, q.get("id"), { view: q.get("view"), cursor: q.get("cursor") }, now);
  });
}

/** A learner's action on a thread (`threadId`, `action`): draft, submit, checklist, viewed-note, viewed-peer, vote, comment, save, reflect, share, edit, withdraw, report. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => caseThreadAction(db, user, await body<Record<string, unknown>>(req), now));
}
