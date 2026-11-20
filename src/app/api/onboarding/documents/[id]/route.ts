import { handle } from "@/server/http";
import { readDocument } from "@/server/onboarding";

/** A setup document, for the person it's about and the people who review it. Never cached, never public. */
export async function GET(_req: Request, ctx: RouteContext<"/api/onboarding/documents/[id]">) {
  const { id } = await ctx.params;
  return handle(({ db, user, now }) => {
    const doc = readDocument(db, user, id, now);
    return new Response(new Uint8Array(doc.buffer), {
      headers: {
        "content-type": doc.mime,
        "content-disposition": `inline; filename="${doc.name.replace(/[^\w.\- ]/g, "_")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
      },
    });
  });
}
