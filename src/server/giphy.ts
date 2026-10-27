import "server-only";
import { HttpError, requireAuthor, type User } from "./auth";

/*
  GIPHY GIFs for card visuals. Authors search from the editor. Unlike Pexels photos, GIFs are
  not copied: GIPHY's terms ask for them to be shown from GIPHY, so a card keeps GIPHY's
  still frame and MP4 addresses, plus the credit. Searches are limited to the G rating.
*/

const API = "https://api.giphy.com/v1/gifs";
const PER_PAGE = 24;

type Rendition = { url?: string; width?: string; height?: string; mp4?: string; webp?: string };
type GiphyGif = {
  id: string;
  url: string;
  title?: string;
  alt_text?: string;
  username?: string;
  user?: { display_name?: string; profile_url?: string };
  images: Record<string, Rendition | undefined>;
};

export const giphyConfigured = () => Boolean(process.env.GIPHY_API_KEY);

async function call<T>(pathAndQuery: string, params: URLSearchParams): Promise<T> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new HttpError(503, "GIPHY isn’t connected. Add GIPHY_API_KEY to .env.local and restart the server.");
  params.set("api_key", key);
  let res: Response;
  try {
    res = await fetch(`${API}${pathAndQuery}?${params}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new HttpError(502, "Couldn’t reach GIPHY. Check the connection and try again.");
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "GIPHY didn’t accept the API key.");
  if (res.status === 429) throw new HttpError(429, "Too many GIPHY searches this hour. Try again later.");
  if (res.status === 404) throw new HttpError(404, "That GIF is no longer on GIPHY.");
  if (!res.ok) throw new HttpError(502, "GIPHY didn’t respond properly. Try again.");
  return (await res.json()) as T;
}

/** Only GIPHY's own media addresses are kept on a card. */
export function giphyMedia(url: string | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/^(media\d*|i)\.giphy\.com$/.test(u.hostname)) return null;
    // GIPHY adds tracking parameters (cid, rid, ct); the file is the same without them.
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

const num = (s: string | undefined) => Math.max(1, Math.round(Number(s) || 0));

const credit = (g: GiphyGif) => ({
  name: g.user?.display_name || g.username || "GIPHY",
  url: g.user?.profile_url || g.url,
  source: "GIPHY" as const,
  page: g.url,
});

/** GIPHY titles end in " GIF" and sometimes " by <user>"; neither belongs in alt text. */
const altFor = (g: GiphyGif) => (g.alt_text || g.title || "").replace(/\s+GIF(\s+by\s+.*)?$/i, "").trim();

/** Search results, or what's trending on GIPHY when there's no search yet. */
export async function searchGiphy(actor: User, opts: { query: string; page: number }) {
  requireAuthor(actor);
  const query = opts.query.trim().slice(0, 50);
  const page = Math.max(1, Math.min(20, Math.floor(opts.page) || 1));
  const params = new URLSearchParams({ limit: String(PER_PAGE), offset: String((page - 1) * PER_PAGE), rating: "g" });
  if (query) params.set("q", query);
  if (query) params.set("lang", "en");
  const data = await call<{ data: GiphyGif[]; pagination?: { total_count?: number; count?: number; offset?: number } }>(
    query ? "/search" : "/trending",
    params,
  );
  const gifs = data.data.flatMap((g) => {
    const small = g.images.fixed_width;
    const thumb = giphyMedia(small?.webp ?? small?.url);
    const still = giphyMedia(g.images.fixed_width_still?.url);
    if (!thumb || !still) return [];
    return [{ id: g.id, width: num(small?.width), height: num(small?.height), alt: altFor(g), thumb, still, credit: credit(g) }];
  });
  const p = data.pagination;
  const total = p?.total_count ?? null;
  return { gifs, page, total, more: total !== null ? (p?.offset ?? 0) + (p?.count ?? gifs.length) < Math.min(total, 20 * PER_PAGE) : false };
}

/** One GIF, ready for a card: its still frame (shown first, and to people who turn motion off) and its MP4. */
export async function giphyForCard(actor: User, id: string) {
  requireAuthor(actor);
  if (!/^[A-Za-z0-9]{1,40}$/.test(id)) throw new HttpError(400, "Which GIF?");
  const { data: g } = await call<{ data: GiphyGif }>(`/${id}`, new URLSearchParams());
  const original = g.images.original;
  const still = giphyMedia(g.images.original_still?.url);
  const mp4 = giphyMedia(g.images.original_mp4?.mp4 ?? original?.mp4);
  if (!original || !still || !mp4) throw new HttpError(502, "GIPHY sent an unexpected GIF address.");
  return { src: still, width: num(original.width), height: num(original.height), alt: altFor(g), credit: credit(g), animated: { mp4 } };
}
