/*
  The Activity Catalogue audit (docs/activity-catalogue-audit.md): the live inventory, as Markdown, from the code's
  catalogue and a snapshot of the Hub's database. Read-only: the database is copied (VACUUM INTO, which only reads it) to
  a temporary file and the audit runs on the copy, so nothing in data/hub.sqlite changes. Calls no AI service; costs nothing.

  Run with:  npx vite-node --config vitest.config.ts scripts/activity-audit.ts [--out file.md]
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDb } from "@/server/db";
import { userById } from "@/server/auth";
import { syncPublishedLessons } from "@/server/lessonRegistry";
import { activityInventory } from "@/server/activityCatalogue";
import { ACTIVITY_KINDS, AI_MODES, APPROVAL, CHECKS, SURFACES, type CheckKey } from "@/lib/activityCatalogue";

const args = process.argv.slice(2);
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const source = process.env.HUB_DB_PATH ?? path.join(process.cwd(), "data", "hub.sqlite");
const copy = path.join(os.tmpdir(), `hub-activity-audit-${process.pid}.sqlite`);
if (fs.existsSync(copy)) fs.rmSync(copy);
new DatabaseSync(source, { readOnly: true }).exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
const db = openDb(copy);
syncPublishedLessons(db);
const inv = activityInventory(db, userById(db, "jordan")!, new Date());

const S = { yes: "yes", partial: "partly", no: "no", unknown: "unknown", "n/a": "n/a" } as const;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines: string[] = [];
const t = inv.totals;
lines.push(`Snapshot ${inv.generatedAt}, catalogue version ${inv.version}, demo sign-off ${inv.demoSignOff ? "on" : "off"} where this ran.`, "");
lines.push("| Count | n |", "| --- | --- |");
for (const [k, v] of [
  ["Found in code (catalogued + deliberately excluded)", t.found],
  ["Catalogued", t.catalogued],
  ["Registered", t.registered],
  ["Authorable (in an editor)", t.authorable],
  ["AI-ready (Magazine builder can recommend and configure)", t.aiReady],
  ["AI recommended only (specialist setup)", t.aiRecommend],
  ["Tracked (events or attempts recorded)", t.tracked],
  ["Published or live (Magazine: not a demo edition)", t.published],
  ["Promotable", t.promotable],
  ["Broken", t.broken],
  ["Orphaned (registered block in no course or draft)", t.orphaned],
  ["Needs attention", t.attention],
  ["Intentionally excluded", t.excluded],
] as [string, number][])
  lines.push(`| ${k} | ${v} |`);
lines.push(
  "",
  `By kind: ${Object.entries(t.byKind)
    .map(([k, n]) => `${ACTIVITY_KINDS[k as keyof typeof ACTIVITY_KINDS]} ${n}`)
    .join(", ")}.`,
  "",
);
const keys = Object.keys(CHECKS) as CheckKey[];
lines.push(
  `| id | Name | Kind | Surfaces | AI selection | ${keys.map((k) => CHECKS[k]).join(" | ")} | Approval | Sample | Renderer / schema | Blocker or exclusion reason |`,
  `| ${["---", "---", "---", "---", "---", ...keys.map(() => "---"), "---", "---", "---", "---"].join(" | ")} |`,
);
for (const r of inv.rows)
  lines.push(
    `| ${cell(r.id)} | ${cell(r.name)} | ${ACTIVITY_KINDS[r.kind]} | ${r.surfaces.map((s) => SURFACES[s]).join(", ")} | ${AI_MODES[r.ai.mode].label} | ${keys
      .map((k) => S[r.checks[k].state])
      .join(
        " | ",
      )} | ${APPROVAL[r.approval]} | ${r.sample ? cell(r.sample.href) : ""} | src/${cell(r.renderer)}${r.schema ? `, src/${cell(r.schema)}` : ""} | ${cell(
      [...r.attention, r.ai.mode === "configurable" ? "" : r.ai.reason].filter(Boolean).join(" "),
    )} |`,
  );
lines.push("", "Excluded:", "");
for (const x of inv.excluded) lines.push(`- **${x.name}** (${x.where}): ${x.reason}`);
if (inv.testCourses.length) lines.push("", `Test courses published to learners: ${inv.testCourses.map((c) => c.slug).join(", ")}.`);
if (inv.broken.length) lines.push("", `Published courses that don't read: ${inv.broken.map((b) => `${b.slug} (${b.problem})`).join("; ")}.`);

const md = lines.join("\n");
if (outFile) fs.writeFileSync(outFile, md);
else console.log(md);
db.close();
fs.rmSync(copy, { force: true });
