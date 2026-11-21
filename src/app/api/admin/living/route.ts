import { body, handle } from "@/server/http";
import { livingAction, livingLibrary, returnDetail } from "@/server/living";
import { livingProposal } from "@/server/livingAssist";

/** Return episodes and their Field Notes, for learning authors (docs/living-cases.md): the list, or one with ?id=. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => (q.get("id") ? returnDetail(db, user, q.get("id"), now) : livingLibrary(db, user, now)));
}

/** One change at a time; the page reads its view again afterwards. A proposal is returned to take or leave: asking saves nothing. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "propose") return livingProposal(db, user, input, now);
    return livingAction(db, user, input, now);
  });
}
