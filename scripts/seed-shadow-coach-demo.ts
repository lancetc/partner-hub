/*
  Creates only the First 100 Days: Shadow & Coach demo article (content/magazineDemos.ts, key "shadow-coach") as a
  draft, through the Hub's own createGuide, as the demo author. Unlike scripts/seed-magazine-demos.ts it touches no
  other demo. Run with:

    npx vite-node --config vitest.config.ts scripts/seed-shadow-coach-demo.ts

  If a live (not archived) guide with the same title exists it's skipped. Nothing is published, and the block ships
  with every sign-off empty.
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { createGuide } from "@/server/magazine";
import { MAGAZINE_DEMOS } from "@/content/magazineDemos";

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan");
if (!author) throw new Error("The demo author (jordan) isn’t in this database.");
const d = MAGAZINE_DEMOS.find((x) => x.key === "shadow-coach");
if (!d) throw new Error("The shadow-coach demo isn’t in content/magazineDemos.ts.");
const existing = db.prepare("SELECT id FROM magazine_guides WHERE title = ? AND status != 'archived'").get(d.title) as { id: string } | undefined;
if (existing) console.log(`skipped (already there): ${d.title} → /admin/magazine/${existing.id}`);
else {
  const g = createGuide(
    db,
    author,
    { title: d.title, standfirst: d.standfirst, cover: d.cover, audience: d.audience, completion: d.completion, doc: d.doc },
    new Date(),
  );
  console.log(`created draft: ${d.title} → /admin/magazine/${g.id}`);
}
