import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { gapAction, placeableSnippets, playbookAction, playbookLibrary } from "@/server/playbooks";
import { aidAdminAction, aidReport } from "@/server/favourites";
import { draftAid, similarAids } from "@/server/aidDraft";

/** The playbook library for owners and authors; with ?placeable=1, just what a course can place. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    // Use of each Job Aid in a date range: adoption evidence, for owners and authors.
    if (q.get("view") === "report") return aidReport(db, user, { from: q.get("from"), to: q.get("to") }, now);
    // Aids that already cover a task, before a new one is started.
    if (q.get("view") === "similar")
      return similarAids(
        db,
        user,
        { title: q.get("title"), trigger: q.get("trigger"), docId: q.get("docId"), anchor: q.get("anchor"), except: q.get("except") },
        now,
      );
    return q.get("placeable") ? { snippets: placeableSnippets(db, user, now) } : playbookLibrary(db, user, now);
  });
}

/** Owners' actions on snippets, releases, sources and contacts, and leads' actions on questions. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (["approve-post", "decline", "policy-pending", "resolve"].includes(input.action as string)) return gapAction(db, user, input, now);
    if (["place-topic", "unplace-topic", "review"].includes(input.action as string)) return aidAdminAction(db, user, input, now);
    // An AI draft of the steps from the aid's approved source section: returned, never saved.
    if (input.action === "draft") return draftAid(db, user, input.id, now);
    try {
      return playbookAction(db, user, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
