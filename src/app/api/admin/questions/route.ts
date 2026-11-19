import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { QUERY_KEYS, type PoolQuery } from "@/lib/questionPool";
import { bulkUpdate, listPool, saveExternal, saveSource, saveView, setEnforce, supersedeSource, syncPool } from "@/server/questionPool";

const queryOf = (url: string): PoolQuery => {
  const p = new URL(url).searchParams;
  return Object.fromEntries(QUERY_KEYS.map((k) => [k, p.get(k) ?? undefined]).filter(([, v]) => v)) as PoolQuery;
};

/** The Question Pool's live table: filtered, sorted and paged on the server. */
export async function GET(req: Request) {
  return handle(({ db, user, now }) => listPool(db, user, queryOf(req.url), now));
}

/** Things done to the pool as a whole: reconcile, bulk details, saved views, sources, SCORM coverage, the publish setting. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    switch (input.action) {
      case "sync":
        if (user.role !== "author") throw new HttpError(403, "Only authors can reconcile the pool.");
        return { report: syncPool(db, user, now) };
      case "bulk":
        return bulkUpdate(db, user, input, now);
      case "view":
        return saveView(db, user, input, now);
      case "source":
        return saveSource(db, user, input, now);
      case "supersede":
        return supersedeSource(db, user, input, now);
      case "external":
        return saveExternal(db, user, input, now);
      case "enforce":
        return setEnforce(db, user, input.on === true, now);
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
