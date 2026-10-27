import { body, handle } from "@/server/http";
import { giphyConfigured, searchGiphy, giphyForCard } from "@/server/giphy";

/** Search GIPHY: `?q=&page=`. With no `q`, what's trending. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return handle(async ({ user }) => {
    if (!giphyConfigured()) return { configured: false, gifs: [], page: 1, total: 0, more: false };
    return { configured: true, ...(await searchGiphy(user, { query: q.get("q") ?? "", page: Number(q.get("page") ?? 1) })) };
  });
}

/** Use a GIF on a card: its still frame, MP4 and credit (shown from GIPHY, not copied). */
export async function POST(req: Request) {
  return handle(async ({ user }) => {
    const { id } = await body<{ id: string }>(req);
    return giphyForCard(user, String(id ?? ""));
  });
}
