import { body, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { applyIntroMigration, bulkIntro, introOverview, introStats } from "@/server/topicIntros";

/** The Topic Introduction Manager: every Topic's introduction, the presenters and the migration preview; or one Topic's analytics (?stats=<slug>). */
export async function GET(req: Request) {
  return handle(({ db, user }) => {
    requireAuthor(user);
    const stats = new URL(req.url).searchParams.get("stats");
    return stats ? introStats(db, stats) : introOverview(db);
  });
}

/**
  Bulk actions on Topics' drafts (assign a presenter, replace placeholders, prepare approved scripts for production,
  estimate and then generate missing scripts), or applying the migration, which needs its own confirmation.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "apply_migration") {
      if (input.confirm !== "add-introduction-cards") throw new HttpError(409, "Confirm the migration first.");
      return applyIntroMigration(db, user, now);
    }
    return bulkIntro(db, user, input, now);
  });
}
