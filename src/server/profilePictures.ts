import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { audit, type Db } from "./db";
import { HttpError, type User } from "./auth";

/*
  Profile pictures: each person can upload a photo of themselves, shown instead of their initials in
  the header, the account menu, Profile and settings and the Community. It's cropped square from the
  centre (turned the right way up first), made 512 pixels across and kept as WebP. Each new picture
  gets a new file name, so nothing shows an old one from a cache; the old file is removed.
*/

const DIR = process.env.HUB_AVATARS_DIR ?? path.join(process.cwd(), "data", "avatars");
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const PICTURE_SIZE = 512;
const NAME = /^[\w-]+\.webp$/;

const current = (db: Db, userId: string) => (db.prepare("SELECT avatar FROM users WHERE id = ?").get(userId) as { avatar: string | null } | undefined)?.avatar ?? null;

/** The address a picture is served from, for showing it. */
export const pictureUrl = (file: string | null) => (file ? `/api/avatars/${file}` : null);

function removeFile(file: string | null) {
  if (!file || !NAME.test(file)) return;
  try {
    fs.unlinkSync(path.join(DIR, file));
  } catch {
    // Already gone.
  }
}

/** Saves a new picture for the signed-in person and returns its address. */
export async function setPicture(db: Db, user: User, file: File, now: Date) {
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Choose a picture to upload.");
  if (file.size > MAX_PICTURE_BYTES) throw new HttpError(413, "That picture is over 10 MB. Try a smaller one.");
  const input = Buffer.from(await file.arrayBuffer());
  let data: Buffer;
  try {
    data = await sharp(input, { limitInputPixels: 12000 * 12000 })
      .rotate()
      .resize(PICTURE_SIZE, PICTURE_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new HttpError(415, "That file couldn’t be read as a picture. Try a JPEG, PNG or WebP photo.");
  }
  fs.mkdirSync(DIR, { recursive: true });
  const name = `${user.id.replace(/[^\w-]/g, "")}-${randomBytes(6).toString("hex")}.webp`;
  fs.writeFileSync(path.join(DIR, name), data);
  const old = current(db, user.id);
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(name, user.id);
  removeFile(old);
  audit(db, { actor: user.id, event: "profile.picture", entity: `user:${user.id}`, at: now });
  return { avatar: pictureUrl(name) };
}

/** Back to initials. */
export function removePicture(db: Db, user: User, now: Date) {
  const old = current(db, user.id);
  db.prepare("UPDATE users SET avatar = NULL WHERE id = ?").run(user.id);
  removeFile(old);
  audit(db, { actor: user.id, event: "profile.picture.removed", entity: `user:${user.id}`, at: now });
  return { avatar: null };
}

/** The picture's bytes, for serving. Undefined for a name that isn't one of ours or a file that's gone. */
export function readPicture(file: string) {
  if (!NAME.test(file)) return undefined;
  try {
    return fs.readFileSync(path.join(DIR, file));
  } catch {
    return undefined;
  }
}
