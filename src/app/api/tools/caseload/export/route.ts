import { body, handle } from "@/server/http";
import { exportWorkbook } from "@/server/caseloadPlanner";

/**
  The private Excel workbook: a saved version (`id`, `version`) or the plan on screen (`plan`), for a growth case and
  option. Only on the person's request; a business plan needs access to that business.
*/
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { bytes, file } = exportWorkbook(db, user, await body<Record<string, unknown>>(req), now);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${file}"`,
        "cache-control": "private, no-store",
      },
    });
  });
}
