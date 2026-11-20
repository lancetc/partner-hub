import { body, handle } from "@/server/http";
import { guideUses, identityForAuthors, saveIdentity, withdrawRecording } from "@/server/learningGuide";

/** The AI Learning Guide: who it is, and every place it's used with the state of each recording. */
export async function GET() {
  return handle(({ db, user }) => ({ ...identityForAuthors(db, user), ...guideUses(db, user) }));
}

/** { action: "identity", ... } (Hub administrators) or { action: "withdraw" | "restore", src, note }. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "identity") return saveIdentity(db, user, input, now);
    return withdrawRecording(db, user, { ...input, restore: input.action === "restore" }, now);
  });
}
