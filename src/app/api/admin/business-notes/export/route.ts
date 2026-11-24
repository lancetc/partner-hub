import { handle } from "@/server/http";
import { businessExport } from "@/server/businessNotes";

/** The general Business Field Notes workbook: aggregates with denominators, source and version; no post text or private words. Logged. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const buf = businessExport(db, user, { from: q.get("from"), to: q.get("to") }, now);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="business-field-notes-${now.toISOString().slice(0, 10)}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  });
}
