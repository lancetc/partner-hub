import { body, handle } from "@/server/http";
import { createCourseFor, deskOverview, problemAction, themeDetail } from "@/server/problemDesk";

/** The Problem desk, for learning authors: the whole desk, or one theme with ?theme=. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const range = { from: q.get("from"), to: q.get("to") };
    const theme = q.get("theme");
    return theme ? themeDetail(db, user, theme, range, now) : deskOverview(db, user, { ...range, status: q.get("status"), risk: q.get("risk") }, now);
  });
}

/** One change at a time; the page reads its view again afterwards. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    return input.action === "create-course" ? createCourseFor(db, user, input.id, now) : problemAction(db, user, input, now);
  });
}
