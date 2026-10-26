import { body, handle } from "@/server/http";
import { HttpError, requireReporter } from "@/server/auth";
import type { PathConfig, PathStep, FollowUpContent } from "@/content/followups";
import { editableVersion, listPaths, saveDraft, validatePath } from "@/server/paths";
import { pathReport } from "@/server/reports";
import { lessons } from "@/content/lessons";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/paths/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user }) => {
    requireReporter(user);
    const p = listPaths(db).find((x) => x.id === id);
    if (!p) throw new HttpError(404, "Path not found.");
    const draft = editableVersion(db, id);
    const shown = draft ?? p.live ?? p.latest;
    const followUps = (db.prepare("SELECT id, MAX(version) AS version FROM follow_ups GROUP BY id").all() as { id: string; version: number }[]).map((r) => {
      const row = db.prepare("SELECT content FROM follow_ups WHERE id = ? AND version = ?").get(r.id, r.version) as { content: string };
      const c = JSON.parse(row.content) as FollowUpContent;
      return { id: c.id, version: c.version, status: c.status, title: c.title, stage: c.stage, role: c.role ?? null, durationSec: c.durationSec };
    });
    return {
      id,
      version: shown.version,
      status: shown.status,
      paused: Boolean(p.live?.paused),
      liveVersion: p.live?.version ?? null,
      versions: p.versions,
      editable: Boolean(draft),
      config: shown.config,
      steps: shown.steps,
      issues: draft ? validatePath(db, draft.config, draft.steps) : [],
      followUps,
      lessons: lessons.map((l) => ({ slug: l.slug, version: l.version, title: l.title, minutes: l.minutes, track: l.track })),
      report: pathReport(db, user, id),
      history: db.prepare("SELECT actor, event, entity, reason, at FROM audit WHERE entity LIKE ? ORDER BY id DESC LIMIT 20").all(`path:${id}%`),
    };
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/paths/[id]">) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input = await body<{ config: PathConfig; steps: PathStep[] }>(req);
    const saved = saveDraft(db, user, id, input, now);
    return { ok: true, version: saved.version, issues: validatePath(db, saved.config, saved.steps) };
  });
}
