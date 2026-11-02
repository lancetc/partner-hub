import { body, handle } from "@/server/http";
import { challengeOptions, createChallenge, listChallenges, type ChallengeInput } from "@/server/challenges";

/** Every challenge, with the people and topics the editor can choose from. */
export async function GET() {
  return handle(({ db, user, now }) => ({ challenges: listChallenges(db, user, now), ...challengeOptions(db, user) }));
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => createChallenge(db, user, await body<ChallengeInput>(req), now));
}
