import { body, handle } from "@/server/http";
import { answerDiagnostic, diagnosticState, startDiagnostic } from "@/server/onboardingDiagnostic";

/** Check your starting point: where the signed-in person is with it. Questions come without their answers. */
export async function GET() {
  return handle(({ db, user }) => diagnosticState(db, user));
}

/** Begin the check, or record the first answer to a question. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "start" ? startDiagnostic(db, user, input, now) : answerDiagnostic(db, user, input, now);
  });
}
