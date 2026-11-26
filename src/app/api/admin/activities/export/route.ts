import { handle } from "@/server/http";
import { exportInventory } from "@/server/activityCatalogue";

/** The catalogue as a spreadsheet, with the same filters as the screen (?q=&kind=&surface=&role=&ai=&authoring=&approval=&health=). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const filters = Object.fromEntries(["q", "kind", "surface", "role", "ai", "authoring", "approval", "health"].map((k) => [k, q.get(k) ?? ""]));
  return handle(({ db, user, now }) => {
    const out = exportInventory(db, user, filters, now);
    return new Response(new Uint8Array(out.buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.filename}"`,
        "cache-control": "no-store",
      },
    });
  });
}
