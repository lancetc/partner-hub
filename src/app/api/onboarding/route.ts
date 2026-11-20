import { body, handle } from "@/server/http";
import { mySetup, reportMismatch, saveStep, startUsing, submitTask } from "@/server/onboarding";

/** Your setup: the signed-in person's own tasks and their organisation's. No one else's are ever returned. */
export async function GET() {
  return handle(({ db, user, now }) => mySetup(db, user, now));
}

/** Save where they're up to, complete or submit a task, start using the Hub, or say the role or organisation is wrong. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "step") return saveStep(db, user, input, now);
    if (input.action === "start") return startUsing(db, user, now);
    if (input.action === "mismatch") return reportMismatch(db, user, input, now);
    return submitTask(db, user, input.taskId, input, now);
  });
}
