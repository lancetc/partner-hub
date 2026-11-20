import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { gapAction, placeableSnippets, playbookAction, playbookLibrary } from "@/server/playbooks";

/** The playbook library for owners and authors; with ?placeable=1, just what a course can place. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("placeable") ? { snippets: placeableSnippets(db, user, now) } : playbookLibrary(db, user, now)));
}

/** Owners' actions on snippets, releases, sources and contacts, and leads' actions on questions. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (["approve-post", "decline", "policy-pending", "resolve"].includes(input.action as string)) return gapAction(db, user, input, now);
    try {
      return playbookAction(db, user, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
