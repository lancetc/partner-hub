import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { activateConfig, configView, funnel, grantOverride, resolveRequest, reviewQueue, reviewTask, saveConfigDraft } from "@/server/onboarding";
import { baselineReport, instruments, poolChoices, publishInstrument, saveInstrument } from "@/server/onboardingDiagnostic";

/** Setup, for the people who run it: the review queue, where everyone is up to, the requirements, and the starting-point checks. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    switch (q.get("view")) {
      case "progress":
        return funnel(db, user, { audience: q.get("audience"), state: q.get("state"), page: q.get("page") }, now);
      case "requirements":
        return configView(db, user);
      case "instruments":
        return instruments(db, user);
      case "pool":
        return poolChoices(db, user, { q: q.get("q") });
      case "baseline":
        return baselineReport(db, user, q.get("audience"));
      default:
        return reviewQueue(db, user, { page: q.get("page"), q: q.get("q") }, now);
    }
  });
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "review":
        reviewTask(db, user, input.rowId, input, now);
        return reviewQueue(db, user, {}, now);
      case "request":
        resolveRequest(db, user, input.id, input, now);
        return reviewQueue(db, user, {}, now);
      case "override":
        grantOverride(db, user, input, now);
        return funnel(db, user, {}, now);
      case "requirements":
        return saveConfigDraft(db, user, input, now);
      case "release":
        return activateConfig(db, user, input, now);
      case "instrument":
        return saveInstrument(db, user, input, now);
      case "publish":
        return publishInstrument(db, user, input.audience, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
