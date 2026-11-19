import { handle } from "@/server/http";
import { QUERY_KEYS, type PoolQuery } from "@/lib/questionPool";
import { exportPool } from "@/server/questionPoolExport";

/**
  Export Excel: the current filtered selection (the same filters as the table) or the whole pool, as .xlsx.
  ?keys=1 adds answer keys for those entitled to them; ?versions=1 adds a row per version.
*/
export async function GET(req: Request) {
  return handle(({ db, user, now }) => {
    const p = new URL(req.url).searchParams;
    const query = Object.fromEntries(QUERY_KEYS.map((k) => [k, p.get(k) ?? undefined]).filter(([, v]) => v)) as PoolQuery;
    const out = exportPool(db, user, query, { keys: p.get("keys") === "1", versions: p.get("versions") === "1" }, now);
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.filename}"`,
        "content-length": String(out.buffer.length),
        "cache-control": "no-store",
      },
    });
  });
}
