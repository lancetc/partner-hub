/*
  Adds any seed Job Aid (content/playbooks.ts) the dev database doesn't have yet, through the Hub's own ensurePlaybooks,
  as a draft release in review. Nothing is approved: a Job Aid shows its fallback until Admin → Job Aids approves it.
  Idempotent: aids and source sections already there are left exactly as they are. Run with:

    npx vite-node --config vitest.config.ts scripts/seed-job-aids.ts

  A running dev server seeds on its first request after starting; this is for a server already running when a seed
  was added (for example the Quarterly Budget Check, docs/budget-decision-lab.md).
*/
import path from "node:path";
import { openDb } from "@/server/db";
import { ensurePlaybooks } from "@/server/playbooks";
import { SEED_SNIPPETS } from "@/content/playbooks";

const db = openDb(path.join(process.cwd(), "data", "hub.sqlite"));
const before = new Set((db.prepare("SELECT id FROM playbook_snippets").all() as { id: string }[]).map((r) => r.id));
ensurePlaybooks(db, new Date());
for (const s of SEED_SNIPPETS) console.log(`${before.has(s.id) ? "already there" : "added (in review)"}: ${s.data.title} → ${s.id}`);
