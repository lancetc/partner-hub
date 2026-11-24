/*
  Creates the demonstration Magazine articles (content/magazineDemos.ts) as drafts, through the Hub's own createGuide,
  as the demo author. Run with:

    npx vite-node --config vitest.config.ts scripts/seed-magazine-demos.ts

  A title that already has a live (not archived) guide is skipped, so running it again doesn't duplicate anything.
  Nothing is published: each one is reviewed and published from the Magazine editor.
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { createGuide } from "@/server/magazine";
import { MAGAZINE_DEMOS } from "@/content/magazineDemos";

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan");
if (!author) throw new Error("The demo author (jordan) isn’t in this database.");

const now = new Date();
for (const d of MAGAZINE_DEMOS) {
  const existing = db.prepare("SELECT id FROM magazine_guides WHERE title = ? AND status != 'archived'").get(d.title) as { id: string } | undefined;
  if (existing) {
    console.log(`skipped (already there): ${d.title} → ${existing.id}`);
    continue;
  }
  const g = createGuide(
    db,
    author,
    { title: d.title, standfirst: d.standfirst, cover: d.cover, audience: d.audience, completion: d.completion, doc: d.doc },
    now,
  );
  console.log(`created draft: ${d.title} → /admin/magazine/${g.id}`);
}
