/*
  Adds the fifteen Myth vs Reality demonstration entries (content/mythDemoTiles.ts) to the tile library as drafts,
  "Draft – pending compliance approval", through the Hub's own seedMythTiles. Run with:

    npx vite-node --config vitest.config.ts scripts/seed-myth-demo.ts

  Idempotent: each entry has a stable id, and an id already in the library is left exactly as it is, whether or not
  an author has edited it since. Running it again creates nothing. Nothing is approved: learners don't see these.
  Authors see them in the labelled preview on /resources/myths ("Show drafts and demo content").
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { seedMythTiles } from "@/server/myths";
import { DEMO_TILES } from "@/content/mythDemoTiles";

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const { created, kept } = seedMythTiles(db, DEMO_TILES, new Date());
for (const id of created) console.log(`created draft: ${id}`);
for (const k of kept) console.log(`skipped (already there${k.edited ? ", edited since the seed: left alone" : ""}): ${k.id}`);
console.log(`\n${created.length} created, ${kept.length} already there. Nothing approved.`);
