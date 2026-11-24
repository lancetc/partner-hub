import { body, handle } from "@/server/http";
import { pocketAdminAction, pocketReport } from "@/server/pocketPlaybook";

/** Owners and authors: the Pocket Playbook's source health and use in a date range (docs/pocket-playbook.md). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => pocketReport(db, user, { from: q.get("from"), to: q.get("to") }, now));
}

/** Withdraw a tool at once, restore it, or record the review decision. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => pocketAdminAction(db, user, await body<Record<string, unknown>>(req), now));
}
