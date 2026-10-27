/*
  Checks the draft lessons in ./lessons and saves them to the hub as unpublished drafts (like the
  editor's first save), adding any missing shared facts. Run: node drafts/load.mjs [--check]
  Re-running replaces those drafts' content; published lessons are never touched.
*/
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FACTS } from "./lessons/lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes("--check");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// Optional filters: `node load.mjs --check 04-` checks only files starting with 04-.
const files = readdirSync(path.join(here, "lessons"))
  .filter((f) => /^\d.*\.mjs$/.test(f))
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)))
  .sort();
const db = new DatabaseSync(path.join(here, "..", "data", "hub.sqlite"));
// Extra shared facts, one file per group of lessons (facts-*.mjs), so lessons can be written in parallel.
for (const f of readdirSync(path.join(here, "lessons")).filter((n) => /^facts-.*\.mjs$/.test(n)).sort())
  FACTS.push(...(await import(path.join(here, "lessons", f))).FACTS);
const known = new Set([...FACTS.map((f) => f.key), ...db.prepare("SELECT key FROM facts").all().map((r) => r.key)]);

const ICONS = ["clock", "shield", "heart", "leaf", "chat", "home", "spark", "doc", "people", "sun", "route", "book"];
const ANSWER = ["quiz", "decision", "poll", "rating", "written", "response", "hotspot", "checklist", "wall"];
function check(l) {
  const errs = [];
  const ids = Object.keys(l.nodes);
  const targets = (c) => [c.next, ...(c.type === "decision" ? c.options.map((o) => o.next) : [])].filter(Boolean);
  for (const c of Object.values(l.nodes)) {
    if (!(c.beat >= 0 && c.beat < l.beats.length)) errs.push(`${c.id}: beat ${c.beat} out of range`);
    for (const k of ["label", "heading", "body"]) if (typeof c[k] !== "string") errs.push(`${c.id}: missing ${k}`);
    for (const t of targets(c)) if (!l.nodes[t]) errs.push(`${c.id}: goes to missing card ${t}`);
    if (c.type === "decision") {
      if (!c.options.some((o) => o.correct)) errs.push(`${c.id}: no better choice starred`);
      for (const o of c.options) if (!o.next && !o.stay) errs.push(`${c.id}.${o.id}: neither next nor stay`);
      for (const o of c.options) if (o.stay && !o.feedback) errs.push(`${c.id}.${o.id}: stay without feedback`);
    }
    if (c.type === "quiz") for (const q of c.questions) if (!q.options.some((o) => o.id === q.correct)) errs.push(`${c.id}.${q.id}: correct answer missing`);
    if (c.type !== "summary" && c.type !== "decision" && !c.next) errs.push(`${c.id}: dead end (no next)`);
    const icons = [c.visual?.icon, ...(c.keyPoints?.items ?? []).map((i) => i.icon)].filter(Boolean);
    for (const i of icons) if (!ICONS.includes(i)) errs.push(`${c.id}: icon "${i}" isn't available for card art`);
    for (const tok of JSON.stringify(c).matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)) if (!known.has(tok[1])) errs.push(`${c.id}: unknown fact ${tok[1]}`);
  }
  // Every card reachable from the start.
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id) || !l.nodes[id]) return;
    seen.add(id);
    targets(l.nodes[id]).forEach(walk);
  };
  walk(l.start);
  for (const id of ids) if (!seen.has(id)) errs.push(`${id}: can't be reached`);
  if (l.nodes[l.completion.cardId]?.type !== "quiz") errs.push("completion card isn't a quiz");
  for (let b = 0; b < l.beats.length; b++) if (!Object.values(l.nodes).some((c) => c.beat === b)) errs.push(`beat ${b} "${l.beats[b]}" has no cards`);
  // Deepest chain of Role Play choices on one path.
  const depth = (id, stack = []) => {
    if (!l.nodes[id] || stack.includes(id)) return 0;
    const c = l.nodes[id];
    const here = c.type === "decision" ? 1 : 0;
    return here + Math.max(0, ...targets(c).map((t) => depth(t, [...stack, id])));
  };
  const d = depth(l.start);
  if (d < 2) errs.push(`role play branching only ${d} level deep`);
  const types = [...new Set(Object.values(l.nodes).map((c) => c.type))];
  return { errs, depth: d, cards: ids.length, types, answer: Object.values(l.nodes).filter((c) => ANSWER.includes(c.type)).length };
}

let failed = false;
const lessonsOut = [];
for (const f of files) {
  const l = (await import(path.join(here, "lessons", f))).default;
  const r = check(l);
  console.log(`${f}: ${l.title} · ${r.cards} cards · role play depth ${r.depth} · ${r.answer} interactive · ${r.types.join(", ")}`);
  for (const e of r.errs) console.log(`   ✗ ${e}`);
  if (r.errs.length) failed = true;
  lessonsOut.push(l);
}
if (failed) process.exit(1);
if (checkOnly) process.exit(0);

const now = new Date().toISOString();
for (const f of FACTS)
  db.prepare(
    "INSERT OR IGNORE INTO facts (key, label, value, notes, source_title, source_url, owner, check_by, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'jordan')",
  ).run(f.key, f.label, f.value, f.notes ?? "", f.sourceTitle, f.source, f.owner, f.checkBy, now);
for (const l of lessonsOut) {
  const row = db.prepare("SELECT published FROM authored_lessons WHERE slug = ?").get(l.slug);
  if (row?.published) {
    console.log(`skipped ${l.slug}: already published, edit it in the editor instead`);
    continue;
  }
  db.prepare(
    `INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at) VALUES (?, ?, NULL, 'jordan', ?, 'jordan', ?)
     ON CONFLICT(slug) DO UPDATE SET draft = excluded.draft, updated_at = excluded.updated_at, deleted_at = NULL`,
  ).run(l.slug, JSON.stringify(l), now, now);
  console.log(`saved draft ${l.slug}`);
}
