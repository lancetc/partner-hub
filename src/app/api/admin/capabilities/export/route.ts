import { handle } from "@/server/http";
import { exportCapability } from "@/server/capabilityExport";

/** The role matrix and aggregate heatmap as a spreadsheet; ?individual=1 adds each person's evidence, for the population's owner only. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(({ db, user, now }) => {
    const out = exportCapability(db, user, q.get("role"), q.get("individual") === "1", now);
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
