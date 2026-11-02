import "server-only";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { lessons as contentLessons } from "@/content/lessons";
import { toWebp } from "./imageCompress";
import { refreshPublishedLessons } from "./lessonRegistry";

/* Card images, videos and PDFs uploaded by authors. Checked by content, renamed, and stored outside the public folder. */

const DIR = process.env.HUB_UPLOADS_DIR ?? path.join(process.cwd(), "data", "uploads");
/** Largest image accepted; it's compressed to WebP (see imageCompress.ts), so what's stored is much smaller. */
export const MAX_BYTES = 25 * 1024 * 1024;
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
  deleted_at?: string | null;
  deleted_by?: string | null;
  replaced_by?: string | null;
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

const hashOf = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
function fileHash(filename: string) {
  try {
    return hashOf(fs.readFileSync(path.join(DIR, filename)));
  } catch {
    return null;
  }
}

/** Pictures in the library (not deleted, not replaced). */
const libraryImages = (db: Db) =>
  db.prepare("SELECT * FROM uploads WHERE mime LIKE 'image/%' AND deleted_at IS NULL AND replaced_by IS NULL ORDER BY uploaded_at").all() as UploadRow[];

/** A picture already in the library with exactly these bytes. Only files of the same size are read. */
function sameUpload(db: Db, buf: Buffer) {
  const want = hashOf(buf);
  return libraryImages(db).find((r) => r.bytes === buf.length && fileHash(r.filename) === want);
}

export async function saveUpload(db: Db, actor: User, file: File, size: { width: number; height: number }, now: Date, credit?: Credit) {
  requireAuthor(actor);
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Choose an image to upload.");
  if (file.size > MAX_VIDEO_BYTES) throw new HttpError(413, "That file is over 80 MB. Try a shorter clip.");
  let buf = Buffer.from(await file.arrayBuffer());
  // Trust the file's bytes, not its name or the browser's label.
  const detected = buf.length >= 12 ? Object.entries(TYPES).find(([, t]) => t.magic(buf)) : undefined;
  if (!detected) throw new HttpError(415, "Upload a JPEG, PNG, WebP or GIF image, a WebM, MP4 or MOV video, or a PDF.");
  let [mime, { ext }] = detected;
  if (mime.startsWith("image/") && buf.length > MAX_BYTES) throw new HttpError(413, "That image is over 25 MB. Try a smaller copy.");
  const pdf = mime === "application/pdf";
  if (pdf && buf.length > MAX_PDF_BYTES) throw new HttpError(413, "That PDF is over 20 MB. Try a smaller copy.");
  // PDFs have no picture size.
  let width = pdf ? 0 : Math.round(Number(size.width));
  let height = pdf ? 0 : Math.round(Number(size.height));
  let name = (file.name || "image").replace(/[^\w .()-]/g, "").slice(0, 120) || "image";
  // Photos and pictures are stored as compressed WebP; GIFs may be animated, so they're kept as they are.
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    try {
      const small = await toWebp(buf);
      buf = small.data;
      ({ width, height } = small);
    } catch {
      throw new HttpError(415, "Couldn’t read that image. Try saving it again as a JPEG or PNG.");
    }
    mime = "image/webp";
    ext = "webp";
    name = name.replace(/\.(jpe?g|png|webp)$/i, "") + ".webp";
  }
  if (!pdf && !(width > 0 && height > 0 && width < 20000 && height < 20000)) throw new HttpError(400, "Couldn’t read the image size.");
  // The same picture uploaded again: use the copy already in the library rather than adding another.
  if (mime.startsWith("image/")) {
    const same = sameUpload(db, buf);
    if (same) {
      if (credit && !same.credit) db.prepare("UPDATE uploads SET credit = ? WHERE filename = ?").run(JSON.stringify(credit), same.filename);
      return { src: publicUrl(same.filename), width: same.width, height: same.height, name: same.original_name, bytes: same.bytes };
    }
  }
  const filename = `${randomUUID()}.${ext}`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, filename), buf, { flag: "wx" });
  db.prepare(
    "INSERT INTO uploads (filename, original_name, mime, bytes, width, height, uploaded_by, uploaded_at, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(filename, name, mime, buf.length, width, height, actor.id, now.toISOString(), credit ? JSON.stringify(credit) : null);
  audit(db, { actor: actor.id, event: "upload.created", entity: `upload:${filename}`, next: { name, bytes: buf.length, type: mime }, at: now });
  return { src: publicUrl(filename), width, height, name, bytes: buf.length };
}

export function listUploads(db: Db, actor: User) {
  requireAuthor(actor);
  // The image library lists images; videos are attached to cards as they're recorded.
  return (
    db.prepare("SELECT * FROM uploads WHERE mime LIKE 'image/%' AND deleted_at IS NULL AND replaced_by IS NULL ORDER BY uploaded_at DESC").all() as UploadRow[]
  ).map(toItem);
}

/** The stored file for a public upload URL, or null. Only names this server generated are ever read. */
export function readUpload(db: Db, filename: string) {
  if (!NAME.test(filename)) return null;
  const row = db.prepare("SELECT * FROM uploads WHERE filename = ?").get(filename) as UploadRow | undefined;
  if (!row) return null;
  // Converted to WebP: the old address serves the new file (one step, so it can never loop).
  if (row.replaced_by && row.replaced_by !== filename) {
    const next = db.prepare("SELECT * FROM uploads WHERE filename = ?").get(row.replaced_by) as UploadRow | undefined;
    if (next) return readFile(next);
  }
  return readFile(row);
}

function readFile(row: UploadRow) {
  try {
    return { body: fs.readFileSync(path.join(DIR, row.filename)), mime: row.mime, name: row.original_name };
  } catch {
    return null;
  }
}

function uploadRow(db: Db, filename: string) {
  const row = NAME.test(filename) ? (db.prepare("SELECT * FROM uploads WHERE filename = ?").get(filename) as UploadRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That image isn’t in the library.");
  return row;
}

/** Lessons whose saved draft or live version uses an upload, so the author knows before deleting it. */
export function uploadUsage(db: Db, actor: User, filename: string) {
  requireAuthor(actor);
  uploadRow(db, filename);
  return { lessons: lessonsUsing(db, publicUrl(filename)) };
}

/** Lessons whose saved draft or live version mentions an image address: edited lessons, and lessons from the content files nobody has edited. */
function lessonsUsing(db: Db, src: string) {
  const like = `%${src}%`;
  const rows = db
    .prepare("SELECT slug, draft FROM authored_lessons WHERE deleted_at IS NULL AND (draft LIKE ? OR published LIKE ?) ORDER BY slug")
    .all(like, like) as { slug: string; draft: string }[];
  const edited = new Set((db.prepare("SELECT slug FROM authored_lessons").all() as { slug: string }[]).map((r) => r.slug));
  return [
    ...rows.map((r) => ({ slug: r.slug, title: (JSON.parse(r.draft) as { title?: string }).title || r.slug })),
    ...contentLessons.filter((l) => !edited.has(l.slug) && JSON.stringify(l).includes(src)).map((l) => ({ slug: l.slug, title: l.title })),
  ];
}

/**
  Deletes an image from the library. The file itself is kept, so any card still using it keeps
  showing it, and the delete can be undone.
*/
export function deleteUpload(db: Db, actor: User, filename: string, now: Date) {
  requireAuthor(actor);
  const row = uploadRow(db, filename);
  if (row.deleted_at) return { ok: true };
  db.prepare("UPDATE uploads SET deleted_at = ?, deleted_by = ? WHERE filename = ?").run(now.toISOString(), actor.id, filename);
  audit(db, { actor: actor.id, event: "upload.deleted", entity: `upload:${filename}`, previous: { name: row.original_name }, at: now });
  return { ok: true };
}

export function restoreUpload(db: Db, actor: User, filename: string, now: Date) {
  requireAuthor(actor);
  uploadRow(db, filename);
  db.prepare("UPDATE uploads SET deleted_at = NULL, deleted_by = NULL WHERE filename = ?").run(filename);
  audit(db, { actor: actor.id, event: "upload.restored", entity: `upload:${filename}`, at: now });
  return { ok: true };
}

/** Images deleted from the library, newest first, so they can be brought back. */
export function deletedUploads(db: Db, actor: User) {
  requireAuthor(actor);
  return (
    db
      .prepare("SELECT * FROM uploads WHERE mime LIKE 'image/%' AND deleted_at IS NOT NULL AND replaced_by IS NULL ORDER BY deleted_at DESC")
      .all() as UploadRow[]
  ).map(toItem);
}

/*
  The built-in pictures ship with the hub (public/images). They can't be removed, but an author can
  hide them from the library; lessons already using one keep showing it.
*/
const BUILT_IN = /^\/images\/[\w.-]+\.(jpe?g|png|webp|gif)$/;
const HIDDEN_KEY = "library_hidden_builtins";

export function hiddenBuiltIns(db: Db): string[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(HIDDEN_KEY) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as string[]) : [];
}

function checkBuiltIn(src: string) {
  if (!BUILT_IN.test(src)) throw new HttpError(404, "That picture isn’t one of the built-in pictures.");
}

export function builtInUsage(db: Db, actor: User, src: string) {
  requireAuthor(actor);
  checkBuiltIn(src);
  return { lessons: lessonsUsing(db, src) };
}

export function hideBuiltIn(db: Db, actor: User, src: string, hidden: boolean, now: Date) {
  requireAuthor(actor);
  checkBuiltIn(src);
  const list = hiddenBuiltIns(db).filter((s) => s !== src);
  if (hidden) list.push(src);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(HIDDEN_KEY, JSON.stringify(list));
  audit(db, { actor: actor.id, event: hidden ? "library.builtin_hidden" : "library.builtin_restored", entity: `image:${src}`, at: now });
  return { hiddenBuiltIns: list };
}

/** Swap a picture's address (and size) for the new one throughout a lesson. */
function swapPicture(value: unknown, from: string, to: { src: string; width: number; height: number }): unknown {
  if (typeof value === "string") return value.includes(from) ? value.split(from).join(to.src) : value;
  if (Array.isArray(value)) return value.map((v) => swapPicture(v, from, to));
  if (value && typeof value === "object") {
    const o = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapPicture(v, from, to)])) as Record<string, unknown>;
    // A picture object: keep its crop and position, take the new picture's size.
    if (o.src === to.src && typeof o.width === "number" && typeof o.height === "number") Object.assign(o, { width: to.width, height: to.height });
    return o;
  }
  return value;
}

/**
  Every use of the picture at `from` now points at `to`: each lesson's saved draft and live version
  (without needing a publish), and any other record that names it. Earlier versions in a lesson's
  history are left as they were; their old address keeps working through `replaced_by`.
*/
function pointUsesAt(db: Db, from: string, to: { src: string; width: number; height: number }) {
  const lessons: string[] = [];
  const like = `%${from}%`;
  for (const r of db.prepare("SELECT slug, draft, published FROM authored_lessons WHERE draft LIKE ? OR published LIKE ?").all(like, like) as {
    slug: string;
    draft: string;
    published: string | null;
  }[]) {
    const draft = JSON.stringify(swapPicture(JSON.parse(r.draft), from, to));
    const published = r.published ? JSON.stringify(swapPicture(JSON.parse(r.published), from, to)) : null;
    db.prepare("UPDATE authored_lessons SET draft = ?, published = ? WHERE slug = ?").run(draft, published, r.slug);
    lessons.push((JSON.parse(draft) as { title?: string }).title || r.slug);
  }
  // Other records that name the picture: the presenter face, AI pictures and videos, translations.
  const skip = new Set(["uploads", "audit", "idempotency", "authored_lessons", "lesson_versions"]);
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]) {
    if (skip.has(name)) continue;
    for (const c of (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string }[]).filter((c) => /TEXT/i.test(c.type))) {
      db.prepare(`UPDATE "${name}" SET "${c.name}" = replace("${c.name}", ?, ?) WHERE "${c.name}" LIKE ?`).run(from, to.src, like);
    }
  }
  return lessons;
}

/**
  Replaces a picture in the library with a new file, everywhere it's used: every lesson's saved draft
  and live version (without needing a publish), the presenter face and other records. The old address
  keeps working too (it shows the new picture), so nothing that still points at it breaks. Earlier
  versions in a lesson's history are left as they were.
*/
export async function replaceUpload(db: Db, actor: User, filename: string, file: File, size: { width: number; height: number }, now: Date) {
  requireAuthor(actor);
  const old = uploadRow(db, filename);
  if (!old.mime.startsWith("image/")) throw new HttpError(400, "Only pictures can be replaced here.");
  if (!file?.type?.startsWith?.("image/")) throw new HttpError(415, "Choose a picture to replace it with.");
  const saved = await saveUpload(db, actor, file, size, now);
  const next = saved.src.split("/").pop()!;
  const from = publicUrl(filename);
  const to = { src: saved.src, width: saved.width, height: saved.height };
  // The old file, and any earlier pictures it had replaced, now show the new one.
  db.prepare("UPDATE uploads SET replaced_by = ? WHERE filename = ? OR replaced_by = ?").run(next, filename, filename);
  // It takes the old one's place in the library, including whether it was deleted.
  db.prepare("UPDATE uploads SET deleted_at = ?, deleted_by = ? WHERE filename = ?").run(
    old.deleted_at ?? null,
    old.deleted_at ? (old.deleted_by ?? null) : null,
    next,
  );

  const lessons = pointUsesAt(db, from, to);
  refreshPublishedLessons(db);
  audit(db, { actor: actor.id, event: "upload.replaced", entity: `upload:${filename}`, next: { by: next, lessons: lessons.length }, at: now });
  return { ...to, name: saved.name, lessons };
}

/**
  Identical copies of the same picture: keeps one in the library and points every use of the others at
  it. The copy kept is the one used most (then the oldest). The others leave the library, but their
  addresses keep showing the picture, so nothing that still names them breaks.
*/
export function mergeDuplicateUploads(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const groups = new Map<string, UploadRow[]>();
  for (const r of libraryImages(db)) {
    const h = fileHash(r.filename);
    if (h) groups.set(h, [...(groups.get(h) ?? []), r]);
  }
  const uses = (r: UploadRow) =>
    (db.prepare("SELECT COUNT(*) n FROM authored_lessons WHERE draft LIKE ? OR published LIKE ?").get(`%${r.filename}%`, `%${r.filename}%`) as { n: number }).n;
  let merged = 0;
  const lessons = new Set<string>();
  const kept: { name: string; copies: number }[] = [];
  const swaps: { from: string; to: { src: string; width: number; height: number } }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [keep, ...rest] = group
      .map((r) => ({ r, n: uses(r) }))
      .sort((a, b) => b.n - a.n || a.r.uploaded_at.localeCompare(b.r.uploaded_at))
      .map((x) => x.r);
    const to = { src: publicUrl(keep.filename), width: keep.width, height: keep.height };
    for (const dup of rest) {
      for (const t of pointUsesAt(db, publicUrl(dup.filename), to)) lessons.add(t);
      swaps.push({ from: publicUrl(dup.filename), to });
      db.prepare("UPDATE uploads SET replaced_by = ? WHERE filename = ? OR replaced_by = ?").run(keep.filename, dup.filename, dup.filename);
      // A stock photo's credit travels with the copy that's kept.
      if (!keep.credit && dup.credit) {
        db.prepare("UPDATE uploads SET credit = ? WHERE filename = ?").run(dup.credit, keep.filename);
        keep.credit = dup.credit;
      }
      merged++;
    }
    kept.push({ name: keep.original_name, copies: group.length });
  }
  if (merged) {
    refreshPublishedLessons(db);
    audit(db, {
      actor: actor.id,
      event: "upload.duplicates_merged",
      entity: "uploads",
      next: { pictures: kept.length, copies: merged, lessons: lessons.size },
      at: now,
    });
  }
  return { pictures: kept.length, removed: merged, lessons: [...lessons].sort(), kept, swaps };
}
