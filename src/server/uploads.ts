import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";

/* Card images, videos and PDFs uploaded by authors. Checked by content, renamed, and stored outside the public folder. */

const DIR = process.env.HUB_UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads");
export const MAX_BYTES = 8 * 1024 * 1024;
/** Short talking-head clips recorded in the editor, or uploaded. */
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
/** PDFs for Resources cards. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  "video/webm": { ext: "webm", magic: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  // MP4 and QuickTime both start with a box size then "ftyp"; "qt  " marks QuickTime.
  "video/quicktime": { ext: "mov", magic: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && b.subarray(8, 12).toString("latin1") === "qt  " },
  "video/mp4": { ext: "mp4", magic: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
};
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|webm|mp4|mov|pdf)$/;

type UploadRow = {
  filename: string;
  original_name: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  uploaded_by: string;
  uploaded_at: string;
  credit: string | null;
};
export type Credit = { name: string; url: string; source: "Pexels"; page?: string };
const publicUrl = (filename: string) => `/api/uploads/${filename}`;
const toItem = (r: UploadRow) => ({
  src: publicUrl(r.filename),
  width: r.width,
  height: r.height,
  name: r.original_name,
  uploadedAt: r.uploaded_at,
  ...(r.credit ? { credit: JSON.parse(r.credit) as Credit } : {}),
});

export async function saveUpload(db: Db, actor: User, file: File, size: { width: number; height: number }, now: Date, credit?: Credit) {
  requireAuthor(actor);
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Choose an image to upload.");
  if (file.size > MAX_VIDEO_BYTES) throw new HttpError(413, "That file is over 80 MB. Try a shorter clip.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Trust the file's bytes, not its name or the browser's label.
  const type = buf.length >= 12 ? Object.entries(TYPES).find(([, t]) => t.magic(buf)) : undefined;
  if (!type) throw new HttpError(415, "Upload a JPEG, PNG, WebP or GIF image, a WebM, MP4 or MOV video, or a PDF.");
  if (type[0].startsWith("image/") && buf.length > MAX_BYTES) throw new HttpError(413, "That image is over 8 MB. Try a smaller copy.");
  const pdf = type[0] === "application/pdf";
  if (pdf && buf.length > MAX_PDF_BYTES) throw new HttpError(413, "That PDF is over 20 MB. Try a smaller copy.");
  // PDFs have no picture size.
  const width = pdf ? 0 : Math.round(Number(size.width));
  const height = pdf ? 0 : Math.round(Number(size.height));
  if (!pdf && !(width > 0 && height > 0 && width < 20000 && height < 20000)) throw new HttpError(400, "Couldn’t read the image size.");
  const filename = `${randomUUID()}.${type[1].ext}`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, filename), buf, { flag: "wx" });
  const name = (file.name || "image").replace(/[^\w .()-]/g, "").slice(0, 120) || "image";
  db.prepare(
    "INSERT INTO uploads (filename, original_name, mime, bytes, width, height, uploaded_by, uploaded_at, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(filename, name, type[0], buf.length, width, height, actor.id, now.toISOString(), credit ? JSON.stringify(credit) : null);
  audit(db, { actor: actor.id, event: "upload.created", entity: `upload:${filename}`, next: { name, bytes: buf.length, type: type[0] }, at: now });
  return { src: publicUrl(filename), width, height, name, bytes: buf.length };
}

export function listUploads(db: Db, actor: User) {
  requireAuthor(actor);
  // The image library lists images; videos are attached to cards as they're recorded.
  return (db.prepare("SELECT * FROM uploads WHERE mime LIKE 'image/%' ORDER BY uploaded_at DESC").all() as UploadRow[]).map(toItem);
}

/** The stored file for a public upload URL, or null. Only names this server generated are ever read. */
export function readUpload(db: Db, filename: string) {
  if (!NAME.test(filename)) return null;
  const row = db.prepare("SELECT * FROM uploads WHERE filename = ?").get(filename) as UploadRow | undefined;
  if (!row) return null;
  try {
    return { body: fs.readFileSync(path.join(DIR, filename)), mime: row.mime, name: row.original_name };
  } catch {
    return null;
  }
}
