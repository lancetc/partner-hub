import { body, handle } from "@/server/http";
import { HttpError, requireReporter } from "@/server/auth";
import type { FollowUpContent } from "@/content/followups";
import { followUp } from "@/server/learning";
import { contentIssues, saveFollowUp } from "@/server/paths";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/follow-ups/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => {
    requireReporter(user);
    const content = followUp(db, id);
    if (!content) throw new HttpError(404, "Follow up not found.");
    const versions = db.prepare("SELECT version, status, created_at FROM follow_ups WHERE id = ? ORDER BY version DESC").all(id);
    return { content, versions, issues: contentIssues(content) };
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/follow-ups/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const { content, approve } = await body<{ content: FollowUpContent; approve: boolean }>(req);
    if (content.id !== id) throw new HttpError(400, "Mismatched follow up.");
    const saved = saveFollowUp(db, user, content, approve, now);
    return { content: saved, issues: contentIssues(saved) };
  });
}
