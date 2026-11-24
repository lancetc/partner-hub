import { body, handle } from "@/server/http";
import { exportWorkbook } from "@/server/cashBridge";

/**
  The 90-Day Cash Bridge workbook: the article's fictional case under the learner's scenario (`guideId`, `blockId`,
  `tried`, `actuals`), a saved plan version (`id`, `version`), or the plan on screen (`inputs`). Only on the person's
  request; a business plan needs access to that business, and its export is recorded.
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
