import { handle } from "@/server/http";
import { registerCsv } from "@/server/complianceRegister";

/** The compliance register as a spreadsheet: every topic on it, or one with ?topic=<slug>. */
export async function GET(req: Request) {
  const topic = new URL(req.url).searchParams.get("topic") ?? undefined;
  return handle(({ db, user, now }) => {
    const filename = `compliance-register-${topic ?? "all-topics"}-${now.toISOString().slice(0, 10)}.csv`;
    return new Response(registerCsv(db, user, now, topic), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
    });
  });
}
