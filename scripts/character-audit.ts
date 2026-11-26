/*
  The character audit (docs/character-photos.md, "People in your content"): every named fictional person in the live
  Topics and Magazine courses, matched against the character library. Read-only: the database is opened read-only, and
  nothing is added, changed or generated. Costs nothing.
  Run with:  npx vite-node --config vitest.config.ts scripts/character-audit.ts [--all] [--json out.json]
  --all also lists people already in the library with a portrait.
*/
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { auditPeople } from "@/server/peopleInContent";

const args = process.argv.slice(2);
const file = process.env.HUB_DB_PATH ?? path.join(process.cwd(), "data", "hub.sqlite");
const db = new DatabaseSync(file, { readOnly: true });
const a = auditPeople(db);

const where = (p: (typeof a.people)[number]) =>
  p.where
    .slice(0, 4)
    .map((w) => `${w.kind === "topic" ? "Topic" : "Course"} ${w.slug}`)
    .join("; ") + (p.where.length > 4 ? `; and ${p.where.length - 4} more` : "");

console.log(`Read ${a.topics} Topics and ${a.courses} Magazine courses (drafts and published).`);
console.log(
  `${a.counts.found} people: ${a.counts.ready} in the library with a portrait, ${a.counts.noPortrait} in it without one, ${a.counts.missing} not in it` +
    `, ${a.counts.hidden} hidden, ${a.counts.dismissed} dismissed.`,
);
console.log(
  `Portraits that could be made now (the content says man or woman): ${a.cost.portraits}, about US$${a.cost.total.toFixed(2)} at US$${a.cost.each.toFixed(2)} each. ` +
    `${a.counts.needsDescription} need a description first.`,
);
for (const state of ["missing", "no-portrait", ...(args.includes("--all") ? ["ready", "hidden", "dismissed"] : [])] as const) {
  const list = a.people.filter((p) => p.state === state);
  if (!list.length) continue;
  console.log(`\n== ${state === "missing" ? "Not in the library" : state === "no-portrait" ? "In the library, no portrait" : state} (${list.length})`);
  for (const p of list)
    console.log(
      `- ${p.name}${p.aliases.length ? ` (also ${p.aliases.join(", ")})` : ""} | ${p.gender} | ${p.role} | ${p.evidence.join(",")} | ${where(p)}\n    “${p.quote}”`,
    );
}
const out = args.indexOf("--json");
if (out >= 0 && args[out + 1]) fs.writeFileSync(args[out + 1], JSON.stringify(a, null, 2));
