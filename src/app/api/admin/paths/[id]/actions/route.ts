import { body, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { newDraft, pausePath, publish, rebaseline, resumePath, resumePreview, submitForReview, withdraw } from "@/server/paths";

type Action =
  | { action: "new_draft" | "submit" | "publish" | "pause" | "resume" | "resume_preview" }
  | { action: "rebaseline"; reason: string }
  | { action: "withdraw"; version: number; reason: string };

export async function POST(req: Request, ctx: RouteContext<"/api/admin/paths/[id]/actions">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const a = await body<Action>(req);
    switch (a.action) {
      case "new_draft":
        return { version: newDraft(db, user, id, now).version };
      case "submit":
        return submitForReview(db, user, id, now);
      case "publish":
        return publish(db, user, id, now);
      case "pause":
        return pausePath(db, user, id, now);
      case "resume_preview":
        requireAuthor(user);
        return resumePreview(db, id, now);
      case "resume":
        return resumePath(db, user, id, now);
      case "rebaseline":
        return rebaseline(db, user, id, a.reason, now);
      case "withdraw":
        return withdraw(db, user, id, a.version, a.reason, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
