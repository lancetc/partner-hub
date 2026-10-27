import { handle } from "@/server/http";
import { completionsCsv } from "@/server/completionReports";

/** Completions as a spreadsheet: every lesson, or one with ?lesson=<slug>. */
export async function GET(req: Request) {
  const lesson = new URL(req.url).searchParams.get("lesson") ?? undefined;
  return handle(({ db, user, now }) => {
    const filename = `completions-${lesson ?? "all-lessons"}-${now.toISOString().slice(0, 10)}.csv`;
    return new Response(completionsCsv(db, user, lesson), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
    });
  });
}
