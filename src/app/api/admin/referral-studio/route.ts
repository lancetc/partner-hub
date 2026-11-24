import { body, handle } from "@/server/http";
import { HttpError } from "@/server/auth";
import { studioAdmin, studioWorkbook } from "@/server/referralStudio";
import { setClaimStatus, setTemplateStatus } from "@/server/referralClaims";

/**
  For authors and content owners: the claim register, the kit template's approval, and the three layers (practice,
  approved material use, referral pathway) as aggregates with denominators. ?export=1 downloads the workbook (logged).
*/
export async function GET(req: Request) {
  const exporting = new URL(req.url).searchParams.get("export");
  return handle(({ db, user, now }) => {
    if (!exporting) return studioAdmin(db, user, now);
    const out = studioWorkbook(db, user, now);
    return new Response(new Uint8Array(out.bytes), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${out.file}"`,
        "cache-control": "no-store",
      },
    });
  });
}

/** An owner records a claim's status, or the template's approval. Both are audited. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const input = await body<Record<string, unknown>>(req);
    if (input.action === "claim") return setClaimStatus(db, user, input, now);
    if (input.action === "template") return setTemplateStatus(db, user, input, now);
    throw new HttpError(400, "Unknown action.");
  });
}
