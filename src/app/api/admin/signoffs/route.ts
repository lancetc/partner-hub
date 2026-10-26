import { body, handle } from "@/server/http";
import { decideSignoff, signoffQueue } from "@/server/signoffs";

/** People who finished a spaced lesson's follow ups and are waiting for their manager, plus recent decisions. */
export async function GET() {
  return handle(({ db, user }) => signoffQueue(db, user));
}

export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ enrolmentId: number; outcome: "confirmed" | "support"; note?: string }>(req);
    return decideSignoff(db, user, Number(b.enrolmentId), b.outcome, b.note ?? "", now);
  });
}
