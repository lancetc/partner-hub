/*
  Gives these characters a real-world setting ("Background: …" in their look) and makes each a new portrait with
  the Hub's own portrait maker (server/characters makePortrait, OpenAI). The old portraits stay in the image library.
  Run with:  npx vite-node --config vitest.config.ts scripts/regenerate-portraits.ts
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { makePortrait } from "@/server/characters";
import { lookSetting } from "@/lib/characters";

const SETTINGS: Record<string, string> = {
  "elena-marino": "a sunny main street in a coastal Victorian town, shopfronts and a footpath behind her",
  "mele-fonua": "a leafy Queensland suburban street with a timber Queenslander house and a jacaranda tree",
  "nadia-costa": "a harbour waterfront in South Australia, boats and calm water behind her",
  "hana-mitchell": "a client's front garden in an outback town, red earth, a tin-roofed house and a gum tree",
  "sione-taufa": "a driveway in tropical north Queensland, his car and palm trees behind him",
  "claire-hollis": "a country town main street with heritage sandstone buildings and a parked car",
  "ray-donnelly": "a client's back garden in northern Tasmania, vegetable beds, a wheelbarrow and a timber garden shed",
};
// Only these ids, when given (npx vite-node … scripts/regenerate-portraits.ts ray-donnelly); otherwise everyone above.
const only = process.argv.slice(2).filter((a) => a in SETTINGS);

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const author = userById(db, "jordan")!;

for (const [id, background] of Object.entries(SETTINGS).filter(([id]) => !only.length || only.includes(id))) {
  const row = db.prepare("SELECT name, look, portrait FROM characters WHERE id = ?").get(id) as { name: string; look: string; portrait: string } | undefined;
  if (!row) {
    console.log(`✗ ${id}: not in the library`);
    continue;
  }
  const look = `${lookSetting(row.look).look.replace(/\.$/, "")}. Background: ${background}.`;
  db.prepare("UPDATE characters SET look = ?, status = 'generating', error = '', updated_at = ? WHERE id = ?").run(look, new Date().toISOString(), id);
  console.log(`… ${row.name}: making a new portrait`);
  await makePortrait(db, author, id);
  const after = db.prepare("SELECT status, portrait, error FROM characters WHERE id = ?").get(id) as { status: string; portrait: string; error: string };
  console.log(after.status === "ready" && after.portrait !== row.portrait ? `✓ ${row.name}: ${after.portrait}` : `✗ ${row.name}: ${after.status} ${after.error}`);
}
