import { body, handle } from "@/server/http";
import { importPexels, pexelsConfigured, searchPexels, type Orientation } from "@/server/pexels";

/** Search Pexels: `?q=&page=&orientation=`. With no `q`, Pexels' curated photos. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(async ({ user }) => {
    if (!pexelsConfigured()) return { configured: false, photos: [], page: 1, total: 0, more: false };
    const o = q.get("orientation");
    const orientation = o === "landscape" || o === "portrait" || o === "square" ? (o as Orientation) : undefined;
    return { configured: true, ...(await searchPexels(user, { query: q.get("q") ?? "", page: Number(q.get("page") ?? 1), orientation })) };
  });
}

/** Use a Pexels photo: copies it into the image library and returns it with its credit. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    const { id } = await body<{ id: number }>(req);
    return importPexels(db, user, Number(id), now);
  });
}
