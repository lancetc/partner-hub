import { body, handle } from "@/server/http";
import { HttpError, requireReporter } from "@/server/auth";
import type { PathConfig, PathStep } from "@/content/followups";
import { previewSchedule } from "@/server/paths";
import { validateSchedule } from "@/lib/schedule";

/** Date preview using the same scheduling function as enrolment and the worker. */
export async function POST(req: Request) {
  return handle(async ({ user }) => {
    requireReporter(user);
    const input = await body<{ config: PathConfig; steps: PathStep[]; timezone: string; start: string; time: string }>(req);
    const [y, m, d] = input.start.split("-").map(Number);
    if (!y || !m || !d) throw new HttpError(400, "Choose a start date.");
    const issues = validateSchedule({ ...input.config.schedule, timezone: input.timezone }, input.steps.map((s) => s.gap));
    if (issues.length) return { issues, steps: [] };
    return { issues: [], ...previewSchedule({ config: input.config, steps: input.steps, timezone: input.timezone, start: { y, m, d }, time: input.time }) };
  });
}
