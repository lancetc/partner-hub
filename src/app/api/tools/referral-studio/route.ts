import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  assetEvent,
  deletePractice,
  draftPracticeNote,
  endPractice,
  openEvidence,
  practiceTurn,
  practiceViewed,
  recordActivity,
  saveAsset,
  savePitchCard,
  startPractice,
  studioHome,
  submitPractice,
} from "@/server/referralStudio";

/*
  The Local Referral Studio Work Tool (docs/local-referral-studio.md). Every read and write checks, on the server, that
  the person is the business owner or someone they've authorised (plannerAccess); saved drafts, pitch cards and
  relationship notes are read only within that business. GET says whether this person has access and, if so, sends
  their practice, the kit and their business's saved work.
*/
export async function GET() {
  return handle(({ db, user, now }) => studioHome(db, user, now));
}

/** Practice (start, open evidence, a reply, end, the close note, submit, viewed, delete), and the kit (save, download or copy, a pitch card, a relationship note). */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "start":
        return startPractice(db, user, input, now);
      case "evidence":
        return openEvidence(db, user, input, now);
      case "end":
        return endPractice(db, user, input, now);
      case "note":
        return draftPracticeNote(db, user, input, now);
      case "submit":
        return submitPractice(db, user, input, now);
      case "viewed":
        return practiceViewed(db, user, input, now);
      case "delete":
        return deletePractice(db, user, input);
      case "asset":
        return saveAsset(db, user, input, now);
      case "asset-event":
        return assetEvent(db, user, input, now);
      case "card":
        return savePitchCard(db, user, input, now);
      case "activity":
        return recordActivity(db, user, input, now);
      case "turn":
        return practiceTurn(db, user, input, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
