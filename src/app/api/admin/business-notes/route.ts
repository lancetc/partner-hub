import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { businessEditorAction, businessInsights, businessLibrary } from "@/server/businessNotes";

/** The Business Field Notes library for editors (authors only), or aggregate insights (?insights=1&from=&to=). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) =>
    q.get("insights") ? businessInsights(db, user, { from: q.get("from"), to: q.get("to") }, now) : businessLibrary(db, user, now),
  );
}

/** Editors' decisions: review steps, publish, edit, flag, withdraw, check-ins, Community moderation and playbook proposals. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    try {
      return businessEditorAction(db, user, input, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}
