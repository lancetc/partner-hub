/*
  Makes snapshot/: a copy of this computer's content (data/hub.sqlite) for the online demo, with the
  profile pictures and the uploaded files the current content uses. On a server with HUB_SNAPSHOT=on, a
  new database starts from this copy, and pictures and uploads are read from it (src/server/snapshot.ts).

  Run with: node scripts/make-snapshot.mjs
  Then commit snapshot/ and push. Everything in it is visible to anyone who can open the demo.
*/
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const data = path.join(root, "data");
const out = path.join(root, "snapshot");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "uploads"), { recursive: true });
fs.mkdirSync(path.join(out, "avatars"), { recursive: true });

// The database, without its history: the change log, request keys, scheduler runs and unsent emails.
const target = path.join(out, "hub.sqlite");
new DatabaseSync(path.join(data, "hub.sqlite"), { readOnly: true }).exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
const db = new DatabaseSync(target);
for (const t of ["audit", "idempotency", "worker_runs", "outbox"]) db.exec(`DELETE FROM "${t}"`);
db.exec("VACUUM");

// Uploaded files the current content uses (not the whole library, nor old versions of lessons).
const NAME = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|gif|webm|mp4|mov|pdf)/g;
const skip = new Set(["audit", "uploads", "lesson_versions"]);
const used = new Set();
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
  if (skip.has(name)) continue;
  for (const row of db.prepare(`SELECT * FROM "${name}"`).all())
    for (const v of Object.values(row)) if (typeof v === "string") for (const m of v.match(NAME) ?? []) used.add(m);
}
db.close();
let files = 0;
let bytes = 0;
for (const f of used) {
  const from = path.join(data, "uploads", f);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(out, "uploads", f));
  files++;
  bytes += fs.statSync(from).size;
}

// Profile pictures.
const avatars = path.join(data, "avatars");
const pictures = fs.existsSync(avatars) ? fs.readdirSync(avatars).filter((f) => f.endsWith(".webp")) : [];
for (const f of pictures) fs.copyFileSync(path.join(avatars, f), path.join(out, "avatars", f));

const mb = (n) => (n / 1e6).toFixed(1);
console.log(`snapshot/: database ${mb(fs.statSync(target).size)} MB, ${files} uploads (${mb(bytes)} MB), ${pictures.length} profile pictures`);
