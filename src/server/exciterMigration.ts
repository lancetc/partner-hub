import "server-only";
import type { Db } from "./db";
import type { User } from "./auth";
import { HttpError } from "./auth";
import { chaptersFor, slugsFor, updateLearningPath, overview, type PathInput } from "./learningPaths";
import { seedOutcome, storedExciter, type SeedResult } from "./pathExciterStore";
import { ALIS_PARTS } from "@/content/alisCourse";
import { DISCOVERY_EXCITER_SEEDS, DISCOVERY_PATH_DESCRIPTIONS, SPOKEN_DESCRIPTIONS, SPOKEN_SIRS_DESCRIPTIONS } from "@/content/discoveryExciters";
import { exciterWarnings, EXCITER_WORDS } from "@/lib/pathExciter";
import { wordCount } from "@/lib/magazineNarration";

/*
  Moving the existing Discovery Paths to the Discovery Exciter (docs/discovery-exciter.md, Nov 2026). For each path:
  its spoken script becomes a draft Exciter (rewritten by hand into the Exciter's shape: content/discoveryExciters.ts,
  and ALIS_PARTS[].intro for the SIRS paths), and its original short description comes back. Both go through the
  existing updateLearningPath, which is given the path's own saved fields so nothing else changes; the report checks
  that, field by field. No audio is made and nothing is approved.

  Idempotent: a description is restored only over the spoken one it replaced (or is left when it's already the
  original), and an Exciter is seeded only where there isn't one (server/pathExciterStore). A description that's been
  rewritten since, a path that's missing, or a live path with no seed is reported for a person to look at.
*/

type Row = {
  id: string;
  name: string;
  description: string;
  audience: string;
  in_order: number;
  allow_skip: number;
  who_for: string;
  who_photo: string | null;
  outcomes: string;
  reward: string;
  quiz: string | null;
  archived: number;
};

export type MigrationLine = {
  id: string;
  name: string;
  /** "restored": the description goes back to the original; "already": it is the original; "kept": it was rewritten since, left alone. */
  description: "restored" | "already" | "kept" | "missing";
  exciter: SeedResult | "missing";
  words: number;
  warnings: string[];
  /** Fields other than the description that the update changed (should be none). */
  changed: string[];
  applied: boolean;
};
export type MigrationReport = { lines: MigrationLine[]; updated: number; unchanged: number; exceptions: string[] };

/** The 14 paths this migrates: the 11 with seeds by id, and the three SIRS paths by name. */
export function migrationTargets(db: Db) {
  const sirs = ALIS_PARTS.map((p) => {
    const row = db.prepare("SELECT id FROM learning_paths WHERE name = ? AND archived = 0 ORDER BY created_at LIMIT 1").get(p.title) as
      { id: string } | undefined;
    return { id: row?.id ?? null, name: p.title, seed: p.intro, original: p.description, spoken: SPOKEN_SIRS_DESCRIPTIONS[p.title] ?? null };
  });
  const others = Object.keys(DISCOVERY_EXCITER_SEEDS).map((id) => ({
    id,
    name: id,
    seed: DISCOVERY_EXCITER_SEEDS[id],
    original: DISCOVERY_PATH_DESCRIPTIONS[id],
    spoken: SPOKEN_DESCRIPTIONS[id] ?? null,
  }));
  return [...others, ...sirs];
}

/** Everything about a path except its description, the Exciter and when it was updated: what the migration mustn't change. */
function fieldsOf(db: Db, id: string) {
  const r = db.prepare("SELECT * FROM learning_paths WHERE id = ?").get(id) as Row;
  return {
    name: r.name,
    audience: r.audience,
    in_order: r.in_order,
    allow_skip: r.allow_skip,
    who_for: r.who_for,
    who_photo: r.who_photo,
    outcomes: r.outcomes,
    reward: r.reward,
    quiz: r.quiz,
    archived: r.archived,
    lessons: slugsFor(db, id),
    chapters: chaptersFor(db, id),
  };
}

/** The path's saved fields as updateLearningPath takes them, with a new description and an Exciter seed. */
function inputFrom(db: Db, r: Row, description: string, seed: string): PathInput {
  // The row is the whole stored path (SELECT *); overview reads its overview fields.
  const o = overview(r as Parameters<typeof overview>[0]);
  const chapters = chaptersFor(db, r.id);
  return {
    name: r.name,
    description,
    audience: r.audience,
    inOrder: Boolean(r.in_order),
    allowSkip: Boolean(r.allow_skip),
    whoFor: o.whoFor,
    whoPhoto: o.whoPhoto,
    outcomes: o.outcomes,
    reward: o.reward,
    quiz: o.quiz,
    lessons: slugsFor(db, r.id),
    ...(chapters.length && { chapters }),
    exciterSeed: seed,
  };
}

/** Runs the migration on this database (a copy, for a dry run). */
export function migrateDiscoveryExciters(db: Db, actor: User, now: Date): MigrationReport {
  const lines: MigrationLine[] = [];
  const exceptions: string[] = [];
  const targets = migrationTargets(db);
  for (const t of targets) {
    const row = t.id ? (db.prepare("SELECT * FROM learning_paths WHERE id = ? AND archived = 0").get(t.id) as Row | undefined) : undefined;
    const words = wordCount(t.seed);
    const warnings = exciterWarnings(t.seed, t.original ?? "");
    if (!row || !t.original) {
      exceptions.push(`${t.name}: the path isn’t in this database (or has no original description on file), so it was skipped.`);
      lines.push({ id: t.id ?? "", name: t.name, description: "missing", exciter: "missing", words, warnings, changed: [], applied: false });
      continue;
    }
    if (words < EXCITER_WORDS.min || words > EXCITER_WORDS.max) exceptions.push(`${row.name}: the seeded Exciter is ${words} words (aim for 70 to 130).`);
    const current = (row.description ?? "").trim();
    const description: MigrationLine["description"] = current === t.original.trim() ? "already" : t.spoken && current === t.spoken.trim() ? "restored" : "kept";
    if (description === "kept")
      exceptions.push(
        `${row.name}: its description isn’t the spoken script it had on 24 Nov (it’s been edited since), so it was left as it is. Check it reads as a short summary.`,
      );
    const exciter = seedOutcome(storedExciter(db, row.id), t.seed);
    if (exciter === "kept") exceptions.push(`${row.name}: it already has an Exciter an author has worked on, so the seed wasn’t written.`);
    const before = JSON.stringify(fieldsOf(db, row.id));
    let applied = false;
    let changed: string[] = [];
    if (description === "restored" || exciter === "created" || exciter === "replaced") {
      try {
        updateLearningPath(db, actor, row.id, inputFrom(db, row, description === "restored" ? t.original : row.description, t.seed), now);
        applied = true;
        const after = fieldsOf(db, row.id);
        const was = JSON.parse(before) as Record<string, unknown>;
        changed = Object.keys(after).filter((k) => JSON.stringify((after as Record<string, unknown>)[k]) !== JSON.stringify(was[k]));
        if (changed.length) exceptions.push(`${row.name}: saving also changed ${changed.join(", ")}. Check the path.`);
      } catch (e) {
        exceptions.push(`${row.name}: couldn’t be updated (${e instanceof HttpError ? e.message : String(e)}).`);
      }
    }
    lines.push({ id: row.id, name: row.name, description, exciter, words, warnings, changed, applied });
  }
  // Live paths this doesn't cover: they need a script from the Manager's "Generate missing scripts".
  const covered = new Set(lines.map((l) => l.id));
  for (const p of db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { id: string; name: string }[])
    if (!covered.has(p.id) && !storedExciter(db, p.id))
      exceptions.push(`${p.name} (${p.id}): not part of this migration and has no Exciter yet. Use Generate missing scripts in the Manager.`);
  return {
    lines,
    updated: lines.filter((l) => l.applied).length,
    unchanged: lines.filter((l) => !l.applied && l.description !== "missing").length,
    exceptions,
  };
}
