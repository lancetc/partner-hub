import { body, handle } from "@/server/http";
import { builtInUsage, hideBuiltIn } from "@/server/uploads";

/** Which lessons use a built-in picture: `?src=/images/…`. */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  return handle(({ db, user }) => builtInUsage(db, user, src));
}

/** Hide a built-in picture from the library, or bring it back: `{ src, hidden }`. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const b = await body<{ src: string; hidden: boolean }>(req);
    return hideBuiltIn(db, user, String(b.src ?? ""), Boolean(b.hidden), now);
  });
}
