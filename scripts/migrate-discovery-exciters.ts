/*
  Moves the existing Discovery Paths to the Discovery Exciter (docs/discovery-exciter.md): each path's spoken script
  becomes a draft Exciter for an author to review, and its original short description comes back. No audio is made,
  nothing is approved, and nothing is published.

    npx vite-node --config vitest.config.ts scripts/migrate-discovery-exciters.ts            (a dry run, on a copy)
    npx vite-node --config vitest.config.ts scripts/migrate-discovery-exciters.ts --apply    (data/hub.sqlite)

  The dry run makes a copy of the database in the system's temporary folder, migrates the copy, reports, and deletes
  the copy: the real database isn't touched. Safe to run again: a second run changes nothing.
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { syncPublishedLessons } from "@/server/lessonRegistry";
import { migrateDiscoveryExciters } from "@/server/exciterMigration";

const apply = process.argv.includes("--apply");
const real = path.join(process.cwd(), "data", "hub.sqlite");
let file = real;
let copy: string | null = null;
if (!apply) {
  copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hub-exciter-dry-run-")), "hub.sqlite");
  const src = openDb(real);
  // A consistent copy, written-ahead changes included.
  src.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  src.close();
  file = copy;
}

const db = openDb(file);
const author = userById(db, "jordan");
if (!author) throw new Error("The demo author (jordan) isn’t in this database.");
// Published Topics join the catalogue (as they do in the app), so a path's live Topics are known when it's saved.
syncPublishedLessons(db);
const r = migrateDiscoveryExciters(db, author, new Date());

console.log(apply ? "Applied to data/hub.sqlite" : "DRY RUN on a copy (data/hub.sqlite is unchanged). Run with --apply to migrate.");
console.log("");
for (const l of r.lines)
  console.log(
    `${l.applied ? (apply ? "updated " : "would update") : "unchanged"}  ${l.name} (${l.id || "not found"})\n` +
      `    description: ${l.description} · Exciter: ${l.exciter}, ${l.words} words${l.warnings.length ? ` · check: ${l.warnings.join(" ")}` : ""}${l.changed.length ? ` · ALSO CHANGED: ${l.changed.join(", ")}` : ""}`,
  );
console.log("");
console.log(`${apply ? "Paths updated" : "Paths that would be updated"}: ${r.updated}. Already done: ${r.unchanged}.`);
console.log(r.exceptions.length ? `Exceptions needing manual attention (${r.exceptions.length}):\n- ${r.exceptions.join("\n- ")}` : "Exceptions: none.");
console.log("No audio was generated. The Exciters are drafts: approve them and generate audio in Admin › Path introductions.");

db.close();
if (copy) fs.rmSync(path.dirname(copy), { recursive: true, force: true });
