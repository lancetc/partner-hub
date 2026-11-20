import { handle } from "@/server/http";
import { exportRegister } from "@/server/problemDesk";

/** The decision register as a workbook: de-identified aggregates and links back, with the export logged. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  return handle(({ db, user, now }) => {
    const out = exportRegister(db, user, { status: q.get("status"), risk: q.get("risk"), from: q.get("from"), to: q.get("to"), origin: url.origin }, now);
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
