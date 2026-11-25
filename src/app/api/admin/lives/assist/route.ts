import { body, handle } from "@/server/http";
import { livesProposal } from "@/server/livesAssist";

/** The AI Story Assistant: one proposal for an author. Nothing is saved, scheduled or published by asking. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => livesProposal(db, user, await body<Record<string, unknown>>(req), now));
}
