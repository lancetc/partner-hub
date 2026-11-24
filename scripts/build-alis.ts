/*
  Builds the ALIS course (docs/alis-course.md) from content/alisCourse.ts into the Hub, as drafts, as the demo author:
  19 short-form Topics, three Discovery Paths (one per part, each with a 5-question, 100% path quiz), and one
  long-form Magazine course in three chapters.

    npx vite-node --config vitest.config.ts scripts/build-alis.ts

  Safe to run again: it updates the drafts and creates nothing twice. Nothing is published.
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { buildAlis } from "@/server/alisBuild";
import { syncPublishedLessons } from "@/server/lessonRegistry";

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan");
if (!author) throw new Error("The demo author (jordan) isn’t in this database.");

// Published Topics join the catalogue (as they do in the app), so a part whose Topics are live can still be saved as a path.
syncPublishedLessons(db);
const r = buildAlis(db, author, new Date());
for (const t of r.topics) console.log(`${t.created ? "created" : "updated"} topic: /admin/lessons/${t.slug}/edit`);
for (const p of r.paths) console.log(`${p.created ? "created" : "updated"} Discovery Path: ${p.id} (${p.title})`);
for (const id of r.archived) console.log(`archived old path: ${id}`);
console.log(`${r.guide.created ? "created" : "updated"} Magazine course: /admin/magazine/${r.guide.id} (${r.guide.slug})`);
