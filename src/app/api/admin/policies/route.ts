import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { createPolicyAck, policyAcks, policyLinks, withdrawPolicyAck } from "@/server/policyAcks";

/** Policy acknowledgements (Admin → Policy acknowledgements): every request and who has confirmed, or ?view=links. */
export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get("view");
  return handle(({ db, user, now }) => (view === "links" ? { links: policyLinks(db, user) } : policyAcks(db, user, now)));
}

/** { action: "send", title, version, summary, href, linkLabel, roles, dueOn } or { action: "withdraw", id, reason }. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "send") createPolicyAck(db, user, input, now);
    else if (input.action === "withdraw") withdrawPolicyAck(db, user, input, now);
    else throw new HttpError(400, "Unknown action.");
    return policyAcks(db, user, now);
  });
}
