import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";
import { call as pexelsCall, pexelsConfigured } from "./pexels";
import { checkBackground, parseBackground, UPLOAD_NAME, uploadSmallName, type Background, type PexelsChoice } from "@/lib/background";

/*
  Each person's background behind the main pages (lib/background has the choices and the checks).
  Uploaded photos are turned the right way up and kept as two WebPs: one up to 2560 pixels on its
  longest side for large screens, and one up to 1280 for phones. Each upload gets a new file name,
  and the previous upload's files go when it's replaced. Stock photos come from Pexels and are shown
  straight from Pexels' servers, sized for the screen, with the photographer credited.
*/

const DIR = process.env.HUB_BACKGROUNDS_DIR ?? path.join(process.cwd(), "data", "backgrounds");
export const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024;
export const LARGE_SIDE = 2560;
export const SMALL_SIDE = 1280;

/** Someone's background, or the default if they haven't chosen one. */
export function backgroundFor(db: Db, userId: string): Background {
  const row = db.prepare("SELECT background FROM users WHERE id = ?").get(userId) as { background: string | null } | undefined;
  return parseBackground(row?.background);
}

function removeUpload(bg: Background) {
  if (bg.kind !== "upload" || !UPLOAD_NAME.test(bg.file)) return;
  for (const file of [bg.file, uploadSmallName(bg.file)]) {
    try {
      fs.unlinkSync(path.join(/*turbopackIgnore: true*/ DIR, file));
    } catch {
      // Already gone.
    }
  }
}

function save(db: Db, user: User, next: Background, now: Date) {
  const previous = backgroundFor(db, user.id);
  db.prepare("UPDATE users SET background = ? WHERE id = ?").run(JSON.stringify(next), user.id);
  if (previous.kind === "upload" && !(next.kind === "upload" && next.file === previous.file)) removeUpload(previous);
  audit(db, { actor: user.id, event: "profile.background", entity: `user:${user.id}`, next: { kind: next.kind }, at: now });
  return { background: next };
}

/** Saves a colour, a Pexels photo or no background. */
export function setBackground(db: Db, user: User, input: unknown, now: Date) {
  const checked = checkBackground(input);
  if (!checked.ok) throw new HttpError(400, checked.error);
  return save(db, user, checked.value, now);
}

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Saves an uploaded photo as the background. */
export async function uploadBackground(db: Db, user: User, file: File, now: Date) {
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Choose a photo to upload.");
  if (file.size > MAX_BACKGROUND_BYTES) throw new HttpError(413, "That photo is over 15 MB. Try a smaller one.");
  const input = Buffer.from(await file.arrayBuffer());
  let large: { data: Buffer; info: OutputInfo };
  let small: Buffer;
  let color: string | null = null;
  try {
    const image = () => sharp(input, { limitInputPixels: 20000 * 20000 }).rotate();
    large = await image().resize({ width: LARGE_SIDE, height: LARGE_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer({ resolveWithObject: true });
    small = await image().resize({ width: SMALL_SIDE, height: SMALL_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
    const { dominant } = await sharp(small).stats();
    color = `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
  } catch {
    throw new HttpError(415, "That file couldn’t be read as a photo. Try a JPEG, PNG or WebP.");
  }
  fs.mkdirSync(DIR, { recursive: true });
  const name = `${user.id.replace(/[^\w-]/g, "")}-${randomBytes(6).toString("hex")}.webp`;
  fs.writeFileSync(path.join(DIR, name), large.data);
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ DIR, uploadSmallName(name)), small);
  return save(db, user, { kind: "upload", file: name, width: large.info.width, height: large.info.height, color }, now);
}

/** An uploaded background's bytes, for serving. Undefined for a name that isn't one of ours or a file that's gone. */
export function readBackground(file: string) {
  if (!UPLOAD_NAME.test(file)) return undefined;
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ DIR, file));
  } catch {
    return undefined;
  }
}

/*
  The built-in set: calm, mostly Australian landscapes, chosen from Pexels. Shown first in the picker,
  and the only photos when there's no PEXELS_API_KEY (searching needs the key).
*/
const photo = (id: number, width: number, height: number, color: string, photographer: string, handle: string, slug: string, alt: string): PexelsChoice => ({
  kind: "pexels",
  id,
  src: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`,
  width,
  height,
  color,
  alt,
  photographer,
  photographerUrl: `https://www.pexels.com/@${handle}`,
  pageUrl: `https://www.pexels.com/photo/${slug}-${id}/`,
});

export const CURATED_PHOTOS: PexelsChoice[] = [
  photo(1318500, 3968, 2976, "#637676", "Damon Hall", "damodigital", "aerial-photo-of-white-sandy-beach-during-the-day", "Aerial view of the rocky shoreline at Currumbin Beach, Queensland"),
  photo(12354525, 6000, 4000, "#585C41", "Gis photography", "gis-photography-73329568", "trees-in-the-forest", "Eucalyptus trees in a summer forest"),
  photo(31434495, 3840, 2560, "#466B7B", "Anton Massalov", "antonhansenphotography", "serene-ocean-horizon-under-clear-blue-sky", "A calm ocean horizon under a clear blue sky"),
  photo(5321520, 6016, 4000, "#76766A", "Ravi Kant", "ravikant", "foggy-forest", "Tall trees in a misty forest"),
  photo(31497132, 7728, 5152, "#C4AD8E", "Hami Durgut", "hamidurgut", "tranquil-sky-at-sunrise-with-soft-clouds", "Soft clouds in golden sunrise light"),
  photo(24700962, 3888, 2592, "#4C5864", "Walter Coppola", "waltc", "beautiful-beach-against-seascape", "The rocky coast at Cape Paterson, Victoria"),
  photo(5738357, 4032, 3024, "#526377", "Austin Cooper", "austin-cooper-3865095", "lake-near-the-mountains-under-the-blue-sky", "A mountain lake with forest reflections"),
  photo(5349603, 5200, 3467, "#7B7E68", "Magda Ehlers", "magda-ehlers-pexels", "flower-field-near-hills-under-the-blue-sky", "Spring wildflowers beneath hills and a blue sky"),
  photo(32915492, 3982, 2240, "#876E5A", "Mark Direen", "mark-direen-622749", "aerial-view-of-the-rugged-australian-outback", "A dirt road across the Australian outback from above"),
  photo(14013575, 5184, 3888, "#43492F", "Ana Mai", "ana-mai-1144537", "sunbeam-in-jungle", "Sunbeams through a rainforest canopy"),
];

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color: string | null;
  alt: string | null;
  src: { original: string };
};

/** Turns a Pexels API photo into a choice, or null if anything about it doesn't check out. */
export function fromPexels(p: PexelsPhoto): PexelsChoice | null {
  const checked = checkBackground({
    kind: "pexels",
    id: p.id,
    src: p.src.original,
    width: p.width,
    height: p.height,
    color: p.avg_color,
    alt: p.alt ?? "",
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pageUrl: p.url,
  });
  return checked.ok && checked.value.kind === "pexels" ? checked.value : null;
}

/** Photos for the picker: the built-in set when there's no search, otherwise a Pexels search. */
export async function backgroundPhotos(opts: { query: string; page: number }) {
  const configured = pexelsConfigured();
  const query = opts.query.trim().slice(0, 100);
  if (!query) return { photos: CURATED_PHOTOS, configured, query, page: 1, more: false };
  if (!configured) return { photos: [], configured, query, page: 1, more: false };
  const page = Math.max(1, Math.min(50, Math.floor(opts.page) || 1));
  const params = new URLSearchParams({ query, orientation: "landscape", per_page: "18", page: String(page) });
  const data = await pexelsCall<{ photos: PexelsPhoto[]; next_page?: string }>(`/search?${params}`);
  return { photos: data.photos.map(fromPexels).filter((p): p is PexelsChoice => p !== null), configured, query, page, more: Boolean(data.next_page) };
}
