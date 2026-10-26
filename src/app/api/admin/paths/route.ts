import { body, handle } from "@/server/http";
import { requireReporter } from "@/server/auth";
import { createFromLesson, listPaths } from "@/server/paths";
import { pathReport } from "@/server/reports";

export async function GET() {
  return handle(({ db, user }) => {
    requireReporter(user);
    return {
      paths: listPaths(db).map((p) => {
        const r = pathReport(db, user, p.id);
        const v = p.live ?? p.latest;
        return {
          id: p.id,
          name: v.config.name,
          audience: v.config.audience,
          trigger: v.config.trigger,
          mode: v.config.schedule.mode,
          steps: v.steps.length,
          liveVersion: p.live?.version ?? null,
          paused: Boolean(p.live?.paused),
          draftVersion: p.draft?.version ?? null,
          draftStatus: p.draft?.status ?? null,
          versions: p.versions,
          totals: r.totals,
        };
      }),
    };
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { fromLesson } = await body<{ fromLesson: string }>(req);
    return { id: createFromLesson(db, user, fromLesson, now) };
  });
}
