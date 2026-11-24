import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { publishCourse } from "@/server/magazineApproval";
import { archiveGuide, authorGuide, duplicateGuide, restoreGuide, saveGuideDraft, type GuideInput } from "@/server/magazine";
import type { Db } from "@/server/db";
import { setDemoSignOff } from "@/server/demoSignOff";

/** The learning paths a quiz block can use: each has its own quiz in the Hub's quiz engine. */
const paths = (db: Db) =>
  db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 AND quiz IS NOT NULL ORDER BY name").all() as { id: string; name: string }[];

/** The guide as its author edits it: the draft, the publish checks and the editions so far. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/magazine/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => ({ guide: authorGuide(db, user, id), paths: paths(db) }));
}

/** Autosave of the draft. Learners keep reading the published edition until it's published. */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    try {
      return { guide: saveGuideDraft(db, user, id, await body<GuideInput>(req), now) };
    } catch (e) {
      // Say exactly what's wrong, so the editor can show it.
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
  });
}

/** Publish (a new edition), archive, restore or duplicate. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/magazine/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { action, summary, moveLearners, anyway, on } = await body<{
      action?: string;
      summary?: string;
      moveLearners?: boolean;
      anyway?: boolean;
      on?: boolean;
    }>(req);
    try {
      // Through the review rules, as from the review panel.
      if (action === "publish") return publishCourse(db, user, id, { summary, moveLearners, anyway }, now);
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      if (e instanceof HttpError && problems) return Response.json({ error: e.message, problems }, { status: e.status });
      throw e;
    }
    if (action === "archive") {
      archiveGuide(db, user, id, now);
      return { guide: authorGuide(db, user, id) };
    }
    // A demo Hub's stand-in for reviewers' sign-offs (server/demoSignOff): superadmins only.
    if (action === "demo-signoff") {
      setDemoSignOff(db, user, id, on === true, now);
      return { guide: authorGuide(db, user, id) };
    }
    if (action === "restore") return { guide: restoreGuide(db, user, id, now) };
    if (action === "duplicate") return { guide: duplicateGuide(db, user, id, now) };
    throw new HttpError(400, "Unknown action.");
  });
}
