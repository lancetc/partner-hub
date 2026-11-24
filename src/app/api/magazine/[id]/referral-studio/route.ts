import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import {
  deletePractice,
  draftPracticeNote,
  endPractice,
  openEvidence,
  practiceTurn,
  practiceViewed,
  startPractice,
  studioPractice,
  submitPractice,
} from "@/server/referralStudio";

/** A Local Referral Studio block (docs/local-referral-studio.md): the signed-in person's own practice, never anyone else's. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const block = new URL(req.url).searchParams.get("block");
  return handle(({ db, user, now }) => studioPractice(db, user, { guideId: id, blockId: block }, now));
}

/** Start, open evidence, a reply, end, the close note, submit, viewed or delete. The kit is the Work Tool's, not the block's. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async ({ db, user, now }) => {
    const input: Record<string, unknown> & { guideId: string } = { ...(await body<Record<string, unknown>>(req)), guideId: id };
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
      case "turn":
        return practiceTurn(db, user, input, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
