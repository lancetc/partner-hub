import { body, handle } from "@/server/http";
import { setNewsletters } from "@/server/campaigns";

/**
  One-click unsubscribe from newsletters (also the List-Unsubscribe-Post target that mail apps use).
  Works from the link alone; no sign-in needed.
*/
export async function POST(req: Request) {
  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";
  // Mail apps post "List-Unsubscribe=One-Click" as a form with the token in the link.
  const fromLink = url.searchParams.get("t");
  return handle(async ({ db, now }) => {
    if (fromLink && !type.includes("json")) return setNewsletters(db, fromLink, false, now);
    const b = await body<{ token: string; subscribe?: boolean }>(req);
    return setNewsletters(db, b.token, Boolean(b.subscribe), now);
  });
}
