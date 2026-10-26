import "server-only";
import type { Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { saveUpload } from "./uploads";

/*
  Pexels stock photos for card visuals. Authors search from the editor; picking one copies a
  resized version into our own uploads (so cards don't depend on Pexels staying up) and keeps
  the photographer's name for the credit Pexels asks for.
*/

const API = "https://api.pexels.com/v1";
const MAX_SIDE = 1600;

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color: string | null;
  alt: string | null;
  src: { original: string; medium: string; large: string };
};

export const pexelsConfigured = () => Boolean(process.env.PEXELS_API_KEY);

async function call<T>(pathAndQuery: string): Promise<T> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new HttpError(503, "Pexels isn’t connected. Add PEXELS_API_KEY to .env.local and restart the server.");
  let res: Response;
  try {
    res = await fetch(`${API}${pathAndQuery}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new HttpError(502, "Couldn’t reach Pexels. Check the connection and try again.");
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "Pexels didn’t accept the API key.");
  if (res.status === 429) throw new HttpError(429, "Too many Pexels searches this hour. Try again later.");
  if (res.status === 404) throw new HttpError(404, "That photo is no longer on Pexels.");
  if (!res.ok) throw new HttpError(502, "Pexels didn’t respond properly. Try again.");
  return (await res.json()) as T;
}

const credit = (p: PexelsPhoto) => ({ name: p.photographer, url: p.photographer_url, source: "Pexels" as const, page: p.url });

export type Orientation = "landscape" | "portrait" | "square";

/** Search results, or Pexels' curated photos when there's no search yet. */
export async function searchPexels(actor: User, opts: { query: string; page: number; orientation?: Orientation }) {
  requireAuthor(actor);
  const query = opts.query.trim().slice(0, 100);
  const page = Math.max(1, Math.min(50, Math.floor(opts.page) || 1));
  const params = new URLSearchParams({ per_page: "24", page: String(page) });
  if (query) params.set("query", query);
  if (query && opts.orientation) params.set("orientation", opts.orientation);
  const data = await call<{ photos: PexelsPhoto[]; next_page?: string; total_results?: number }>(`/${query ? "search" : "curated"}?${params}`);
  return {
    photos: data.photos.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      alt: p.alt ?? "",
      color: p.avg_color,
      thumb: p.src.medium,
      credit: credit(p),
    })),
    page,
    total: data.total_results ?? null,
    more: Boolean(data.next_page),
  };
}

/** Width and height from a JPEG's frame header. */
export function jpegSize(buf: Uint8Array): { width: number; height: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = (buf[i + 2] << 8) | buf[i + 3];
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (buf[i + 5] << 8) | buf[i + 6], width: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

/** Copies a Pexels photo into our uploads, at most 1600px on its longest side. */
export async function importPexels(db: Db, actor: User, id: number, now: Date) {
  requireAuthor(actor);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Which photo?");
  const p = await call<PexelsPhoto>(`/photos/${id}`);
  const original = new URL(p.src.original);
  if (original.protocol !== "https:" || original.hostname !== "images.pexels.com") throw new HttpError(502, "Pexels sent an unexpected image address.");
  const side = p.width >= p.height ? "w" : "h";
  original.search = new URLSearchParams({ auto: "compress", cs: "tinysrgb", [side]: String(MAX_SIDE) }).toString();
  let res: Response;
  try {
    res = await fetch(original, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch {
    throw new HttpError(502, "Couldn’t download the photo from Pexels. Try again.");
  }
  if (!res.ok) throw new HttpError(502, "Couldn’t download the photo from Pexels. Try again.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const scale = Math.min(1, MAX_SIDE / Math.max(p.width, p.height));
  const size = jpegSize(bytes) ?? { width: Math.round(p.width * scale), height: Math.round(p.height * scale) };
  const name = `Pexels ${p.id} – ${p.photographer}.jpg`;
  const saved = await saveUpload(db, actor, new File([bytes], name, { type: "image/jpeg" }), size, now, credit(p));
  return { src: saved.src, width: saved.width, height: saved.height, alt: p.alt ?? "", credit: credit(p) };
}
