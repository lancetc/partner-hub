import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { addToRegister, decideTestOut, listRegister } from "@/server/complianceRegister";

/** The compliance register: its topics with their rules and counts, and test-outs waiting for approval. */
export async function GET() {
  return handle(({ db, user, now }) => listRegister(db, user, now));
}

/** `{ action: "add", slug }` puts a topic on the register; `{ action: "decide", id, approve, note }` approves or declines a test-out. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ action: "add"; slug: string } | { action: "decide"; id: number; approve: boolean; note?: string }>(req);
    if (b.action === "add") return addToRegister(db, user, String(b.slug), now);
    if (b.action === "decide") return decideTestOut(db, user, Number(b.id), b.approve === true, b.note ?? "", now);
    throw new HttpError(400, "Unknown action.");
  });
}
