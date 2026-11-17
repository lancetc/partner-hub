import "server-only";
import fs from "node:fs";
import path from "node:path";

/*
  The online demo's starting content. snapshot/ (made by scripts/make-snapshot.mjs and shipped with the
  site) holds a copy of the database with the profile pictures and uploaded files it uses. On a server
  with HUB_SNAPSHOT=on, whose own storage starts empty and is wiped from time to time, a new database
  starts from that copy, and a picture or upload not saved since is read from it. Off everywhere else,
  so this computer and the tests keep their own data.
*/

const on = () => process.env.HUB_SNAPSHOT === "on";
const dir = () => process.env.HUB_SNAPSHOT_DIR ?? path.join(process.cwd(), "snapshot");

/** Starts a new database from the snapshot, when there isn't one yet. */
export function restoreDatabase(file: string) {
  if (!on() || file === ":memory:" || fs.existsSync(file)) return;
  const from = path.join(dir(), "hub.sqlite");
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(from, file);
}

/** A file from the snapshot's copy of a folder ("uploads" or "avatars"), or undefined. */
export function snapshotFile(folder: "uploads" | "avatars", name: string) {
  if (!on() || name !== path.basename(name)) return undefined;
  try {
    return fs.readFileSync(path.join(dir(), folder, name));
  } catch {
    return undefined;
  }
}
